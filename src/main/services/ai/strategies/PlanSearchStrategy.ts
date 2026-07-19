import * as os from 'node:os';
import type {
  AiDebugInfo,
  AiSearchPlan,
  AiSearchResponse,
  FileRecord,
  SearchResultItem,
  SemanticDebugInfo,
} from '../../../../shared/types';
import { FileIndex } from '../../indexing/FileIndex';
import { ContentScanner } from '../../search/ContentScanner';
import { FuzzySearchService, toResult } from '../../search/FuzzySearchService';
import type { EmbeddingService } from '../../semantic/EmbeddingService';
import { cosineSimilarity } from '../../semantic/vector';
import type { SettingsStore } from '../../settings/SettingsStore';
import { AiProviderError } from '../AiProvider';
import type { AiProviderFactory } from '../AiProviderFactory';
import { buildPlanPrompt, extractJsonObject } from '../prompts';
import { normalizePlan } from '../AiSearchService'; // We will export normalizePlan from AiSearchService (or keep it locally, let's keep it here/locally or import it)
import type { AiSearchStrategy } from './AiSearchStrategy';

const RESULT_LIMIT = 30;
const CONTENT_SCAN_LIMIT = 300;
const TAG_SCORE = 10;
const SEMANTIC_MIN_SIMILARITY = 0.3;
const SEMANTIC_SCORE_SCALE = 50;
const BUDGET_CHECK_INTERVAL = 2048;

export class PlanSearchStrategy implements AiSearchStrategy {
  private readonly scanner = new ContentScanner();

  constructor(
    private readonly index: FileIndex,
    private readonly fuzzy: FuzzySearchService,
    private readonly providers: AiProviderFactory,
    private readonly settings: SettingsStore,
    private readonly embedder: EmbeddingService,
  ) {}

  async search(query: string, onUpdate?: (intent: string) => void): Promise<AiSearchResponse> {
    const trimmed = query.trim();
    if (!trimmed) return { summary: '', plan: null, results: [] };

    const provider = this.providers.create();
    const started = Date.now();
    const debug: AiDebugInfo = {
      provider: provider.label,
      model: provider.model,
      prompt: '',
      rawResponse: '',
      plan: null,
      durationMs: 0,
      semantic: {
        available: this.embedder.available,
        indexedCount: this.index.semanticCount,
        queryEmbedded: false,
        hitCount: 0,
      },
    };
    const finish = <T extends AiSearchResponse>(response: T): T => {
      debug.durationMs = Date.now() - started;
      return response;
    };

    const configError = provider.configurationError();
    if (configError) return finish({ summary: '', plan: null, results: [], error: configError, debug });

    let plan: AiSearchPlan;
    try {
      debug.prompt = buildPlanPrompt(trimmed, os.homedir());
      debug.rawResponse = await provider.complete(debug.prompt);
      plan = normalizePlan(extractJsonObject(debug.rawResponse));
      debug.plan = plan;
    } catch (err) {
      const message =
        err instanceof AiProviderError
          ? err.message
          : `${provider.label} returned a response that could not be understood.`;
      return finish({ summary: '', plan: null, results: [], error: message, debug });
    }

    const results = await this.execute(plan, trimmed, debug.semantic);
    return finish({ summary: plan.summary, plan, results, debug });
  }

  private async execute(plan: AiSearchPlan, query: string, semanticDebug: SemanticDebugInfo): Promise<SearchResultItem[]> {
    const after = plan.modifiedAfter ? Date.parse(plan.modifiedAfter) : null;
    const before = plan.modifiedBefore ? Date.parse(plan.modifiedBefore) + 86_400_000 : null;
    const extensions = new Set(plan.extensions.map((e) => e.toLowerCase()));
    const pathHints = plan.pathHints.map((h) => h.toLowerCase());
    const tagTerms = new Set([...plan.keywords, ...plan.contentTerms].map((t) => t.toLowerCase()));

    const queryVectorPromise = this.embedder.embedQuery([query]);
    const budgetMs = this.settings.get().maxQueryTimeMs;
    const deadline = Date.now() + budgetMs;

    const baseScore = (extensions.size > 0 ? 1 : 0) + (after !== null || before !== null ? 1 : 0);

    const passesFilters = (record: FileRecord): boolean => {
      if (extensions.size > 0 && (record.isDir || !extensions.has(record.ext))) return false;
      if (after !== null && record.mtimeMs < after) return false;
      if (before !== null && record.mtimeMs > before) return false;
      return true;
    };

    const scored: Array<{ record: FileRecord; score: number }> = [];
    let checked = 0;
    for (const record of this.index.all()) {
      if ((++checked & (BUDGET_CHECK_INTERVAL - 1)) === 0 && Date.now() > deadline) break;
      if (!passesFilters(record)) continue;

      let score = baseScore;
      if (pathHints.length > 0) {
        const dir = record.dir.toLowerCase();
        const hintMatches = pathHints.filter((h) => dir.includes(h)).length;
        score += hintMatches * 12;
      }
      const tagMatches = record.tags ? record.tags.filter((t) => tagTerms.has(t)).length : 0;
      score += tagMatches * TAG_SCORE;

      if (plan.contentTerms.length > 0) {
        const nameScore = this.fuzzy.scoreKeywords(plan.contentTerms, record);
        if (nameScore !== null) score += nameScore + 15;
      }
      if (plan.keywords.length > 0) {
        const kwScore = this.fuzzy.scoreKeywords(plan.keywords, record);
        if (kwScore === null) {
          if (tagMatches === 0 && (plan.contentTerms.length === 0 || !this.scanner.isScannable(record))) continue;
        } else {
          score += kwScore + 20;
        }
      } else if (extensions.size === 0 && pathHints.length === 0 && plan.contentTerms.length === 0 && tagMatches === 0) {
        continue;
      }
      scored.push({ record, score });
    }

    const queryVector = (await queryVectorPromise)?.[0];
    semanticDebug.queryEmbedded = queryVector !== undefined;
    if (queryVector) {
      const byPath = new Map(scored.map((s) => [s.record.path, s]));
      for (const record of this.index.all()) {
        if (!record.embedding || record.embedding.length !== queryVector.length) continue;
        if (!passesFilters(record)) continue;
        const similarity = cosineSimilarity(queryVector, record.embedding);
        if (similarity < SEMANTIC_MIN_SIMILARITY) continue;
        semanticDebug.hitCount++;
        const existing = byPath.get(record.path);
        if (existing) existing.score += similarity * SEMANTIC_SCORE_SCALE;
        else scored.push({ record, score: baseScore + similarity * SEMANTIC_SCORE_SCALE });
      }
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

    const minScore = plan.contentTerms.length > 0 ? baseScore + 1 : 1;
    for (const { record, score } of scored) {
      if (results.size >= RESULT_LIMIT) break;
      if (!results.has(record.path) && score >= minScore) {
        results.set(record.path, toResult(record, score));
      }
    }
    return [...results.values()].slice(0, RESULT_LIMIT);
  }
}
