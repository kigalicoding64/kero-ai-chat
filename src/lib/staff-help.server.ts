// Server-only: probe the EGREED relays for a failed staff command, then ask Lovable AI for fixes.
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

const URLS = () => [...new Set([process.env["EGREED_RELAY_URL"] || "https://egreed-hostel-os.lovable.app/api/public/whatsapp/relay", "https://egreed-hostel-os.vercel.app/api/public/whatsapp/relay"])];

export async function probeRelays(phone: string, text: string) {
  const secret = process.env["EGREED_RELAY_SECRET"] || "";
  return Promise.all(URLS().map(async (url) => {
    const started = Date.now();
    if (!secret) return { url, status: 0, ms: 0, detail: "EGREED_RELAY_SECRET is not set on Kero." };
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-Relay-Secret": secret }, body: JSON.stringify({ phone, text }), signal: AbortSignal.timeout(5000) });
      const body = (await res.text()).replace(/"reply"\s*:\s*"[^"]*"/, '"reply":"(hidden)"').slice(0, 300);
      return { url, status: res.status, ms: Date.now() - started, detail: body || "(empty body)" };
    } catch (e) { return { url, status: 0, ms: Date.now() - started, detail: e instanceof Error ? e.message : "network error" }; }
  }));
}

export async function analyzeFailure(command: string, note: string, probes: Awaited<ReturnType<typeof probeRelays>>) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI analysis is not configured on this host.");
  const openai = createOpenAI({ baseURL: "https://ai.gateway.lovable.dev/v1", apiKey, headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" } });
  const result = streamText({
    model: openai.responses("openai/gpt-6-astra"),
    maxRetries: 0,
    providerOptions: { openai: { forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] } },
    system: "You help hotel staff fix why an EGREED WhatsApp staff command failed. Kero forwards commands to the EGREED relay (Lovable first, Vercel backup) with an X-Relay-Secret header. Using ONLY the probe results, give a short diagnosis and 3-5 numbered, concrete fixes in plain language (e.g. 401 = secrets do not match on both apps; 503 = relay secret missing in that hotel app; 500 = hotel app crashed, check its logs/database settings; timeout = app slow or down). Never invent values or secrets.",
    prompt: `Command: ${command}\nStaff note: ${note || "(none)"}\nProbe results:\n${JSON.stringify(probes, null, 2)}`,
  });
  return (await result.text).trim();
}
