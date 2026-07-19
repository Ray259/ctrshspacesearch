import * as path from 'node:path';
import { app } from 'electron';
import { registerIpcHandlers } from './ipc/registerIpcHandlers';
import { AiHistoryStore } from './services/ai/AiHistoryStore';
import { AiProviderFactory } from './services/ai/AiProviderFactory';
import { AiSearchService } from './services/ai/AiSearchService';
import { PlanSearchStrategy } from './services/ai/strategies/PlanSearchStrategy';
import { ContextSearchStrategy } from './services/ai/strategies/ContextSearchStrategy';
import { McpClientManager } from './services/mcp/McpClientManager';
import type { AiSearchStrategy } from './services/ai/strategies/AiSearchStrategy';
import type { AiSearchStrategyId } from '../shared/types';
import { OpenRouterModels } from './services/ai/OpenRouterModels';
import { FileActions } from './services/files/FileActions';
import { AppIndexer } from './services/indexing/AppIndexer';
import { FileIndex } from './services/indexing/FileIndex';
import { FileIndexer } from './services/indexing/FileIndexer';
import { AllSearchService } from './services/search/AllSearchService';
import { AppSearchService } from './services/search/AppSearchService';
import { FuzzySearchService } from './services/search/FuzzySearchService';
import { EmbeddingService } from './services/semantic/EmbeddingService';
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
  const embedder = new EmbeddingService(settings, path.join(app.getPath('userData'), 'models'));
  const indexer = new FileIndexer(index, settings, embedder);
  const appIndexer = new AppIndexer();
  const fileActions = new FileActions();
  const fileSearch = new FuzzySearchService(index);
  const appSearch = new AppSearchService(appIndexer, fileActions);
  const allSearch = new AllSearchService(index, fileSearch, appSearch, settings, embedder);
  const providerFactory = new AiProviderFactory(settings);
  const planStrategy = new PlanSearchStrategy(index, fileSearch, providerFactory, settings, embedder);
  const mcpClient = new McpClientManager(settings);
  const contextStrategy = new ContextSearchStrategy(providerFactory, settings, embedder, mcpClient);
  const strategies = new Map<AiSearchStrategyId, AiSearchStrategy>([
    ['plan', planStrategy],
    ['context', contextStrategy],
  ]);
  const aiSearch = new AiSearchService(strategies, settings);
  const aiHistory = new AiHistoryStore(app.getPath('userData'));
  const openRouterModels = new OpenRouterModels();
  const windows = new SearchWindowManager();
  const shortcuts = new ShortcutManager(settings, windows);
  const tray = new TrayManager(windows, () => void indexer.rebuild());

  app.on('second-instance', () => windows.show('all'));
  app.on('window-all-closed', () => {
    // Keep running in the tray; the search window is created on demand.
  });
  app.on('will-quit', () => {
    shortcuts.unregisterAll();
    indexer.stop();
    appIndexer.stop();
    embedder.stop();
    mcpClient.stop();
  });

  void app.whenReady().then(() => {
    // Spotlight-style utility app: no Dock icon on macOS.
    if (process.platform === 'darwin') app.dock?.hide();

    registerIpcHandlers({
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
    });
    shortcuts.register();
    tray.create();
    indexer.start();
    appIndexer.start();
    embedder.warmUp(); // loads the model in the background, before the first search
    windows.show('all');
  });
}
