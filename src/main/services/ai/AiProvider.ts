import type { AiProviderId } from '../../../shared/types';

/**
 * Strategy interface for LLM backends. Implementations are stateless request
 * wrappers; configuration (keys, model) is injected at construction time.
 */
export interface AiProvider {
  readonly id: AiProviderId;
  /** Human-readable name for error messages. */
  readonly label: string;
  /** Returns a reason the provider cannot run (e.g. missing key), or null if ready. */
  configurationError(): string | null;
  /** Sends a single-turn prompt and resolves with the raw model text. */
  complete(prompt: string): Promise<string>;
}

export class AiProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiProviderError';
  }
}

/** Shared helper: POST JSON and return the parsed body, with useful errors. */
export async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<any> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new AiProviderError(`Network error reaching the AI provider: ${(err as Error).message}`);
  }
  if (!response.ok) {
    const text = (await response.text()).slice(0, 300);
    throw new AiProviderError(`AI provider returned HTTP ${response.status}: ${text}`);
  }
  return response.json();
}
