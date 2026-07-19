import { contextBridge, ipcRenderer } from 'electron';
import type { LightSearchApi } from '../shared/api';
import { IpcChannels } from '../shared/ipc';
import type { AppSettings, SearchMode } from '../shared/types';

const api: LightSearchApi = {
  searchFiles: (query, limit) => ipcRenderer.invoke(IpcChannels.searchFiles, query, limit),
  searchAi: (query) => ipcRenderer.invoke(IpcChannels.searchAi, query),
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
};

contextBridge.exposeInMainWorld('lightsearch', api);
