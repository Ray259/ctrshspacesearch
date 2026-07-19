import type { FileRecord, SearchResultItem } from '../../../shared/types';
import { FileIndex } from '../indexing/FileIndex';
import { fuzzyScore } from './fuzzyScore';
import { parseSearchQuery, matchesFilters, ParsedQuery } from './queryParser';

const DEFAULT_LIMIT = 30;
/** Score for matching a record purely by one of its tags. */
const TAG_MATCH_SCORE = 5;
/** Extra score when a name match is also a tag match. */
const TAG_BONUS = 6;

/** Name-based fuzzy search over the file index (the "Spotlight" mode). */
export class FuzzySearchService {
  constructor(private readonly index: FileIndex) {}

  search(query: string, limit = DEFAULT_LIMIT): SearchResultItem[] {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const parsed = parseSearchQuery(trimmed);
    const hits: SearchResultItem[] = [];
    for (const record of this.index.all()) {
      const score = this.score(parsed, record);
      if (score === null) continue;
      hits.push(toResult(record, score));
    }
    hits.sort((a, b) => b.score - a.score || b.mtimeMs - a.mtimeMs);
    return hits.slice(0, limit);
  }

  /**
   * Score against multiple keywords: every keyword must match the name, a
   * tag or, failing that, the full path. Used by the AI plan executor.
   */
  scoreKeywords(keywords: string[], record: FileRecord): number | null {
    let total = 0;
    for (const keyword of keywords) {
      const nameScore = fuzzyScore(keyword, record.name);
      if (nameScore !== null) {
        total += nameScore + 10;
        continue;
      }
      if (record.tags?.includes(keyword.toLowerCase())) {
        total += TAG_MATCH_SCORE;
        continue;
      }
      const pathScore = fuzzyScore(keyword, record.path);
      if (pathScore === null) return null;
      total += pathScore;
    }
    return total;
  }

  /** Scores a single record against a parsed query. */
  score(parsed: ParsedQuery | string, record: FileRecord): number | null {
    const parsedQuery = typeof parsed === 'string' ? parseSearchQuery(parsed) : parsed;

    if (!matchesFilters(parsedQuery, record.path)) {
      return null;
    }

    const query = parsedQuery.baseQuery;
    if (!query) {
      return 1;
    }

    const tagHit = record.tags?.includes(query.toLowerCase()) ?? false;
    const nameScore = fuzzyScore(query, record.name);
    if (nameScore !== null) return nameScore + 10 + (tagHit ? TAG_BONUS : 0);
    // A query that *is* a tag ("screenshot", "video", …) matches every file
    // in the category; the mtime tiebreaker surfaces the most recent ones.
    if (tagHit) return TAG_MATCH_SCORE;
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
  matchedBy: SearchResultItem['matchedBy'] = 'name',
  snippet?: string,
  kind: 'app' | 'file' = 'file',
): SearchResultItem {
  return {
    path: record.path,
    name: record.name,
    dir: record.dir,
    isDir: record.isDir,
    size: record.size,
    mtimeMs: record.mtimeMs,
    score,
    kind,
    matchedBy,
    snippet,
  };
}
