import { expect, test, mock } from 'bun:test';

// Exercise the real handlers without RPC transport or live credentials.
mock.module('@tanstack/react-start', () => ({createServerFn: () => {
  const chain = {middleware: () => chain, inputValidator: () => chain, handler: (fn: unknown) => fn};
  return chain;
}}));
mock.module('@/integrations/supabase/auth-middleware', () => ({requireSupabaseAuth:{}}));
let saved: Record<string,unknown> | undefined;
let completion = 'KERO OK';
const provider = {describe:() => ({model:'test-model'}),listModels:async () => ['test-model'],testCompletion:async () => ({text:completion})};
mock.module('@/lib/ai/provider-settings.server', () => ({readSettings:async () => null, readProviderKey:async () => undefined,encryptKey:async () => 'encrypted-test-value',writeSettings:async (values:Record<string,unknown>) => {saved=values;}}));
mock.module('@/lib/ai/providers/gemini.server', () => ({DEFAULT_GEMINI_MODEL:'test-model',createGeminiProvider:() => provider}));
mock.module('@/lib/ai/providers/nvidia.server', () => ({createNvidiaProvider:() => provider}));
const functions = await import('../src/lib/provider-settings.functions');
type Handler = (input:{data?:{provider:string;apiKey?:string;activate:boolean};context:{userId:string;supabase:{rpc:() => Promise<{data:boolean;error:null}>}}}) => Promise<unknown>;
const settings = functions.getAiSettings as unknown as Handler;
const save = functions.validateAndSaveProvider as unknown as Handler;
const context = (admin:boolean) => ({userId:'test-user',supabase:{rpc:async () => ({data:admin,error:null})}});

test('Only administrators can read settings or add and activate provider keys', async () => {
  saved=undefined;
  await expect(settings({context:context(false)})).rejects.toThrow('Only administrators');
  await expect(save({context:context(false),data:{provider:'gemini',apiKey:'test-key',activate:true}})).rejects.toThrow('Only administrators');
  expect(saved).toBeUndefined();
});

test('An administrator can activate Gemini only after a real nonempty completion', async () => {
  saved=undefined;
  completion='';
  await expect(save({context:context(true),data:{provider:'gemini',apiKey:'test-key',activate:true}})).rejects.toThrow('Nothing was changed');
  expect(saved).toBeUndefined();
  completion='KERO OK';
  await save({context:context(true),data:{provider:'gemini',apiKey:'test-key',activate:true}});
  expect(saved).toEqual({active_provider:'gemini',gemini_key_encrypted:'encrypted-test-value',gemini_model:'test-model'});
  expect(JSON.stringify(saved)).not.toContain('test-key');
});

test('Validating NVIDIA without activation preserves the current provider', async () => {
  completion='KERO OK';
  saved=undefined;
  await save({context:context(true),data:{provider:'nvidia',apiKey:'test-key',activate:false}});
  expect(saved).toEqual({nvidia_key_encrypted:'encrypted-test-value'});
});