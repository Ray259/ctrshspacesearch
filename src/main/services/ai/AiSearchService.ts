import type { AiSearchPlan, AiSearchResponse, AiSearchStrategyId } from '../../../shared/types';
import type { SettingsStore } from '../settings/SettingsStore';
import type { AiSearchStrategy } from './strategies/AiSearchStrategy';

/**
 * Thin facade over the AI search strategies (Plan-based vs Context-aware).
 * It reads the setting 'aiSearchStrategy' and delegates search requests to the active strategy.
 */
export class AiSearchService {
  constructor(
    private readonly strategies: Map<AiSearchStrategyId, AiSearchStrategy>,
    private readonly settings: SettingsStore,
  ) {}

  async search(query: string, onUpdate?: (intent: string) => void): Promise<AiSearchResponse> {
    const strategyId = this.settings.get().aiSearchStrategy;
    const strategy = this.strategies.get(strategyId);
    if (!strategy) {
      return {
        summary: '',
        plan: null,
        results: [],
        error: `AI search strategy "${strategyId}" is not configured.`,
      };
    }
    return strategy.search(query, onUpdate);
  }
}

/** Coerces untrusted model output into a well-formed AiSearchPlan. */
export function normalizePlan(raw: unknown): AiSearchPlan {
  const obj = (raw ?? {}) as Record<string, unknown>;
  return {
    summary: typeof obj.summary === 'string' ? obj.summary : 'AI search',
    insight: typeof obj.insight === 'string' ? obj.insight : '',
    keywords: toStringArray(obj.keywords),
    extensions: toStringArray(obj.extensions).map((e) => (e.startsWith('.') ? e : `.${e}`)),
    contentTerms: toStringArray(obj.contentTerms),
    pathHints: toStringArray(obj.pathHints),
    modifiedAfter: toIsoDate(obj.modifiedAfter),
    modifiedBefore: toIsoDate(obj.modifiedBefore),
  };
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '').map((v) => v.trim());
}

function toIsoDate(value: unknown): string | null {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return null;
  return value;
}
