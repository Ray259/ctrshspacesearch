import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FileRecord } from '../../../shared/types';

interface IndexCache {
  version: number;
  builtAtMs: number;
  /** Which semanticModel produced the stored embeddings, if any. */
  embeddingModel?: string | null;
  records: FileRecord[];
}

const CACHE_VERSION = 1;

/**
 * In-memory repository of indexed files with a JSON cache on disk so the app
 * can answer queries immediately on startup while a fresh crawl runs.
 */
export class FileIndex {
  private records: FileRecord[] = [];
  private builtAtMs: number | null = null;
  private readonly cacheFile: string;
  /** The semanticModel the current embeddings belong to; null before any run. */
  embeddingModel: string | null = null;

  constructor(userDataDir: string) {
    this.cacheFile = path.join(userDataDir, 'index-cache.json');
  }

  all(): readonly FileRecord[] {
    return this.records;
  }

  get size(): number {
    return this.records.length;
  }

  get lastBuiltMs(): number | null {
    return this.builtAtMs;
  }

  get semanticCount(): number {
    let count = 0;
    for (const record of this.records) if (record.embedding) count++;
    return count;
  }

  replaceAll(records: FileRecord[]): void {
    this.records = records;
    this.builtAtMs = Date.now();
  }

  loadCache(): boolean {
    try {
      const cache: IndexCache = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
      if (cache.version !== CACHE_VERSION || !Array.isArray(cache.records)) return false;
      this.records = cache.records;
      this.builtAtMs = cache.builtAtMs;
      this.embeddingModel = cache.embeddingModel ?? null;
      return true;
    } catch {
      return false;
    }
  }

  saveCache(): void {
    const cache: IndexCache = {
      version: CACHE_VERSION,
      builtAtMs: this.builtAtMs ?? Date.now(),
      embeddingModel: this.embeddingModel,
      records: this.records,
    };
    try {
      fs.mkdirSync(path.dirname(this.cacheFile), { recursive: true });
      fs.writeFileSync(this.cacheFile, JSON.stringify(cache));
    } catch (err) {
      console.warn('Failed to persist index cache:', err);
    }
  }
}
