import * as fs from 'node:fs';
import type { FileRecord } from '../../../shared/types';

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.rtf', '.log', '.csv', '.tsv',
  '.json', '.yml', '.yaml', '.toml', '.ini', '.xml', '.html', '.css',
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.c', '.cc', '.cpp', '.h', '.hpp',
  '.cs', '.php', '.sh', '.bash', '.zsh', '.ps1', '.sql', '.r', '.swift', '.tex',
]);

const MAX_FILE_SIZE = 512 * 1024;
const SNIPPET_RADIUS = 60;

export interface ContentMatch {
  record: FileRecord;
  snippet: string;
}

/**
 * Bounded plain-text content scan used by the AI executor for `contentTerms`.
 * Only inspects known text extensions under a size cap, so a scan over a few
 * hundred candidates stays fast.
 */
export class ContentScanner {
  isScannable(record: FileRecord): boolean {
    return !record.isDir && record.size > 0 && record.size <= MAX_FILE_SIZE && TEXT_EXTENSIONS.has(record.ext);
  }

  async scan(candidates: FileRecord[], terms: string[]): Promise<ContentMatch[]> {
    const lowered = terms.map((t) => t.toLowerCase()).filter(Boolean);
    if (lowered.length === 0) return [];

    const matches: ContentMatch[] = [];
    for (const record of candidates) {
      if (!this.isScannable(record)) continue;
      let content: string;
      try {
        content = await fs.promises.readFile(record.path, 'utf8');
      } catch {
        continue;
      }
      const haystack = content.toLowerCase();
      const term = lowered.find((t) => haystack.includes(t));
      if (term === undefined) continue;
      matches.push({ record, snippet: makeSnippet(content, haystack.indexOf(term), term.length) });
    }
    return matches;
  }
}

function makeSnippet(content: string, index: number, length: number): string {
  const start = Math.max(0, index - SNIPPET_RADIUS);
  const end = Math.min(content.length, index + length + SNIPPET_RADIUS);
  const raw = content.slice(start, end).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${raw}${end < content.length ? '…' : ''}`;
}
