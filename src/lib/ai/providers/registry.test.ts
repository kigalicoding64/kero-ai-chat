import { expect, mock, test } from 'bun:test';

let active = 'nvidia';
mock.module('../provider-settings.server', () => ({readSettings:async () => ({active_provider:active,gemini_model:'gemini-test'}),readProviderKey:async (id:string) => `${id}-test-key`}));
mock.module('./nvidia.server', () => ({nvidiaProvider:{id:'nvidia'},createNvidiaProvider:(key:string) => ({id:'nvidia',key})}));
mock.module('./gemini.server', () => ({DEFAULT_GEMINI_MODEL:'gemini-test',createGeminiProvider:(key:string,model:string) => ({id:'gemini',key,model})}));
const {getActiveProvider} = await import('./registry.server');

test('Global provider selection resolves NVIDIA for chat and WhatsApp', async () => {
  active='nvidia';
  expect(await getActiveProvider()).toEqual({id:'nvidia',key:'nvidia-test-key'});
});

test('Global provider selection resolves Gemini with its saved model', async () => {
  active='gemini';
  expect(await getActiveProvider()).toEqual({id:'gemini',key:'gemini-test-key',model:'gemini-test'});
});