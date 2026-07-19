import type { SearchMode } from '../../shared/types';
import type { ListEntry } from './components/ResultsList';
import { ResultsList } from './components/ResultsList';
import { SettingsPanel } from './components/SettingsPanel';
import { DebugPanel } from './components/DebugPanel';
import { PreviewPane } from './components/PreviewPane';
import { SearchController } from './components/SearchController';
import { debounce } from './utils/format';

const SEARCH_DEBOUNCE_MS = 120;
const MODE_ORDER: SearchMode[] = ['all', 'apps', 'files', 'ai'];
const MODE_BADGE: Record<SearchMode, string> = { all: 'All', apps: 'Apps', files: 'Files', ai: 'AI' };
const MODE_PLACEHOLDER: Record<SearchMode, string> = {
  all: 'Search apps and files…',
  apps: 'Search applications…',
  files: 'Search files…',
  ai: 'Describe the file you are looking for…',
};

export class App {
  private readonly panel = byId<HTMLDivElement>('app');
  private readonly input = byId<HTMLInputElement>('search-input');
  private readonly modeBadge = byId<HTMLSpanElement>('mode-badge');
  private readonly aiSummary = byId<HTMLDivElement>('ai-summary');
  private readonly resultCount = byId<HTMLDivElement>('result-count');
  private readonly resultsArea = byId<HTMLDivElement>('results-area');
  private readonly emptyState = byId<HTMLDivElement>('empty-state');
  private readonly indexStatus = byId<HTMLSpanElement>('index-status');

  private readonly results = new ResultsList(byId<HTMLUListElement>('results'), {
    onOpen: (item) => void window.lightsearch.openResult(item.path),
    onAction: (id) => this.searchController.handleAction(id),
    onSelectionChange: (entry) => this.searchController.handleSelectionChange(entry),
  });

  private readonly settingsPanel = new SettingsPanel(byId<HTMLFormElement>('settings-panel'), () =>
    this.input.focus(),
  );

  private readonly debugPanel = new DebugPanel(byId<HTMLDivElement>('debug-panel'), () =>
    this.input.focus(),
  );

  private readonly previewPane = new PreviewPane(
    byId<HTMLElement>('ai-preview'),
    byId<HTMLDivElement>('ai-preview-title'),
    byId<HTMLUListElement>('ai-preview-list'),
    this.resultsArea,
  );

  private readonly searchController = new SearchController(
    this.input,
    this.aiSummary,
    this.indexStatus,
    this.results,
    this.previewPane,
    this.settingsPanel,
    this.debugPanel,
    {
      setResultCount: (text) => this.setResultCount(text),
      showEmptyState: (msg) => this.showEmptyState(msg),
      refreshIndexStatus: () => this.refreshIndexStatus(),
    },
  );

  private readonly debouncedSearch = debounce(() => this.searchController.runSearchForMode(), SEARCH_DEBOUNCE_MS);

  start(): void {
    window.lightsearch.onWindowShown((mode) => this.handleShown(mode));
    window.lightsearch.onAllSearchUpdate((update) => this.searchController.handleAllUpdate(update));
    window.lightsearch.onSearchAiUpdate((query, intent) => this.searchController.handleAiUpdate(query, intent));
    this.input.addEventListener('input', () => this.searchController.handleInput(this.debouncedSearch));
    document.addEventListener('keydown', (event) => this.handleKeydown(event));
    byId<HTMLButtonElement>('settings-button').addEventListener('click', () => void this.toggleSettings());
    this.setMode('all');
    this.refreshIndexStatus();
    setInterval(() => this.refreshIndexStatus(), 5000);
  }

  private handleShown(mode: SearchMode): void {
    this.settingsPanel.close();
    this.debugPanel.close();
    this.setMode(mode);
    this.input.focus();
    this.input.select();
    this.refreshIndexStatus();
  }

  private setMode(mode: SearchMode): void {
    this.panel.dataset.mode = mode;
    this.modeBadge.textContent = MODE_BADGE[mode];
    this.input.placeholder = MODE_PLACEHOLDER[mode];
    this.searchController.setMode(mode);
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (this.settingsPanel.visible) {
        this.settingsPanel.close();
        this.input.focus();
      } else {
        void window.lightsearch.hideWindow();
      }
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      this.debugPanel.toggle(this.searchController.lastAiResponseRecord);
      return;
    }
    if (this.debugPanel.visible) return;
    if (this.settingsPanel.visible) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (this.previewPane.previewActive) this.previewPane.move(1);
        else this.results.moveSelection(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (this.previewPane.previewActive) this.previewPane.move(-1);
        else this.results.moveSelection(-1);
        break;
      case 'ArrowRight':
        if (
          this.searchController.currentMode === 'ai' &&
          this.searchController.activeAiView === 'history' &&
          !this.previewPane.previewActive &&
          this.previewPane.previewItems.length > 0
        ) {
          event.preventDefault();
          this.previewPane.setActive(true);
        }
        break;
      case 'ArrowLeft':
        if (this.previewPane.previewActive) {
          event.preventDefault();
          this.previewPane.setActive(false);
        } else if (this.searchController.currentMode === 'ai' && this.searchController.activeAiView === 'session') {
          event.preventDefault();
          this.searchController.backToHistory();
        }
        break;
      case 'Tab': {
        event.preventDefault();
        const next = MODE_ORDER[(MODE_ORDER.indexOf(this.searchController.currentMode) + 1) % MODE_ORDER.length];
        this.setMode(next);
        this.input.focus();
        break;
      }
      case 'Enter': {
        event.preventDefault();
        if (this.previewPane.previewActive) {
          const item = this.previewPane.previewItems[this.previewPane.previewIndex];
          if (item) {
            if (event.metaKey || event.ctrlKey) void window.lightsearch.revealResult(item.path);
            else void window.lightsearch.openResult(item.path);
          }
          break;
        }
        const selected = this.results.selected;
        if (
          this.searchController.currentMode === 'ai' &&
          this.input.value.trim() !== '' &&
          (this.input.value.trim() !== this.searchController.lastAiQueryVal || !selected)
        ) {
          void this.searchController.runAiSearch();
        } else if (selected) {
          this.activate(selected, event.metaKey || event.ctrlKey);
        }
        break;
      }
    }
  }

  private activate(entry: ListEntry, reveal: boolean): void {
    if (entry.kind === 'action') {
      this.searchController.handleAction(entry.id);
    } else if (reveal) {
      void window.lightsearch.revealResult(entry.item.path);
    } else {
      void window.lightsearch.openResult(entry.item.path);
    }
  }

  private setResultCount(text: string | null): void {
    this.resultCount.classList.toggle('hidden', text === null);
    this.resultCount.textContent = text ?? '';
  }

  private showEmptyState(message: string | null): void {
    this.emptyState.classList.toggle('hidden', message === null);
    this.emptyState.textContent = message ?? '';
  }

  private async toggleSettings(): Promise<void> {
    if (this.settingsPanel.visible) {
      this.settingsPanel.close();
      this.input.focus();
    } else {
      await this.settingsPanel.open();
    }
  }

  private refreshIndexStatus(): void {
    if (this.searchController.isAiSearchInProgress) return;
    void window.lightsearch.getIndexStatus().then((status) => {
      const count = status.fileCount.toLocaleString();
      const semantic = status.semanticCount > 0 ? ` · ${status.semanticCount.toLocaleString()} semantic` : '';
      this.indexStatus.textContent = status.indexing
        ? `Indexing… ${count} items`
        : `${count} items indexed${semantic}`;
    });
  }
}

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}
