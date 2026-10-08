import type { AiProvider, ChatMessage } from '../types';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
type GeminiResult = {
  error?: unknown;
  promptFeedback?: { blockReason?: string };
  candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[];
};

export function geminiText(result: GeminiResult) {
  const candidate = result.candidates?.[0];
  if (result.error) throw new Error('Gemini could not complete this reply.');
  if (result.promptFeedback?.blockReason || (candidate?.finishReason && !['STOP', 'MAX_TOKENS'].includes(candidate.finishReason))) {
    throw new Error('Gemini declined to answer this request.');
  }
  return (candidate?.content?.parts ?? []).filter(part => !part.thought).map(part => part.text ?? '').join('');
}

export function geminiBody(messages: ChatMessage[]) {
  return {
    systemInstruction: { parts: [{ text: messages.filter(m => m.role === 'system').map(m => m.content).join('\n') || 'Reply clearly and briefly.' }] },
    contents: messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
  };
}

export function createGeminiProvider(key?: string, model = DEFAULT_GEMINI_MODEL): AiProvider {
  async function api(path: string, init: RequestInit = {}) {
    if (!key) throw new Error('Gemini is not configured. Ask an administrator to add its API key in settings.');
    const timeout = AbortSignal.timeout(45_000);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    return fetch(`${BASE}/${path}`, { ...init, signal, headers: { 'x-goog-api-key': key, 'content-type': 'application/json' } });
  }
  async function completion(messages: ChatMessage[]) {
    const res = await api(`models/${model}:generateContent`, { method: 'POST', body: JSON.stringify(geminiBody(messages)) });
    if (!res.ok) throw new Error(`Gemini connection failed (${res.status}). Check the API key, model access, and quota.`);
    const text = geminiText(await res.json());
    if (!text.trim()) throw new Error('Gemini returned no answer.');
    return {text, model};
  }
  return {
    id: 'gemini', label: 'Google Gemini',
    describe: () => ({ id: 'gemini', label: 'Google Gemini', model, configured: Boolean(key) }),
    async listModels(signal) {
      const models: string[] = [];
      let pageToken: string | undefined;
      do {
        const res = await api(`models?pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`, {signal: signal ?? null});
        if (!res.ok) throw new Error(`Gemini connection failed (${res.status}). Check the API key and access.`);
        const json = await res.json() as { models?: {name: string; supportedGenerationMethods?: string[]}[]; nextPageToken?: string };
        models.push(...(json.models ?? []).filter(m => m.supportedGenerationMethods?.includes('generateContent')).map(m => m.name.replace(/^models\//, '')));
        pageToken = json.nextPageToken;
      } while (pageToken);
      return models;
    },
    testCompletion: prompt => completion([{role:'user',content:prompt}]),
    async streamChat({ messages, signal }) {
      const res = await api(`models/${model}:streamGenerateContent?alt=sse`, {method:'POST', body:JSON.stringify(geminiBody(messages)), signal: signal ?? null});
      if (!res.ok || !res.body) return res;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let buffer = '';
      // Pump until EOF, including metadata-only and separately arriving frames.
      const body = new ReadableStream<Uint8Array>({
        async start(controller) {
          const emit = (value: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));
          const parse = (frame: string) => {
            const data = frame.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('\n');
            if (!data) return;
            const text = geminiText(JSON.parse(data));
            if (text) emit({choices:[{delta:{content:text}}]});
          };
          try {
            while (true) {
              const chunk = await reader.read();
              if (chunk.done) break;
              buffer += decoder.decode(chunk.value, {stream:true});
              buffer = buffer.replace(/\r\n/g, '\n');
              let boundary = buffer.indexOf('\n\n');
              while (boundary >= 0) {
                parse(buffer.slice(0, boundary));
                buffer = buffer.slice(boundary + 2);
                boundary = buffer.indexOf('\n\n');
              }
            }
            buffer += decoder.decode();
            if (buffer.trim()) parse(buffer);
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          } catch (error) {
            if (!signal?.aborted) {
              emit({ error: { message: error instanceof Error ? error.message : 'Gemini reply was interrupted.' } });
              controller.close();
            } else controller.error(error);
            await reader.cancel().catch(() => {});
          }
        },
        cancel: reason => reader.cancel(reason),
      });
      return new Response(body, {headers:{'content-type':'text/event-stream'}});
    },
  };
}