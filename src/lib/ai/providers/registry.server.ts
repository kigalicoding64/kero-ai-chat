// Provider registry. Add a provider here to make it selectable app-wide.

import type { AiProvider } from "../types";
import { nvidiaProvider } from "./nvidia.server";

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
