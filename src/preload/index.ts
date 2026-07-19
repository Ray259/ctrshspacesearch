import { contextBridge, ipcRenderer } from 'electron';
import type { LightSearchApi } from '../shared/api';
import { IpcChannels } from '../shared/ipc';
import type { AllSearchUpdate, AppSettings, SearchMode } from '../shared/types';

const api: LightSearchApi = {
  searchFiles: (query, limit) => ipcRenderer.invoke(IpcChannels.searchFiles, query, limit),
  searchApps: (query, limit) => ipcRenderer.invoke(IpcChannels.searchApps, query, limit),
  searchAll: (query, requestId) => ipcRenderer.invoke(IpcChannels.searchAll, query, requestId),
  searchAi: (query) => ipcRenderer.invoke(IpcChannels.searchAi, query),
  getAiHistory: () => ipcRenderer.invoke(IpcChannels.getAiHistory),
  getFreeModels: () => ipcRenderer.invoke(IpcChannels.getFreeModels),
  openResult: (path) => ipcRenderer.invoke(IpcChannels.openResult, path),
  revealResult: (path) => ipcRenderer.invoke(IpcChannels.revealResult, path),
  hideWindow: () => ipcRenderer.invoke(IpcChannels.hideWindow),
  getSettings: () => ipcRenderer.invoke(IpcChannels.getSettings),
  saveSettings: (patch: Partial<AppSettings>) => ipcRenderer.invoke(IpcChannels.saveSettings, patch),
  getIndexStatus: () => ipcRenderer.invoke(IpcChannels.getIndexStatus),
  rebuildIndex: () => ipcRenderer.invoke(IpcChannels.rebuildIndex),
  onWindowShown: (listener) => {
    ipcRenderer.on(IpcChannels.windowShown, (_event, mode: SearchMode) => listener(mode));
  },
  onAllSearchUpdate: (listener) => {
    ipcRenderer.on(IpcChannels.searchAllUpdate, (_event, update: AllSearchUpdate) => listener(update));
  },
  onSearchAiUpdate: (listener) => {
    ipcRenderer.on(IpcChannels.searchAiUpdate, (_event, query: string, intent: string) => listener(query, intent));
  },
};

contextBridge.exposeInMainWorld('lightsearch', api);
