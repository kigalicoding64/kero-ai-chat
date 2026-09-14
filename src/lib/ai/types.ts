// Shared AI layer types. Client-safe (no secrets, no server imports).

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ProviderConfig {
  /** Stable provider id, e.g. "nvidia". */
  id: string;
  label: string;
  /** Model id currently configured for this provider. */
  model: string;
  /** Whether the provider has the credentials it needs. */
  configured: boolean;
}

export interface CheckResult {
  id: string;
  label: string;
  status: "pass" | "fail" | "warn";
  detail: string;
  durationMs?: number;
}

export interface DiagnosticsReport {
  provider: string;
  model: string;
  checks: CheckResult[];
  ok: boolean;
}

/**
 * Every AI provider implements this. Adding a provider = adding one file that
 * exports an object of this shape and registering it in providers/registry.server.ts.
 */
export interface AiProvider {
  id: string;
  label: string;
  /** Returns config info without leaking credentials. */
  describe(): ProviderConfig;
  /** Raw upstream streaming response (OpenAI-compatible SSE). */
  streamChat(input: {
    messages: ChatMessage[];
    model?: string;
    signal?: AbortSignal;
  }): Promise<Response>;
  /** List model ids available to the current credentials. */
  listModels(): Promise<string[]>;
  /** Small non-streaming completion, used by the diagnostics panel. */
  testCompletion(prompt: string): Promise<{ text: string; model: string }>;
}

export class MissingCredentialsError extends Error {
  constructor(public readonly envVar: string) {
    super(`Missing ${envVar}`);
    this.name = "MissingCredentialsError";
  }
}
