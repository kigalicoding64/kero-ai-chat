// Server-only NVIDIA NIM provider (OpenAI-compatible API).

import { MissingCredentialsError, type AiProvider, type ChatMessage } from "../types";

export const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
export const DEFAULT_NVIDIA_MODEL = "nvidia/nemotron-3-super-120b-a12b";
export const FALLBACK_NVIDIA_MODELS = [
  "nvidia/nemotron-3-super-120b-a12b",
  "nvidia/nemotron-3.5-lightning-30b-a3b",
  "nvidia/nemotron-nano-3-30b-a3b",
];

function readKey(override?: string): string | undefined {
  const key = override ?? process.env["NVIDIA_API_KEY"];
  return key && key.trim().length > 0 ? key.trim() : undefined;
}

export function configuredModel(): string {
  const model = process.env["NVIDIA_MODEL"];
  return model && model.trim().length > 0 ? model.trim() : DEFAULT_NVIDIA_MODEL;
}

function requireKey(override?: string): string {
  const key = readKey(override);
  if (!key) throw new MissingCredentialsError("NVIDIA_API_KEY");
  return key;
}

async function nvidiaFetch(path: string, init: RequestInit = {}, override?: string) {
  const key = requireKey(override);
  return fetch(`${NVIDIA_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: init.body ? "text/event-stream, application/json" : "application/json",
      ...(init.headers ?? {}),
    },
  });
}

export function createNvidiaProvider(keyOverride?: string): AiProvider {
return {
  id: "nvidia",
  label: "NVIDIA NIM",

  describe() {
    return {
      id: "nvidia",
      label: "NVIDIA NIM",
      model: configuredModel(),
      configured: Boolean(readKey(keyOverride)),
    };
  },

  async streamChat({ messages, model, signal }) {
    const body: Record<string, unknown> = {
      model: model ?? configuredModel(),
      messages,
      stream: true,
      temperature: 0.6,
      top_p: 0.95,
      max_tokens: 2048,
      // Nemotron models emit their internal reasoning into the reply unless asked not to.
      chat_template_kwargs: { thinking: false },
    };
    const init: RequestInit = { method: "POST", body: JSON.stringify(body) };
    if (signal) init.signal = signal;
    return nvidiaFetch("/chat/completions", init, keyOverride);
  },

  async listModels(signal) {
    const res = await nvidiaFetch("/models", { signal: signal ?? null }, keyOverride);
    if (!res.ok) throw new Error(`NVIDIA connection failed (${res.status}). Check credentials and model access.`);
    const json = (await res.json()) as { data?: { id?: string }[] };
    return (json.data ?? []).map((m) => m.id).filter((id): id is string => Boolean(id));
  },

  async testCompletion(prompt: string) {
    const model = configuredModel();
    const messages: ChatMessage[] = [{ role: "user", content: prompt }];
    const res = await nvidiaFetch("/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        max_tokens: 64,
        chat_template_kwargs: { thinking: false },
      }),
    }, keyOverride);
    if (!res.ok) {
      throw new Error(`NVIDIA completion failed (${res.status}). Check credentials, model access, or quota.`);
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return { text: json.choices?.[0]?.message?.content ?? "", model };
  },
};
}

export const nvidiaProvider = createNvidiaProvider();
