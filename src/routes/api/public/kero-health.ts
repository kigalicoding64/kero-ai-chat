// Public health endpoint for the Kero backend.
// Reports the real state of the server runtime and of the AI provider.
// It never returns secrets, tokens, keys or internal system details.

import { createFileRoute } from "@tanstack/react-router";

type HealthStatus = "connected" | "degraded" | "error";

interface HealthPayload {
  status: HealthStatus;
  provider: string;
  configured: boolean;
  backend: "ok" | "misconfigured";
  checkedAt: string;
  reason?: string;
}

const UPSTREAM_TIMEOUT_MS = 8_000;
const CACHE_MS = 30_000;
let cache: { at: number; payload: HealthPayload } | undefined;

function corsHeaders(origin: string | null) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "cache-control": "no-store",
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type",
  };
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

async function buildPayload(): Promise<HealthPayload> {
  const checkedAt = new Date().toISOString();
  const supabaseConfigured = Boolean(
    process.env["SUPABASE_URL"] && process.env["SUPABASE_PUBLISHABLE_KEY"],
  );

  const { getProvider } = await import("@/lib/ai/providers/registry.server");
  const info = getProvider().describe();

  if (!supabaseConfigured) {
    return {
      status: "error",
      provider: info.id,
      configured: info.configured,
      backend: "misconfigured",
      checkedAt,
      reason: "Backend configuration error: server Supabase variables are missing.",
    };
  }

  if (!info.configured) {
    return {
      status: "error",
      provider: info.id,
      configured: false,
      backend: "ok",
      checkedAt,
      reason: "The AI provider key is not configured on this deployment.",
    };
  }

  // Verify the provider for real, with a hard timeout.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const { NVIDIA_BASE_URL } = await import("@/lib/ai/providers/nvidia.server");
    const res = await fetch(`${NVIDIA_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${process.env["NVIDIA_API_KEY"]}` },
      signal: controller.signal,
    });
    if (res.ok) {
      return { status: "connected", provider: info.id, configured: true, backend: "ok", checkedAt };
    }
    return {
      status: res.status === 401 || res.status === 403 ? "error" : "degraded",
      provider: info.id,
      configured: true,
      backend: "ok",
      checkedAt,
      reason:
        res.status === 401 || res.status === 403
          ? "The AI provider rejected this deployment's credentials."
          : "The AI provider is currently unavailable.",
    };
  } catch {
    return {
      status: "degraded",
      provider: info.id,
      configured: true,
      backend: "ok",
      checkedAt,
      reason: "The AI provider did not respond in time.",
    };
  } finally {
    clearTimeout(timer);
  }
}

export const Route = createFileRoute("/api/public/kero-health")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) }),
      GET: async ({ request }) => {
        const origin = request.headers.get("origin");
        const now = Date.now();
        if (!cache || now - cache.at > CACHE_MS) {
          cache = { at: now, payload: await buildPayload() };
        }
        const payload = cache.payload;
        return new Response(JSON.stringify(payload), {
          status: payload.backend === "misconfigured" ? 503 : 200,
          headers: corsHeaders(origin),
        });
      },
    },
  },
});
