import type {
  AiSearchResponse,
  AiSessionRecord,
  AllSearchUpdate,
  AppSettings,
  IndexStatus,
  SearchMode,
  SearchResultItem,
} from './types';

/**
 * The bridge API exposed to the renderer by the preload script
 * (available as `window.lightsearch`).
 */
export interface LightSearchApi {
  searchFiles(query: string, limit?: number): Promise<SearchResultItem[]>;
  searchApps(query: string, limit?: number): Promise<SearchResultItem[]>;
  /**
   * Kicks off a streaming All-mode search; results arrive incrementally via
   * `onAllSearchUpdate`. A newer requestId cancels the previous search.
   */
  searchAll(query: string, requestId: number): Promise<void>;
  searchAi(query: string): Promise<AiSearchResponse>;
  getAiHistory(): Promise<AiSessionRecord[]>;
  /** Free OpenRouter model ids (live list, cached; static pool offline). */
  getFreeModels(): Promise<string[]>;
  openResult(path: string): Promise<void>;
  revealResult(path: string): Promise<void>;
  hideWindow(): Promise<void>;
  getSettings(): Promise<AppSettings>;
  saveSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
  getIndexStatus(): Promise<IndexStatus>;
  rebuildIndex(): Promise<void>;
  /** Fired every time the window is shown; carries the mode to display. */
  onWindowShown(listener: (mode: SearchMode) => void): void;
  /** Fired as All-mode results stream in from the main process. */
  onAllSearchUpdate(listener: (update: AllSearchUpdate) => void): void;
  /** Fired when the AI search agent updates its current intent or task. */
  onSearchAiUpdate(listener: (query: string, intent: string) => void): void;
}
