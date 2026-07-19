import { app } from 'electron';
import { registerIpcHandlers } from './ipc/registerIpcHandlers';
import { AiProviderFactory } from './services/ai/AiProviderFactory';
import { AiSearchService } from './services/ai/AiSearchService';
import { FileActions } from './services/files/FileActions';
import { FileIndex } from './services/indexing/FileIndex';
import { FileIndexer } from './services/indexing/FileIndexer';
import { FuzzySearchService } from './services/search/FuzzySearchService';
import { SettingsStore } from './services/settings/SettingsStore';
import { ShortcutManager } from './shortcuts/ShortcutManager';
import { TrayManager } from './tray/TrayManager';
import { SearchWindowManager } from './windows/SearchWindowManager';

// Single-instance guard: a second launch just summons the search window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  bootstrap();
}

/** Composition root: constructs every service and wires them together. */
function bootstrap(): void {
  const settings = new SettingsStore(app.getPath('userData'));
  const index = new FileIndex(app.getPath('userData'));
  const indexer = new FileIndexer(index, settings);
  const fileSearch = new FuzzySearchService(index);
  const aiSearch = new AiSearchService(index, fileSearch, new AiProviderFactory(settings));
  const fileActions = new FileActions();
  const windows = new SearchWindowManager();
  const shortcuts = new ShortcutManager(settings, windows);
  const tray = new TrayManager(windows, () => void indexer.rebuild());

  app.on('second-instance', () => windows.show('files'));
  app.on('window-all-closed', () => {
    // Keep running in the tray; the search window is created on demand.
  });
  app.on('will-quit', () => {
    shortcuts.unregisterAll();
    indexer.stop();
  });

  void app.whenReady().then(() => {
    // Spotlight-style utility app: no Dock icon on macOS.
    if (process.platform === 'darwin') app.dock?.hide();

    registerIpcHandlers({ settings, indexer, fileSearch, aiSearch, fileActions, windows });
    shortcuts.register();
    tray.create();
    indexer.start();
    windows.show('files');
  });
}
