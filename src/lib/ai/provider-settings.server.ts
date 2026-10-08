// Server-only global settings. Ciphertext never leaves this module.
import { supabaseAdmin } from '@/integrations/supabase/client.server';

export type ProviderId = 'nvidia' | 'gemini';

async function encryptionKey() {
  const secret = process.env['AI_SETTINGS_ENCRYPTION_KEY'];
  if (!secret) throw new Error('Secure AI settings storage is not configured.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptKey(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(), new TextEncoder().encode(value)));
  return `${btoa(String.fromCharCode(...iv))}.${btoa(String.fromCharCode(...encrypted))}`;
}

async function decryptKey(value: string) {
  try {
    const [ivText, encryptedText] = value.split('.');
    if (!ivText || !encryptedText) throw new Error('Invalid stored credential');
    const iv = Uint8Array.from(atob(ivText), c => c.charCodeAt(0));
    const encrypted = Uint8Array.from(atob(encryptedText), c => c.charCodeAt(0));
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await encryptionKey(), encrypted));
  } catch {
    throw new Error('Saved AI credentials could not be unlocked. Ask an administrator to save the key again.');
  }
}

export async function readSettings() {
  const { data, error } = await supabaseAdmin.from('kero_provider_settings').select('*').eq('id', 'global').abortSignal(AbortSignal.timeout(4_000)).maybeSingle();
  if (error) throw new Error('AI settings could not be loaded.');
  return data;
}

export async function readProviderKey(provider: ProviderId, settings: Awaited<ReturnType<typeof readSettings>>) {
  const encrypted = provider === 'gemini' ? settings?.gemini_key_encrypted : settings?.nvidia_key_encrypted;
  if (encrypted) return decryptKey(encrypted);
  return process.env[provider === 'gemini' ? 'GOOGLE_API_KEY' : 'NVIDIA_API_KEY']?.trim();
}

export async function writeSettings(values: {
  active_provider?: ProviderId;
  nvidia_key_encrypted?: string;
  gemini_key_encrypted?: string;
  gemini_model?: string;
}, userId: string) {
  const { error } = await supabaseAdmin.from('kero_provider_settings').upsert({ id: 'global', ...values, updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (error) throw new Error('AI settings could not be saved.');
  await supabaseAdmin.from('audit_logs').insert({user_id: userId, action: 'ai_settings_updated', details: { provider: values.active_provider, credentialChanged: Boolean(values.gemini_key_encrypted || values.nvidia_key_encrypted) }});
}