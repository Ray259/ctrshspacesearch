const MODELS_URL = 'https://openrouter.ai/api/v1/models';
const CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Curated pool of known-good free OpenRouter models (general instruct models,
 * largest first; verified available July 2026). Used as the offline fallback
 * and as the source of the default model.
 */
export const FALLBACK_FREE_MODELS: readonly string[] = [
  'nvidia/nemotron-3-super-120b-a12b:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it:free',
  'tencent/hy3:free',
  'openai/gpt-oss-20b:free',
  'nvidia/nemotron-3-nano-30b-a3b:free',
  'nvidia/nemotron-nano-9b-v2:free',
];

export const DEFAULT_FREE_MODEL = FALLBACK_FREE_MODELS[0];

interface ModelsResponse {
  data?: Array<{ id?: string; context_length?: number }>;
}

/** Live list of free OpenRouter model ids, cached; falls back to the pool. */
export class OpenRouterModels {
  private cache: string[] | null = null;
  private fetchedAt = 0;

  async listFree(): Promise<string[]> {
    if (this.cache && Date.now() - this.fetchedAt < CACHE_TTL_MS) return this.cache;
    try {
      const response = await fetch(MODELS_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as ModelsResponse;
      const free = (body.data ?? [])
        .filter((m): m is { id: string; context_length?: number } =>
          typeof m.id === 'string' && m.id.endsWith(':free'),
        )
        .sort((a, b) => (b.context_length ?? 0) - (a.context_length ?? 0) || a.id.localeCompare(b.id))
        .map((m) => m.id);
      if (free.length > 0) {
        this.cache = free;
        this.fetchedAt = Date.now();
        return free;
      }
    } catch {
      // Offline or API change: serve the last good list or the static pool.
    }
    return this.cache ?? [...FALLBACK_FREE_MODELS];
  }
}
