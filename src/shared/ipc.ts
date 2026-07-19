/** Single source of truth for IPC channel names shared by main, preload and renderer. */
export const IpcChannels = {
  // renderer -> main (invoke)
  searchFiles: 'search:files',
  searchAi: 'search:ai',
  openResult: 'result:open',
  revealResult: 'result:reveal',
  hideWindow: 'window:hide',
  getSettings: 'settings:get',
  saveSettings: 'settings:save',
  getIndexStatus: 'index:status',
  rebuildIndex: 'index:rebuild',
  // main -> renderer (send)
  windowShown: 'window:shown',
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];
