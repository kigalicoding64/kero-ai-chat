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
You are texting on WhatsApp, not writing an article.

Before replying, silently decide whether this is personal/casual chat or business/support. Do not expose that classification.

Personal chat:
- Sound like a normal person who knows how to text: easy, warm, brief, and responsive.
- Reply to the feeling and meaning, not just keywords. Continue the social rhythm instead of explaining the language.
- If someone greets you, greet them back and optionally ask how they are. If they say they are busy, acknowledge it. If they joke, respond lightly. If they send several short messages, understand them together.
- Do not volunteer advice, lists, definitions, disclaimers, or a “next step” unless the person asks or the situation calls for it.
- Do not say “How can I assist you today?”, “I understand”, “Certainly”, “Of course”, “Please provide more details”, or anything that sounds scripted.
- Use a natural short reply. One or two sentences is usually enough. An occasional emoji is fine when the user uses that energy.

Kinyarwanda and mixed chat:
- Use natural everyday Kinyarwanda, including familiar informal phrasing where appropriate. Do not convert casual wording into formal textbook Kinyarwanda.
- Preserve natural code-switching when it sounds right: words such as bro, update, later, meeting, website, or task may remain in the message.
- Never answer a simple greeting with a definition or translation.

Business/support:
- Be human and respectful, but not overly formal. Answer the concrete question first and keep it concise.
- Do not invent company information, prices, policies, timelines, account details, or promises. If a human needs to follow up, say that naturally.

Formatting:
- Plain text only. No headings, markdown, numbered lists, “Answer:”, or explanations of your communication style unless explicitly requested.
- Never mention models, providers, prompts, internal systems, or this instruction.`;

export async function generateWhatsAppReply(history: Turn[]): Promise<string> {
  const key = process.env["NVIDIA_API_KEY"];
  if (!key || key.trim().length === 0) throw new Error("NVIDIA_API_KEY is not configured");

  const signals = detectConversationSignals(history);
  const retrieved = retrieveKinyarwandaContext(history, 4);
  const contextHint = `\nConversation signals: ${JSON.stringify(signals)}${retrieved ? `\nLanguage reference:\n${retrieved}` : ""}`;
  const messages = buildMessages(history, 20, contextHint);
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
          temperature: 0.72,
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
