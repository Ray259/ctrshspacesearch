/** Search modes the window can be opened in. Tab cycles through them in this order. */
export type SearchMode = 'all' | 'apps' | 'files' | 'ai';

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
  /** Rule-based categories assigned at index time (e.g. ["development", "docs"]). */
  tags?: string[];
  /** Normalized local embedding of the name/path, when within the semantic cap. */
  embedding?: number[];
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
  /** Whether this is an installed application or a regular file/folder. */
  kind: 'app' | 'file';
  /** Native OS icon as a data URL (populated for app results). */
  iconDataUrl?: string;
  /** How the item matched (AI mode annotates content hits with a snippet). */
  matchedBy: 'name' | 'content' | 'semantic';
  snippet?: string;
}

/**
 * Incremental payload for All mode: results stream to the renderer as they
 * are found instead of arriving in one final batch.
 */
export interface AllSearchUpdate {
  /** Echo of the renderer-chosen request id, so stale updates can be dropped. */
  requestId: number;
  section: 'apps' | 'files';
  /** Current best hits for the section (replaces the previous payload). */
  items: SearchResultItem[];
  /** True on the final update of the whole search. */
  done: boolean;
}

/** A stored AI search session (query + outcome), most recent first. */
export interface AiSessionRecord {
  id: string;
  query: string;
  summary: string;
  insight: string;
  results: SearchResultItem[];
  createdAt: number;
}

/** Structured search plan produced by the LLM from a natural-language query. */
export interface AiSearchPlan {
  /** One-line restatement of what is being searched for, shown to the user. */
  summary: string;
  /** 1-2 model-written sentences of context/tips, shown above the results. */
  insight: string;
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

/** Local semantic-matching diagnostics for one AI request, for the debug view. */
export interface SemanticDebugInfo {
  /** False if the embedding worker/model failed and semantic search is disabled. */
  available: boolean;
  /** How many indexed files currently carry an embedding to compare against. */
  indexedCount: number;
  /** Whether the query itself was embedded in time to run the comparison. */
  queryEmbedded: boolean;
  /** Files that passed the similarity threshold for this query. */
  hitCount: number;
}

/** Everything that happened during one AI request, for the debug view (Cmd/Ctrl+D). */
export interface AiDebugInfo {
  provider: string;
  model: string;
  /** Full prompt sent to the LLM. */
  prompt: string;
  /** Raw model output before JSON extraction. */
  rawResponse: string;
  /** Plan after normalization, as executed locally. */
  plan: AiSearchPlan | null;
  durationMs: number;
  semantic: SemanticDebugInfo;
  /** Full conversation log for agentic strategies. */
  agentSteps?: AgentStep[];
  /** Number of LLM round-trips used. */
  stepsUsed?: number;
}

export interface AiSearchResponse {
  summary: string;
  plan: AiSearchPlan | null;
  results: SearchResultItem[];
  /** Human-readable error (missing API key, provider failure, ...), if any. */
  error?: string;
  debug?: AiDebugInfo;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** Tool call ID, required when role is 'tool'. */
  toolCallId?: string;
  /** Tool calls requested by the assistant. */
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string; // JSON string
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface ChatResponse {
  content: string;
  toolCalls: ToolCall[];
  /** True when the model produced a final text answer with no tool calls. */
  done: boolean;
}

export interface AgentStep {
  role: 'assistant' | 'tool';
  toolName?: string;
  toolArgs?: string;
  content: string;
}

export type AiProviderId = 'gemini' | 'openrouter';

/** Which AI search orchestration strategy to use. */
export type AiSearchStrategyId = 'plan' | 'context';

/** Which local embedding model powers semantic search. */
export type SemanticModelChoice = 'english' | 'multilingual';

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

  // Resource controls
  /** Cap on total indexed entries; the crawl stops once reached. */
  maxIndexedFiles: number;
  /** Cap on files that get a vector embedding (0 disables semantic search). */
  maxSemanticFiles: number;
  /** Per-query execution budget in milliseconds; scans break early past it. */
  maxQueryTimeMs: number;
  semanticModel: SemanticModelChoice;

  // AI Strategy controls
  /** AI search orchestration strategy */
  aiSearchStrategy: AiSearchStrategyId;
  /** Max agent steps in context-aware mode (default: 5). */
  agenticMaxSteps: number;
}

export interface IndexStatus {
  fileCount: number;
  indexing: boolean;
  lastBuiltMs: number | null;
  /** How many indexed files currently carry a semantic embedding. */
  semanticCount: number;
}
