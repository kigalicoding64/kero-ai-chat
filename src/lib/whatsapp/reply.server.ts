// Server-only. Produces a Kero answer for a WhatsApp thread (non-streaming).

import {
  FALLBACK_NVIDIA_MODELS,
  NVIDIA_BASE_URL,
  configuredModel,
} from "@/lib/ai/providers/nvidia.server";
import { buildMessages } from "@/lib/ai/prompt.server";

const WHATSAPP_STYLE = `
You are now answering on WhatsApp, on +250794433166, the official support line of
Egreed Technology. Every person writing here is a real customer, and you are the
support agent on duty — day and night.

How to sound:
- Write like a warm, competent human colleague, not a form letter. Contractions,
  natural rhythm, occasional short sentences. Never say you are an AI unless asked
  directly; never mention models, providers or internal systems.
- Plain text only: no Markdown tables, no headings, no bullets markup, no code
  fences unless code was explicitly requested. A few short sentences at most.
- Mirror the writer's language exactly (English, Kinyarwanda, French, Swahili or a
  mix) and their level of formality.

Read the mood before you answer:
- Angry or frustrated: acknowledge the problem in the first sentence, no excuses,
  then the concrete next step. No cheerfulness, no emoji.
- Worried or confused: slow down, reassure, one clear step at a time.
- Neutral or transactional: be brief and precise, answer and stop.
- Happy or joking: match the lightness briefly, stay useful.
- Urgent: lead with the fastest action they can take right now.

Always: greet by name if you know it, answer the actual question, and if you truly
cannot resolve it, say a human from Egreed Technology will follow up — never invent
prices, policies, timelines or account details.`;

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
