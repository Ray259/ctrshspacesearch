/** Search modes the window can be opened in. Each mode has its own global shortcut. */
export type SearchMode = 'files' | 'ai';

/** A single entry in the file index. */
export interface FileRecord {
  path: string;
  name: string;
  /** Lowercase extension including the dot, or '' for none / directories. */
  ext: string;
  dir: string;
  size: number;
  mtimeMs: number;
  isDir: boolean;
}

/** A search hit sent to the renderer. */
export interface SearchResultItem {
  path: string;
  name: string;
  dir: string;
  isDir: boolean;
  size: number;
  mtimeMs: number;
  score: number;
  /** How the item matched (AI mode annotates content hits with a snippet). */
  matchedBy: 'name' | 'content';
  snippet?: string;
}

/** Structured search plan produced by the LLM from a natural-language query. */
export interface AiSearchPlan {
  /** One-line restatement of what is being searched for, shown to the user. */
  summary: string;
  /** Filename fragments to fuzzy-match. */
  keywords: string[];
  /** File extensions to restrict to, including the dot (e.g. ".pdf"). */
  extensions: string[];
  /** Terms to look for inside file contents (text files only). */
  contentTerms: string[];
  /** Folder-name fragments the path should contain (e.g. "Documents"). */
  pathHints: string[];
  /** ISO dates (YYYY-MM-DD) bounding the modification time, or null. */
  modifiedAfter: string | null;
  modifiedBefore: string | null;
}

export interface AiSearchResponse {
  summary: string;
  plan: AiSearchPlan | null;
  results: SearchResultItem[];
  /** Human-readable error (missing API key, provider failure, ...), if any. */
  error?: string;
}

export type AiProviderId = 'gemini' | 'openrouter';

export interface AppSettings {
  aiProvider: AiProviderId;
  geminiApiKey: string;
  geminiModel: string;
  openRouterApiKey: string;
  openRouterModel: string;
  /** Electron accelerator strings. */
  searchShortcut: string;
  aiSearchShortcut: string;
  /** Absolute directories to index. Defaults to the user's home directory. */
  indexRoots: string[];
}

export interface IndexStatus {
  fileCount: number;
  indexing: boolean;
  lastBuiltMs: number | null;
}
