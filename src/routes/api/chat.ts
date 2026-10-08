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

        const { getActiveProvider } = await import("@/lib/ai/providers/registry.server");
        const { buildMessages } = await import("@/lib/ai/prompt.server");
        let provider;
        try { provider = await getActiveProvider(); }
        catch { return errorResponse(503, 'settings_unavailable', 'Kero’s AI settings could not be loaded. Please try again.'); }
        const info = provider.describe();

        if (!provider.describe().configured) {
          return errorResponse(
            503,
            "missing_api_key",
            `Kero is not connected to ${info.label} yet. Ask an administrator to add its API key in settings.`,
          );
        }

        const { configuredModel, FALLBACK_NVIDIA_MODELS } = await import(
          "@/lib/ai/providers/nvidia.server"
        );
        // A deployment can be pinned (via NVIDIA_MODEL) to a model NVIDIA has
        // retired — that answers 404/410. Try the known-good models in order.
        const candidates = info.id === 'gemini' ? [info.model] : [
          ...(parsed.model ? [parsed.model] : [configuredModel()]),
          ...FALLBACK_NVIDIA_MODELS,
        ].filter((model, index, all) => all.indexOf(model) === index);

        const messages = buildMessages(parsed.messages);
        let upstream: Response | undefined;
        for (const model of candidates) {
          try {
            upstream = await provider.streamChat({ messages, model, signal: request.signal });
          } catch (error) {
            if (request.signal.aborted) return new Response(null, {status:499});
            return errorResponse(502, "upstream_unreachable", `Could not reach ${info.label}.`);
          }
          if (upstream.ok && upstream.body) break;
          if (info.id !== 'nvidia' || (upstream.status !== 404 && upstream.status !== 410)) break;
          console.error(`[chat] model unavailable (${upstream.status}): ${model}`);
          await upstream.text().catch(() => "");
        }
        if (!upstream) {
          return errorResponse(502, "upstream_unreachable", `Could not reach ${info.label}.`);
        }

        if (!upstream.ok || !upstream.body) {
          await upstream.body?.cancel();
          const message =
            upstream.status === 401 || upstream.status === 403
              ? `${info.label} rejected this request. Ask an administrator to check credentials and access.`
              : upstream.status === 429
                ? `${info.label} is rate limiting requests. Please retry in a moment.`
                : upstream.status === 404 || upstream.status === 410
                  ? `The configured model is unavailable from ${info.label}. Ask an administrator to check model access.`
                  : `${info.label} returned an error (${upstream.status}).`;
          return errorResponse(upstream.status === 403 ? 403 : upstream.status === 429 ? 429 : 502, "upstream_error", message);
        }

        return new Response(upstream.body, {
          status: 200,
          headers: {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-cache, no-transform",
            connection: "keep-alive",
          },
        });
      },
    },
  },
});
