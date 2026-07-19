import type { WebContents } from 'electron';
import { IpcChannels } from '../../../shared/ipc';
import type { AllSearchUpdate, FileRecord, SearchResultItem } from '../../../shared/types';
import { FileIndex } from '../indexing/FileIndex';
import type { EmbeddingService } from '../semantic/EmbeddingService';
import { cosineSimilarity } from '../semantic/vector';
import type { SettingsStore } from '../settings/SettingsStore';
import type { AppSearchService } from './AppSearchService';
import { FuzzySearchService, toResult } from './FuzzySearchService';
import { parseSearchQuery, matchesFilters, ParsedQuery } from './queryParser';

const APPS_LIMIT = 6;
const FILES_LIMIT = 30;
/** How many index records are scored between event-loop yields. */
const CHUNK_SIZE = 5000;
/** Minimum gap between partial emissions, so the renderer isn't flooded. */
const EMIT_INTERVAL_MS = 80;
/** Working-set cap: hits are re-sorted per chunk, so keep the array small. */
const MAX_TRACKED_HITS = 200;
/** Cosine similarity below this is noise, not a conceptual match. */
const SEMANTIC_MIN_SIMILARITY = 0.35;
/** Scales similarity (0..1) into the fuzzy-score range. */
const SEMANTIC_SCORE_SCALE = 45;
/** At most this many purely semantic hits join the result list. */
const SEMANTIC_LIMIT = 8;

/**
 * The "All" mode: applications first (they are cheap and highest priority),
 * then file hits streamed incrementally while the index is scanned, so the
 * UI fills in as results are found rather than after the whole scan. The
 * scan respects the user's `maxQueryTimeMs` budget, and a final semantic
 * pass merges conceptually similar files (when embeddings are available).
 */
export class AllSearchService {
  /** Newest request id per window; older in-flight scans cancel themselves. */
  private readonly latestRequest = new WeakMap<WebContents, number>();

  constructor(
    private readonly index: FileIndex,
    private readonly fileSearch: FuzzySearchService,
    private readonly appSearch: AppSearchService,
    private readonly settings: SettingsStore,
    private readonly embedder: EmbeddingService,
  ) {}

  async run(sender: WebContents, query: string, requestId: number): Promise<void> {
    this.latestRequest.set(sender, requestId);
    const trimmed = query.trim();

    const send = (section: AllSearchUpdate['section'], items: SearchResultItem[], done: boolean) => {
      if (!sender.isDestroyed()) {
        sender.send(IpcChannels.searchAllUpdate, { requestId, section, items, done } satisfies AllSearchUpdate);
      }
    };

    const parsed = parseSearchQuery(trimmed);
    const hasQueryOrFilters = parsed.baseQuery || parsed.excludePatterns.length > 0 || parsed.excludeRegexes.length > 0 || parsed.includePatterns.length > 0 || parsed.includeRegexes.length > 0;

    send('apps', hasQueryOrFilters ? await this.appSearch.search(parsed, APPS_LIMIT) : [], false);
    if (!hasQueryOrFilters || this.cancelled(sender, requestId)) {
      if (!hasQueryOrFilters) send('files', [], true);
      return;
    }

    // Embedding the query runs concurrently with the fuzzy scan below, on its
    // own deadline (see EmbeddingService.embedQuery) — independent of the
    // scan's own time budget, which governs a completely different workload.
    const budgetMs = this.settings.get().maxQueryTimeMs;
    const deadline = Date.now() + budgetMs;
    const queryVectorPromise = parsed.baseQuery
      ? this.embedder.embedQuery([parsed.baseQuery])
      : Promise.resolve(null);

    const records = this.index.all();
    const hits: SearchResultItem[] = [];
    let lastEmit = Date.now();

    for (let start = 0; start < records.length; start += CHUNK_SIZE) {
      if (this.cancelled(sender, requestId)) return;
      if (Date.now() > deadline) break; // budget spent: return the best so far

      const end = Math.min(start + CHUNK_SIZE, records.length);
      for (let i = start; i < end; i++) {
        const score = this.fileSearch.score(parsed, records[i]);
        if (score !== null) hits.push(toResult(records[i], score));
      }
      trimHits(hits);

      if (Date.now() - lastEmit >= EMIT_INTERVAL_MS) {
        lastEmit = Date.now();
        send('files', hits.slice(0, FILES_LIMIT), false);
      }
      // Yield so IPC (including a superseding search) can be processed.
      await new Promise((resolve) => setImmediate(resolve));
    }

    if (this.cancelled(sender, requestId)) return;
    this.mergeSemanticHits(hits, await queryVectorPromise, parsed);

    if (this.cancelled(sender, requestId)) return;
    send('files', hits.slice(0, FILES_LIMIT), true);
  }

  /** Folds cosine-similar files into the fuzzy hits (boost or append). */
  private mergeSemanticHits(hits: SearchResultItem[], queryVectors: number[][] | null, parsed: ParsedQuery): void {
    const queryVector = queryVectors?.[0];
    if (!queryVector) return;

    const similar: Array<{ record: FileRecord; similarity: number }> = [];
    for (const record of this.index.all()) {
      if (!record.embedding || record.embedding.length !== queryVector.length) continue;
      if (!matchesFilters(parsed, record.path)) continue;
      const similarity = cosineSimilarity(queryVector, record.embedding);
      if (similarity >= SEMANTIC_MIN_SIMILARITY) similar.push({ record, similarity });
    }
    similar.sort((a, b) => b.similarity - a.similarity);

    const byPath = new Map(hits.map((h) => [h.path, h]));
    for (const { record, similarity } of similar.slice(0, SEMANTIC_LIMIT)) {
      const existing = byPath.get(record.path);
      if (existing) existing.score += similarity * SEMANTIC_SCORE_SCALE;
      else hits.push(toResult(record, similarity * SEMANTIC_SCORE_SCALE, 'semantic'));
    }
    trimHits(hits);
  }

  private cancelled(sender: WebContents, requestId: number): boolean {
    return sender.isDestroyed() || this.latestRequest.get(sender) !== requestId;
  }
}

function trimHits(hits: SearchResultItem[]): void {
  hits.sort((a, b) => b.score - a.score || b.mtimeMs - a.mtimeMs);
  if (hits.length > MAX_TRACKED_HITS) hits.length = MAX_TRACKED_HITS;
}
