import type {
  AiSearchResponse,
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
  searchAi(query: string): Promise<AiSearchResponse>;
  openResult(path: string): Promise<void>;
  revealResult(path: string): Promise<void>;
  hideWindow(): Promise<void>;
  getSettings(): Promise<AppSettings>;
  saveSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
  getIndexStatus(): Promise<IndexStatus>;
  rebuildIndex(): Promise<void>;
  /** Fired every time the window is shown; carries the mode to display. */
  onWindowShown(listener: (mode: SearchMode) => void): void;
}
