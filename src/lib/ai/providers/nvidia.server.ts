// Server-only NVIDIA NIM provider (OpenAI-compatible API).

import { MissingCredentialsError, type AiProvider, type ChatMessage } from "../types";

export const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
export const DEFAULT_NVIDIA_MODEL = "nvidia/nemotron-3-super-120b-a12b";
export const FALLBACK_NVIDIA_MODELS = [
  "nvidia/nemotron-3-super-120b-a12b",
  "nvidia/nemotron-3.5-lightning-30b-a3b",
  "nvidia/nemotron-nano-3-30b-a3b",
];

function readKey(): string | undefined {
  const key = process.env["NVIDIA_API_KEY"];
  return key && key.trim().length > 0 ? key.trim() : undefined;
}

export function configuredModel(): string {
  const model = process.env["NVIDIA_MODEL"];
  return model && model.trim().length > 0 ? model.trim() : DEFAULT_NVIDIA_MODEL;
}

function requireKey(): string {
  const key = readKey();
  if (!key) throw new MissingCredentialsError("NVIDIA_API_KEY");
  return key;
}

async function nvidiaFetch(path: string, init: RequestInit = {}) {
  const key = requireKey();
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

export const nvidiaProvider: AiProvider = {
  id: "nvidia",
  label: "NVIDIA NIM",

  describe() {
    return {
      id: "nvidia",
      label: "NVIDIA NIM",
      model: configuredModel(),
      configured: Boolean(readKey()),
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
    };
    const init: RequestInit = { method: "POST", body: JSON.stringify(body) };
    if (signal) init.signal = signal;
    return nvidiaFetch("/chat/completions", init);
  },

  async listModels() {
    const res = await nvidiaFetch("/models");
    if (!res.ok) throw new Error(`NVIDIA /models responded ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { data?: { id?: string }[] };
    return (json.data ?? []).map((m) => m.id).filter((id): id is string => Boolean(id));
  },

  async testCompletion(prompt: string) {
    const model = configuredModel();
    const messages: ChatMessage[] = [{ role: "user", content: prompt }];
    const res = await nvidiaFetch("/chat/completions", {
      method: "POST",
      body: JSON.stringify({ model, messages, stream: false, max_tokens: 64 }),
    });
    if (!res.ok) {
      throw new Error(`NVIDIA completion responded ${res.status}: ${(await res.text()).slice(0, 400)}`);
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return { text: json.choices?.[0]?.message?.content ?? "", model };
  },
};
