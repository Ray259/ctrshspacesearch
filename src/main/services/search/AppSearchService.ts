import type { SearchResultItem } from '../../../shared/types';
import type { FileActions } from '../files/FileActions';
import { AppIndexer } from '../indexing/AppIndexer';
import { fuzzyScore } from './fuzzyScore';
import { toResult } from './FuzzySearchService';
import { parseSearchQuery, matchesFilters, ParsedQuery } from './queryParser';

const DEFAULT_LIMIT = 30;

/** Name-based fuzzy search over installed applications (the "Apps" mode). */
export class AppSearchService {
  constructor(
    private readonly apps: AppIndexer,
    private readonly fileActions: FileActions,
  ) {}

  async search(query: string | ParsedQuery, limit = DEFAULT_LIMIT): Promise<SearchResultItem[]> {
    const parsed = typeof query === 'string' ? parseSearchQuery(query) : query;
    
    if (!parsed.baseQuery && parsed.excludePatterns.length === 0 && parsed.excludeRegexes.length === 0 && parsed.includePatterns.length === 0 && parsed.includeRegexes.length === 0) {
      return [];
    }

    const hits: SearchResultItem[] = [];
    for (const record of this.apps.all()) {
      if (!matchesFilters(parsed, record.path)) continue;

      const score = parsed.baseQuery ? fuzzyScore(parsed.baseQuery, record.name) : 1;
      if (score === null) continue;
      hits.push(toResult(record, score, 'name', undefined, 'app'));
    }
    hits.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    const top = hits.slice(0, limit);

    // Resolve native icons up front so rows render complete on first paint.
    await Promise.all(
      top.map(async (item) => {
        item.iconDataUrl = (await this.fileActions.icon(item.path)) || undefined;
      }),
    );
    return top;
  }
}
