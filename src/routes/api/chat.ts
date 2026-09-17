import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const BodySchema = z.object({
  conversationId: z.string().uuid().optional(),
  model: z.string().max(200).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(24000),
      }),
    )
    .min(1)
    .max(100),
});

function errorResponse(status: number, code: string, message: string) {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authenticateRequest } = await import("@/lib/api-auth.server");
        const auth = await authenticateRequest(request);
        if (!auth) return errorResponse(401, "unauthorized", "Please sign in again.");

        let parsed;
        try {
          parsed = BodySchema.parse(await request.json());
        } catch {
          return errorResponse(400, "bad_request", "Invalid request body.");
        }

        const { getProvider } = await import("@/lib/ai/providers/registry.server");
        const { buildMessages } = await import("@/lib/ai/prompt.server");
        const provider = getProvider();

        if (!provider.describe().configured) {
          return errorResponse(
            503,
            "missing_api_key",
            "Kero is not connected to NVIDIA yet. Add the NVIDIA_API_KEY secret to enable replies.",
          );
        }

        const { configuredModel, FALLBACK_NVIDIA_MODELS } = await import(
          "@/lib/ai/providers/nvidia.server"
        );
        // A deployment can be pinned (via NVIDIA_MODEL) to a model NVIDIA has
        // retired — that answers 404/410. Try the known-good models in order.
        const candidates = [
          ...(parsed.model ? [parsed.model] : [configuredModel()]),
          ...FALLBACK_NVIDIA_MODELS,
        ].filter((model, index, all) => all.indexOf(model) === index);

        const messages = buildMessages(parsed.messages);
        let upstream: Response | undefined;
        for (const model of candidates) {
          try {
            upstream = await provider.streamChat({ messages, model, signal: request.signal });
          } catch (error) {
            console.error("[chat] upstream request failed", error);
            return errorResponse(502, "upstream_unreachable", "Could not reach the NVIDIA service.");
          }
          if (upstream.ok && upstream.body) break;
          if (upstream.status !== 404 && upstream.status !== 410) break;
          console.error(`[chat] model unavailable (${upstream.status}): ${model}`);
          await upstream.text().catch(() => "");
        }
        if (!upstream) {
          return errorResponse(502, "upstream_unreachable", "Could not reach the NVIDIA service.");
        }

        if (!upstream.ok || !upstream.body) {
          const detail = (await upstream.text().catch(() => "")).slice(0, 500);
          console.error("[chat] upstream error", upstream.status, detail);
          const message =
            upstream.status === 401 || upstream.status === 403
              ? "The NVIDIA API key was rejected. Check the key and try again."
              : upstream.status === 429
                ? "NVIDIA is rate limiting requests. Please retry in a moment."
                : upstream.status === 404 || upstream.status === 410
                  ? "The configured AI model is no longer available from NVIDIA. Update the model setting and try again."
                  : `NVIDIA returned an error (${upstream.status}).`;
          return errorResponse(upstream.status === 429 ? 429 : 502, "upstream_error", message);
        }

        return new Response(upstream.body, {
          status: 200,
          headers: {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-store",
            connection: "keep-alive",
          },
        });
      },
    },
  },
});
