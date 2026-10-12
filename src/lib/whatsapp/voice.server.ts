// Server-only. Downloads a WhatsApp voice note through the connector gateway and
// transcribes it with Gemini (audio understanding). Keys never leave the server.

import { readProviderKey, readSettings, envGeminiModel } from "@/lib/ai/provider-settings.server";
import { DEFAULT_GEMINI_MODEL, GEMINI_FALLBACK_MODELS } from "@/lib/ai/providers/gemini.server";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/whatsapp";
const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

function gatewayHeaders() {
  const lovable = process.env["LOVABLE_API_KEY"];
  const connection = process.env["WHATSAPP_API_KEY"];
  if (!lovable || !connection) throw new Error("WhatsApp gateway credentials missing");
  return { Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": connection };
}

export async function geminiKey() {
  const settings = await readSettings().catch(() => null);
  return { key: await readProviderKey("gemini", settings), model: settings?.gemini_model || envGeminiModel() || DEFAULT_GEMINI_MODEL };
}

/** Fetches the audio bytes for a WhatsApp media id. */
export async function downloadWhatsAppMedia(mediaId: string): Promise<{ data: ArrayBuffer; mime: string }> {
  const headers = gatewayHeaders();
  const meta = await fetch(`${GATEWAY_URL}/media/${encodeURIComponent(mediaId)}`, { headers, signal: AbortSignal.timeout(15_000) });
  if (!meta.ok) throw new Error(`media lookup failed (${meta.status})`);
  const info = (await meta.json()) as { url?: string; mime_type?: string; file_size?: number };
  if (!info.url) throw new Error("media url missing");
  if (info.file_size && info.file_size > MAX_AUDIO_BYTES) throw new Error("voice note too large");
  const mime = (info.mime_type || "audio/ogg").split(";")[0]!.trim();

  const res = await fetch(`${GATEWAY_URL}/media_download`, {
    headers: { ...headers, "X-WhatsApp-Media-URL": info.url },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok || !res.body) {
    await res.body?.cancel().catch(() => {});
    throw new Error(`media download failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_AUDIO_BYTES) { await reader.cancel().catch(() => {}); throw new Error("voice note too large"); }
    chunks.push(value);
  }
  if (total === 0) throw new Error("media download empty");
  const data = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { data.set(c, offset); offset += c.byteLength; }
  return { data: data.buffer, mime };
}

function toBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Transcribes speech exactly in the spoken language (Kinyarwanda, English, French, Swahili...). */
export async function transcribeVoiceNote(audio: { data: ArrayBuffer; mime: string }): Promise<string> {
  const { key, model } = await geminiKey();
  if (!key) throw new Error("Gemini key not configured");
  const body = JSON.stringify({
    contents: [{
      role: "user",
      parts: [
        { text: "Transcribe this WhatsApp voice note word for word in the language spoken (it may be Kinyarwanda, English, French, Swahili or mixed). Return only the transcript. If there is no speech, return exactly: [no speech]" },
        { inline_data: { mime_type: audio.mime, data: toBase64(audio.data) } },
      ],
    }],
  });
  for (const candidate of [...new Set([model, ...GEMINI_FALLBACK_MODELS])]) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${candidate}:generateContent`, {
      method: "POST", body, signal: AbortSignal.timeout(45_000),
      headers: { "x-goog-api-key": key, "content-type": "application/json" },
    });
    if (res.status === 429 || res.status >= 500 || res.status === 404) { await res.body?.cancel().catch(() => {}); continue; }
    if (!res.ok) throw new Error(`transcription failed (${res.status})`);
    const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";
    if (!text || text === "[no speech]") return "";
    return text;
  }
  throw new Error("transcription unavailable");
}
