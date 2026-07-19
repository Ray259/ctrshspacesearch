import type { FileRecord, SearchResultItem } from '../../../shared/types';
import { FileIndex } from '../indexing/FileIndex';
import { fuzzyScore } from './fuzzyScore';

const DEFAULT_LIMIT = 30;

/** Name-based fuzzy search over the file index (the "Spotlight" mode). */
export class FuzzySearchService {
  constructor(private readonly index: FileIndex) {}

  search(query: string, limit = DEFAULT_LIMIT): SearchResultItem[] {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const hits: SearchResultItem[] = [];
    for (const record of this.index.all()) {
      const score = this.scoreRecord(trimmed, record);
      if (score === null) continue;
      hits.push(toResult(record, score));
    }
    hits.sort((a, b) => b.score - a.score || b.mtimeMs - a.mtimeMs);
    return hits.slice(0, limit);
  }

  /**
   * Score against multiple keywords: every keyword must match the name or,
   * failing that, the full path. Used by the AI plan executor.
   */
  scoreKeywords(keywords: string[], record: FileRecord): number | null {
    let total = 0;
    for (const keyword of keywords) {
      const nameScore = fuzzyScore(keyword, record.name);
      if (nameScore !== null) {
        total += nameScore + 10;
        continue;
      }
      const pathScore = fuzzyScore(keyword, record.path);
      if (pathScore === null) return null;
      total += pathScore;
    }
    return total;
  }

  private scoreRecord(query: string, record: FileRecord): number | null {
    const nameScore = fuzzyScore(query, record.name);
    if (nameScore !== null) return nameScore + 10;
    // Fall back to path matching so "docs/readme" style queries work.
    if (query.includes('/') || query.includes('\\') || query.includes(' ')) {
      return fuzzyScore(query.replace(/\s+/g, ''), record.path);
    }
    return null;
  }
}

export function toResult(
  record: FileRecord,
  score: number,
  matchedBy: 'name' | 'content' = 'name',
  snippet?: string,
): SearchResultItem {
  return {
    path: record.path,
    name: record.name,
    dir: record.dir,
    isDir: record.isDir,
    size: record.size,
    mtimeMs: record.mtimeMs,
    score,
    matchedBy,
    snippet,
  };
}
