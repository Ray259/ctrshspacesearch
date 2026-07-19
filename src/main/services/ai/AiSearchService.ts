import * as os from 'node:os';
import type { AiSearchPlan, AiSearchResponse, FileRecord, SearchResultItem } from '../../../shared/types';
import { FileIndex } from '../indexing/FileIndex';
import { ContentScanner } from '../search/ContentScanner';
import { FuzzySearchService, toResult } from '../search/FuzzySearchService';
import { AiProviderError } from './AiProvider';
import { AiProviderFactory } from './AiProviderFactory';
import { buildPlanPrompt, extractJsonObject } from './prompts';

const RESULT_LIMIT = 30;
const CONTENT_SCAN_LIMIT = 300;

/**
 * Orchestrates AI mode: natural-language query -> LLM-generated AiSearchPlan
 * -> local execution against the index (privacy-preserving: file contents are
 * never sent to the provider, only the user's query).
 */
export class AiSearchService {
  private readonly scanner = new ContentScanner();

  constructor(
    private readonly index: FileIndex,
    private readonly fuzzy: FuzzySearchService,
    private readonly providers: AiProviderFactory,
  ) {}

  async search(query: string): Promise<AiSearchResponse> {
    const trimmed = query.trim();
    if (!trimmed) return { summary: '', plan: null, results: [] };

    const provider = this.providers.create();
    const configError = provider.configurationError();
    if (configError) return { summary: '', plan: null, results: [], error: configError };

    let plan: AiSearchPlan;
    try {
      const raw = await provider.complete(buildPlanPrompt(trimmed, os.homedir()));
      plan = normalizePlan(extractJsonObject(raw));
    } catch (err) {
      const message =
        err instanceof AiProviderError
          ? err.message
          : `${provider.label} returned a response that could not be understood.`;
      return { summary: '', plan: null, results: [], error: message };
    }

    const results = await this.execute(plan);
    return { summary: plan.summary, plan, results };
  }

  /** Runs the structured plan locally against the index. */
  private async execute(plan: AiSearchPlan): Promise<SearchResultItem[]> {
    const after = plan.modifiedAfter ? Date.parse(plan.modifiedAfter) : null;
    const before = plan.modifiedBefore ? Date.parse(plan.modifiedBefore) + 86_400_000 : null;
    const extensions = new Set(plan.extensions.map((e) => e.toLowerCase()));
    const pathHints = plan.pathHints.map((h) => h.toLowerCase());

    const scored: Array<{ record: FileRecord; score: number }> = [];
    for (const record of this.index.all()) {
      if (extensions.size > 0 && (record.isDir || !extensions.has(record.ext))) continue;
      if (after !== null && record.mtimeMs < after) continue;
      if (before !== null && record.mtimeMs > before) continue;

      let score = 0;
      if (pathHints.length > 0) {
        const dir = record.dir.toLowerCase();
        const hintMatches = pathHints.filter((h) => dir.includes(h)).length;
        score += hintMatches * 12;
      }
      if (plan.keywords.length > 0) {
        const kwScore = this.fuzzy.scoreKeywords(plan.keywords, record);
        if (kwScore === null) {
          // Without a name match the record only stays as a content-scan candidate.
          if (plan.contentTerms.length === 0 || !this.scanner.isScannable(record) || score === 0) continue;
        } else {
          score += kwScore + 20;
        }
      } else if (extensions.size === 0 && pathHints.length === 0 && plan.contentTerms.length === 0) {
        continue; // empty plan: nothing to rank by
      }
      scored.push({ record, score });
    }
    scored.sort((a, b) => b.score - a.score || b.record.mtimeMs - a.record.mtimeMs);

    const results = new Map<string, SearchResultItem>();
    if (plan.contentTerms.length > 0) {
      const candidates = scored.slice(0, CONTENT_SCAN_LIMIT).map((s) => s.record);
      const matches = await this.scanner.scan(candidates, plan.contentTerms);
      for (const match of matches) {
        results.set(match.record.path, toResult(match.record, 1000, 'content', match.snippet));
      }
    }
    for (const { record, score } of scored) {
      if (results.size >= RESULT_LIMIT) break;
      if (!results.has(record.path) && score > 0) {
        results.set(record.path, toResult(record, score));
      }
    }
    return [...results.values()].slice(0, RESULT_LIMIT);
  }
}

/** Coerces untrusted model output into a well-formed AiSearchPlan. */
export function normalizePlan(raw: unknown): AiSearchPlan {
  const obj = (raw ?? {}) as Record<string, unknown>;
  return {
    summary: typeof obj.summary === 'string' ? obj.summary : 'AI search',
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
