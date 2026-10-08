import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';

export const getAiAdminAccess = createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).handler(async ({context}) => {
  const {data,error} = await context.supabase.rpc('has_role',{_user_id:context.userId,_role:'admin'});
  if (error) throw new Error('Administrator access could not be checked.');
  return Boolean(data);
});

export const getAiSettings = createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).handler(async ({context}) => {
  const {data,error} = await context.supabase.rpc('has_role',{_user_id:context.userId,_role:'admin'});
  if (error || !data) throw new Error('Only administrators can manage AI settings.');
  const {readSettings,readProviderKey} = await import('@/lib/ai/provider-settings.server');
  const {DEFAULT_GEMINI_MODEL} = await import('@/lib/ai/providers/gemini.server');
  const settings = await readSettings();
  return {activeProvider:settings?.active_provider ?? 'nvidia', geminiModel:settings?.gemini_model || DEFAULT_GEMINI_MODEL, nvidiaConfigured:Boolean(await readProviderKey('nvidia',settings)),geminiConfigured:Boolean(await readProviderKey('gemini',settings))};
});

export const validateAndSaveProvider = createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
  .inputValidator((input:unknown) => z.object({provider:z.enum(['nvidia','gemini']),apiKey:z.string().trim().max(512).optional(),activate:z.boolean().default(false)}).parse(input))
  .handler(async ({data,context}) => {
    const {data:isAdmin,error} = await context.supabase.rpc('has_role',{_user_id:context.userId,_role:'admin'});
    if (error || !isAdmin) throw new Error('Only administrators can manage AI settings.');
    const {readSettings,readProviderKey,encryptKey,writeSettings} = await import('@/lib/ai/provider-settings.server');
    const {createGeminiProvider,DEFAULT_GEMINI_MODEL} = await import('@/lib/ai/providers/gemini.server');
    const {createNvidiaProvider} = await import('@/lib/ai/providers/nvidia.server');
    const settings = await readSettings();
    const key = data.apiKey || await readProviderKey(data.provider,settings);
    if (!key) throw new Error('Enter an API key before validating this provider.');
    const model = settings?.gemini_model || DEFAULT_GEMINI_MODEL;
    const provider = data.provider === 'gemini' ? createGeminiProvider(key,model) : createNvidiaProvider(key);
    const started = Date.now();
    const models = await provider.listModels(AbortSignal.timeout(12_000));
    if (!models.includes(provider.describe().model)) throw new Error('The configured model is not available for this key. Nothing was changed.');
    const result = await provider.testCompletion('Reply with exactly: KERO OK');
    if (!result.text.trim()) throw new Error('The provider did not return a reply. Nothing was changed.');
    const encrypted = data.apiKey ? await encryptKey(key) : undefined;
    await writeSettings({...(data.activate ? {active_provider:data.provider} : {}), ...(encrypted ? data.provider === 'gemini' ? {gemini_key_encrypted:encrypted,gemini_model:model} : {nvidia_key_encrypted:encrypted} : {})},context.userId);
    return {ok:true,provider:data.provider,durationMs:Date.now()-started,activated:data.activate};
  });