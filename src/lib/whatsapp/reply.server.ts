// Server-only. Produces a Kero answer for a WhatsApp thread (non-streaming).

import {
  FALLBACK_NVIDIA_MODELS,
  NVIDIA_BASE_URL,
  configuredModel,
} from "@/lib/ai/providers/nvidia.server";
import { buildMessages } from "@/lib/ai/prompt.server";

const WHATSAPP_STYLE = `
You are answering over WhatsApp. Keep replies short and conversational: at most a
few sentences, no Markdown tables, no headings, no code fences unless code was
explicitly requested. Plain text only.`;

export async function generateWhatsAppReply(
  history: { role: "user" | "assistant"; content: string }[],
): Promise<string> {
  const key = process.env["NVIDIA_API_KEY"];
  if (!key || key.trim().length === 0) throw new Error("NVIDIA_API_KEY is not configured");

  const messages = buildMessages(history, 20);
  messages[0] = { role: "system", content: `${messages[0]!.content}\n${WHATSAPP_STYLE}` };

  const candidates = [configuredModel(), ...FALLBACK_NVIDIA_MODELS].filter(
    (model, index, all) => all.indexOf(model) === index,
  );

  let lastError = "no model responded";
  for (const model of candidates) {
    const res = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key.trim()}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        temperature: 0.6,
        top_p: 0.95,
        max_tokens: 700,
        chat_template_kwargs: { thinking: false },
      }),
    });
    if (res.status === 404 || res.status === 410) {
      lastError = `model unavailable: ${model}`;
      await res.text().catch(() => "");
      continue;
    }
    if (!res.ok) {
      lastError = `${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`;
      break;
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = (json.choices?.[0]?.message?.content ?? "").trim();
    if (text.length > 0) return text;
    lastError = "empty reply";
  }
  throw new Error(lastError);
}
