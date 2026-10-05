// Provider registry. Add a provider here to make it selectable app-wide.

import type { AiProvider } from "../types";
import { nvidiaProvider } from "./nvidia.server";
import { createNvidiaProvider } from './nvidia.server';
import { createGeminiProvider, DEFAULT_GEMINI_MODEL } from './gemini.server';
import { readSettings, readProviderKey } from '../provider-settings.server';

const providers: Record<string, AiProvider> = {
  [nvidiaProvider.id]: nvidiaProvider,
};

export const DEFAULT_PROVIDER_ID = nvidiaProvider.id;

export function getProvider(id: string = DEFAULT_PROVIDER_ID): AiProvider {
  const provider = providers[id];
  if (!provider) throw new Error(`Unknown AI provider: ${id}`);
  return provider;
}

export function listProviders(): AiProvider[] {
  return Object.values(providers);
}

export async function getActiveProvider(): Promise<AiProvider> {
  const settings = await readSettings();
  const id = settings?.active_provider === 'gemini' ? 'gemini' : 'nvidia';
  const key = await readProviderKey(id, settings);
  return id === 'gemini'
    ? createGeminiProvider(key, settings?.gemini_model || DEFAULT_GEMINI_MODEL)
    : createNvidiaProvider(key);
}
