import { afterEach, expect, test } from 'bun:test';
import { createGeminiProvider, geminiBody, geminiText } from '../src/lib/ai/providers/gemini.server';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test('Gemini receives hidden system guidance separately and maps assistant history', () => {
  expect(geminiBody([{role:'system',content:'Support guidance'},{role:'user',content:'Hi'},{role:'assistant',content:'Hello'}])).toEqual({systemInstruction:{parts:[{text:'Support guidance'}]},contents:[{role:'user',parts:[{text:'Hi'}]},{role:'model',parts:[{text:'Hello'}]}]});
});

test('Gemini normalizes split stream frames and excludes reasoning', async () => {
  const encoder = new TextEncoder();
  globalThis.fetch = (async (_input, init) => {
    expect(new Headers(init?.headers).get('x-goog-api-key')).toBe('test-only-key');
    expect(init?.signal).toBeDefined();
    return new Response(new ReadableStream({start(controller) {
      for (const chunk of ['data: {"candidates":[{"content":{"parts":[{"text":"private","thought":true},{"text":"Hello "}]}}]}\r', '\n\r\ndata: {"candidates":[{"content":{"parts":[{"text":"there"}]},"finishReason":"STOP"}]}']) controller.enqueue(encoder.encode(chunk));
      controller.close();
    }}));
  }) as typeof fetch;
  const response = await createGeminiProvider('test-only-key').streamChat({messages:[{role:'user',content:'Hi'}]});
  const stream = await response.text();
  expect(stream).toContain('"content":"Hello "');
  expect(stream).toContain('"content":"there"');
  expect(stream).toContain('data: [DONE]');
  expect(stream).not.toContain('private');
});

test('Gemini preserves rejected upstream status and reports blocked responses', async () => {
  globalThis.fetch = (async () => new Response('Denied',{status:403})) as typeof fetch;
  expect((await createGeminiProvider('test-only-key').streamChat({messages:[]})).status).toBe(403);
  expect(() => geminiText({promptFeedback:{blockReason:'SAFETY'}})).toThrow('declined');
});

test('Gemini refuses requests without credentials', async () => {
  await expect(createGeminiProvider().listModels()).rejects.toThrow('not configured');
});