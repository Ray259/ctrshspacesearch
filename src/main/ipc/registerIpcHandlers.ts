import { ipcMain } from 'electron';
import { IpcChannels } from '../../shared/ipc';
import type { AppSettings } from '../../shared/types';
import type { AiHistoryStore } from '../services/ai/AiHistoryStore';
import type { AiSearchService } from '../services/ai/AiSearchService';
import type { OpenRouterModels } from '../services/ai/OpenRouterModels';
import type { FileActions } from '../services/files/FileActions';
import type { FileIndexer } from '../services/indexing/FileIndexer';
import type { AllSearchService } from '../services/search/AllSearchService';
import type { AppSearchService } from '../services/search/AppSearchService';
import type { FuzzySearchService } from '../services/search/FuzzySearchService';
import type { SettingsStore } from '../services/settings/SettingsStore';
import type { SearchWindowManager } from '../windows/SearchWindowManager';

export interface IpcDependencies {
  settings: SettingsStore;
  indexer: FileIndexer;
  fileSearch: FuzzySearchService;
  appSearch: AppSearchService;
  allSearch: AllSearchService;
  aiSearch: AiSearchService;
  aiHistory: AiHistoryStore;
  openRouterModels: OpenRouterModels;
  fileActions: FileActions;
  windows: SearchWindowManager;
}

/** Wires every IPC channel to its service. Kept in one place so the surface is auditable. */
export function registerIpcHandlers(deps: IpcDependencies): void {
  const {
    settings,
    indexer,
    fileSearch,
    appSearch,
    allSearch,
    aiSearch,
    aiHistory,
    openRouterModels,
    fileActions,
    windows,
  } = deps;

  ipcMain.handle(IpcChannels.searchFiles, (_e, query: string, limit?: number) =>
    fileSearch.search(String(query), limit),
  );

  ipcMain.handle(IpcChannels.searchApps, (_e, query: string, limit?: number) =>
    appSearch.search(String(query), limit),
  );

  ipcMain.handle(IpcChannels.searchAll, (e, query: string, requestId: number) =>
    allSearch.run(e.sender, String(query), Number(requestId)),
  );

  ipcMain.handle(IpcChannels.searchAi, async (e, query: string) => {
    const q = String(query);
    const response = await aiSearch.search(q, (intent: string) => {
      e.sender.send(IpcChannels.searchAiUpdate, q, intent);
    });
    if (!response.error && response.plan) {
      aiHistory.add({
        query: String(query).trim(),
        summary: response.summary,
        insight: response.plan.insight,
        results: response.results,
      });
    }
    return response;
  });

  ipcMain.handle(IpcChannels.getAiHistory, () => aiHistory.list());

  ipcMain.handle(IpcChannels.getFreeModels, () => openRouterModels.listFree());

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
