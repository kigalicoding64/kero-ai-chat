import type { ChatMessage } from './types';
import { getActiveProvider } from './providers/registry.server';
import { FALLBACK_NVIDIA_MODELS } from './providers/nvidia.server';

export async function generateReply(messages: ChatMessage[]): Promise<string> {
  const provider = await getActiveProvider();
  const info = provider.describe();
  const candidates = info.id === 'nvidia' ? [...new Set([info.model, ...FALLBACK_NVIDIA_MODELS])] : [info.model];
  let res: Response | undefined;
  for (const model of candidates) {
    res = await provider.streamChat({messages,model});
    if (res.ok || ![404,410].includes(res.status) || info.id !== 'nvidia') break;
    await res.body?.cancel();
  }
  if (!res?.ok || !res.body) throw new Error(`${info.label} could not answer (${res?.status ?? 'unavailable'}).`);
  const reader = res.body.getReader(), decoder = new TextDecoder();
  let buffer = '', text = '';
  const parse = (frame: string) => {
    for (const line of frame.split('\n')) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      const json = JSON.parse(data) as {error?:{message?:string};choices?:{delta?:{content?:string}}[]};
      if (json.error) throw new Error(json.error.message || 'The AI provider declined this reply.');
      text += json.choices?.[0]?.delta?.content ?? '';
    }
  };
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value,{stream:true});
      buffer = buffer.replace(/\r\n/g,'\n');
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) { parse(buffer.slice(0,boundary)); buffer = buffer.slice(boundary+2); boundary = buffer.indexOf('\n\n'); }
    }
    buffer += decoder.decode();
    if (buffer.trim()) parse(buffer);
  } finally { await reader.cancel().catch(() => {}); }
  if (!text.trim()) throw new Error('The AI provider returned no answer.');
  return text.trim();
}