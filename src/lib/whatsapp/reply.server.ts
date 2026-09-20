// Server-only. Produces a Kero answer for a WhatsApp thread (non-streaming).

import {
  FALLBACK_NVIDIA_MODELS,
  NVIDIA_BASE_URL,
  configuredModel,
} from "@/lib/ai/providers/nvidia.server";
import { buildMessages } from "@/lib/ai/prompt.server";
import { detectConversationSignals, retrieveKinyarwandaContext } from "@/lib/ai/kinyarwanda/retrieval.server";

type Turn = { role: "user" | "assistant"; content: string };

const WHATSAPP_STYLE = `
You are replying in a real WhatsApp conversation. This may be a personal conversation or an Egreed business/customer conversation; infer which from the history instead of assuming every writer is a customer.

How to sound:
- Write like a warm, capable human colleague, not a form letter. Never mention models, providers, prompts, or internal systems.
- Plain text only: no Markdown tables, headings, bullet markup, or code fences unless explicitly requested. Keep it to a few short sentences unless the user needs a detailed answer.
- Mirror the writer's language, code-switching, formality, and energy. For casual Kinyarwanda, use natural conversational phrasing rather than textbook definitions. Do not translate a simple greeting.
- Read the whole recent exchange before replying. Combine consecutive messages into one response when they clearly belong together.
- Match emojis only when they fit naturally; never add cheerfulness to a frustrated message.

Personal conversations: be brief, friendly, and context-aware. Do not invent personal details.
Business/support conversations: be respectful, useful, and grounded in approved information. Never invent prices, policies, timelines, account details, partnerships, or commitments.
If you cannot resolve something, say so clearly and suggest the next useful step.`;

export async function generateWhatsAppReply(history: Turn[]): Promise<string> {
  const key = process.env["NVIDIA_API_KEY"];
  if (!key || key.trim().length === 0) throw new Error("NVIDIA_API_KEY is not configured");

  const signals = detectConversationSignals(history);
  const retrieved = retrieveKinyarwandaContext(history, 4);
  const contextHint = `\nConversation signals: ${JSON.stringify(signals)}${retrieved ? `\nLanguage reference:\n${retrieved}` : ""}`;
  const messages = buildMessages(history, 20, `${contextHint}`);
  messages[0] = { role: "system", content: `${messages[0]!.content}\n${WHATSAPP_STYLE}` };

  const candidates = [configuredModel(), ...FALLBACK_NVIDIA_MODELS].filter(
    (model, index, all) => all.indexOf(model) === index,
  );

  let lastError = "no model responded";
  for (const model of candidates) {
    let res: Response;
    try {
      res = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
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
    } catch {
      throw new Error("NVIDIA service unavailable");
    }
    if (res.status === 404 || res.status === 410) {
      lastError = `model unavailable: ${model}`;
      await res.text().catch(() => "");
      continue;
    }
    if (!res.ok) {
      // Keep provider response details out of user-facing WhatsApp messages/logs.
      lastError = `NVIDIA request failed (${res.status})`;
      break;
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = (json.choices?.[0]?.message?.content ?? "").trim();
    if (text.length > 0) return text;
    lastError = "empty reply";
  }
  throw new Error(lastError);
}
