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

  const { getActiveProvider } = await import("@/lib/ai/providers/registry.server");
  let provider;
  try { provider = await getActiveProvider(); }
  catch { return {status:'error',provider:'unavailable',configured:false,backend:'misconfigured',checkedAt,reason:'AI settings could not be loaded.'}; }
  const info = provider.describe();

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
    const models = await provider.listModels(controller.signal);
    if (models.includes(info.model)) {
      return { status: "connected", provider: info.id, configured: true, backend: "ok", checkedAt };
    }
    return {
      status: 'degraded',
      provider: info.id,
      configured: true,
      backend: "ok",
      checkedAt,
      reason: 'The configured model is not listed for this provider.',
    };
  } catch {
    return {
      status: "degraded",
      provider: info.id,
      configured: true,
      backend: "ok",
      checkedAt,
      reason: "The AI provider connection could not be verified.",
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
