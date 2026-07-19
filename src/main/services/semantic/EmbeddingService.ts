import * as path from 'node:path';
import { Worker } from 'node:worker_threads';
import type { SemanticModelChoice } from '../../../shared/types';
import type { SettingsStore } from '../settings/SettingsStore';

/** Local models behind the `semanticModel` setting. */
export const SEMANTIC_MODEL_IDS: Record<SemanticModelChoice, string> = {
  english: 'Xenova/all-MiniLM-L6-v2',
  multilingual: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
};

interface WorkerResponse {
  id: number;
  vectors?: number[][];
  error?: string;
}

/** Errors in a row before semantic search is disabled for the session. */
const MAX_CONSECUTIVE_ERRORS = 3;

/**
 * Deadline for embedding a query at search time. Deliberately independent of
 * the user's `maxQueryTimeMs` setting: that budget governs the fuzzy scan
 * over the whole index (a tight loop that should return in tens of ms), while
 * embedding one string is a single ML inference call — cheap once the model
 * is warm, but a cold model load (dynamic import + weight fetch/parse) can
 * take several seconds. Reusing the scan budget here made the embedding call
 * time out on effectively every search, so semantic matches never surfaced.
 */
const QUERY_EMBED_TIMEOUT_MS = 4000;

/**
 * Main-process facade over the embedding worker thread. All failure modes
 * (package missing, model download failed, worker crash) degrade to `null`
 * results so callers can silently skip the semantic signal — classic fuzzy
 * search must never break because of it.
 */
export class EmbeddingService {
  private worker: Worker | null = null;
  private activeModelId: string | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, (vectors: number[][] | null) => void>();
  private consecutiveErrors = 0;
  private disabled = false;

  constructor(
    private readonly settings: SettingsStore,
    private readonly modelCacheDir: string,
  ) {}

  /** False once the worker or model has failed repeatedly this session. */
  get available(): boolean {
    return !this.disabled;
  }

  /**
   * Embeds texts with the configured model. Resolves null (never rejects)
   * when semantic search is unavailable or the request fails.
   */
  embed(texts: string[]): Promise<number[][] | null> {
    if (this.disabled || texts.length === 0) return Promise.resolve(null);
    let worker: Worker;
    try {
      worker = this.ensureWorker();
    } catch (err) {
      console.warn('Semantic search disabled (worker failed to start):', err);
      this.disabled = true;
      return Promise.resolve(null);
    }
    const id = this.nextId++;
    return new Promise<number[][] | null>((resolve) => {
      this.pending.set(id, resolve);
      worker.postMessage({ id, texts });
    });
  }

  /**
   * Embeds a search query against a fixed deadline (see QUERY_EMBED_TIMEOUT_MS
   * for why this isn't the caller's query-time budget). On timeout it resolves
   * null, but the underlying request keeps running in the worker — the first
   * cold query warms the model up for the ones that follow.
   */
  embedQuery(texts: string[]): Promise<number[][] | null> {
    if (this.disabled || texts.length === 0) return Promise.resolve(null);
    return Promise.race([
      this.embed(texts),
      new Promise<null>((resolve) => setTimeout(resolve, QUERY_EMBED_TIMEOUT_MS, null).unref?.()),
    ]);
  }

  /** Fire-and-forget warm-up so the model is loaded before the first user search. */
  warmUp(): void {
    void this.embed(['warm up']);
  }

  stop(): void {
    this.settleAll(null);
    void this.worker?.terminate();
    this.worker = null;
    this.activeModelId = null;
  }

  /** (Re)spawns the worker when needed, e.g. after a model choice change. */
  private ensureWorker(): Worker {
    const modelId = SEMANTIC_MODEL_IDS[this.settings.get().semanticModel];
    if (this.worker && this.activeModelId === modelId) return this.worker;

    this.stop();
    const worker = new Worker(path.join(__dirname, 'workers', 'embeddingWorker.js'), {
      workerData: { modelId, cacheDir: this.modelCacheDir },
    });
    worker.unref();
    worker.on('message', (response: WorkerResponse) => this.handleResponse(response));
    worker.on('error', (err) => {
      console.warn('Semantic search disabled (embedding worker crashed):', err.message);
      this.disabled = true;
      this.stop();
    });
    this.worker = worker;
    this.activeModelId = modelId;
    return worker;
  }

  private handleResponse(response: WorkerResponse): void {
    const resolve = this.pending.get(response.id);
    this.pending.delete(response.id);
    if (response.error !== undefined) {
      this.consecutiveErrors++;
      if (this.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS && !this.disabled) {
        console.warn('Semantic search disabled after repeated errors:', response.error);
        this.disabled = true;
      }
      resolve?.(null);
      return;
    }
    this.consecutiveErrors = 0;
    resolve?.(response.vectors ?? null);
  }

  private settleAll(value: number[][] | null): void {
    for (const resolve of this.pending.values()) resolve(value);
    this.pending.clear();
  }
}
