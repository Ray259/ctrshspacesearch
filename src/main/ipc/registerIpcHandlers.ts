import { ipcMain } from 'electron';
import { IpcChannels } from '../../shared/ipc';
import type { AppSettings } from '../../shared/types';
import type { AiSearchService } from '../services/ai/AiSearchService';
import type { FileActions } from '../services/files/FileActions';
import type { FileIndexer } from '../services/indexing/FileIndexer';
import type { FuzzySearchService } from '../services/search/FuzzySearchService';
import type { SettingsStore } from '../services/settings/SettingsStore';
import type { SearchWindowManager } from '../windows/SearchWindowManager';

export interface IpcDependencies {
  settings: SettingsStore;
  indexer: FileIndexer;
  fileSearch: FuzzySearchService;
  aiSearch: AiSearchService;
  fileActions: FileActions;
  windows: SearchWindowManager;
}

/** Wires every IPC channel to its service. Kept in one place so the surface is auditable. */
export function registerIpcHandlers(deps: IpcDependencies): void {
  const { settings, indexer, fileSearch, aiSearch, fileActions, windows } = deps;

  ipcMain.handle(IpcChannels.searchFiles, (_e, query: string, limit?: number) =>
    fileSearch.search(String(query), limit),
  );

  ipcMain.handle(IpcChannels.searchAi, (_e, query: string) => aiSearch.search(String(query)));

  ipcMain.handle(IpcChannels.openResult, async (_e, filePath: string) => {
    windows.hide();
    await fileActions.open(String(filePath));
  });

  ipcMain.handle(IpcChannels.revealResult, (_e, filePath: string) => {
    windows.hide();
    fileActions.reveal(String(filePath));
  });

  ipcMain.handle(IpcChannels.hideWindow, () => windows.hide());

  ipcMain.handle(IpcChannels.getSettings, () => redact(settings.get()));

  ipcMain.handle(IpcChannels.saveSettings, (_e, patch: Partial<AppSettings>) =>
    redact(settings.update(sanitizePatch(patch))),
  );

  ipcMain.handle(IpcChannels.getIndexStatus, () => indexer.status());

  ipcMain.handle(IpcChannels.rebuildIndex, () => void indexer.rebuild());
}

/** Placeholder kept identical in length-signal so the UI can show "key is set". */
const KEY_SET_PLACEHOLDER = '••••••••';

/** Never ship raw API keys to the renderer; only whether one is set. */
function redact(s: AppSettings): AppSettings {
  return {
    ...s,
    geminiApiKey: s.geminiApiKey ? KEY_SET_PLACEHOLDER : '',
    openRouterApiKey: s.openRouterApiKey ? KEY_SET_PLACEHOLDER : '',
  };
}

/** Ignore the redaction placeholder coming back from the renderer unchanged. */
function sanitizePatch(patch: Partial<AppSettings>): Partial<AppSettings> {
  const clean = { ...patch };
  if (clean.geminiApiKey === KEY_SET_PLACEHOLDER) delete clean.geminiApiKey;
  if (clean.openRouterApiKey === KEY_SET_PLACEHOLDER) delete clean.openRouterApiKey;
  return clean;
}
