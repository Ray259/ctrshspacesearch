import type { SearchMode } from '../../shared/types';
import { ResultsList } from './components/ResultsList';
import { SettingsPanel } from './components/SettingsPanel';
import { debounce } from './utils/format';

const FILE_SEARCH_DEBOUNCE_MS = 120;

/** Top-level controller: wires input, mode switching, results and settings. */
export class App {
  private mode: SearchMode = 'files';
  private aiRequestId = 0;
  private lastAiQuery = '';

  private readonly panel = byId<HTMLDivElement>('app');
  private readonly input = byId<HTMLInputElement>('search-input');
  private readonly modeBadge = byId<HTMLSpanElement>('mode-badge');
  private readonly aiSummary = byId<HTMLDivElement>('ai-summary');
  private readonly emptyState = byId<HTMLDivElement>('empty-state');
  private readonly indexStatus = byId<HTMLSpanElement>('index-status');

  private readonly results = new ResultsList(byId<HTMLUListElement>('results'), {
    onOpen: (item) => void window.lightsearch.openResult(item.path),
  });

  private readonly settingsPanel = new SettingsPanel(byId<HTMLFormElement>('settings-panel'), () =>
    this.input.focus(),
  );

  private readonly debouncedFileSearch = debounce(() => void this.runFileSearch(), FILE_SEARCH_DEBOUNCE_MS);

  start(): void {
    window.lightsearch.onWindowShown((mode) => this.handleShown(mode));
    this.input.addEventListener('input', () => this.handleInput());
    document.addEventListener('keydown', (event) => this.handleKeydown(event));
    byId<HTMLButtonElement>('settings-button').addEventListener('click', () => void this.toggleSettings());
    this.setMode('files');
    this.refreshIndexStatus();
    setInterval(() => this.refreshIndexStatus(), 5000);
  }

  private handleShown(mode: SearchMode): void {
    this.settingsPanel.close();
    this.setMode(mode);
    this.input.focus();
    this.input.select();
    this.refreshIndexStatus();
  }

  private setMode(mode: SearchMode): void {
    this.mode = mode;
    this.panel.dataset.mode = mode;
    this.modeBadge.textContent = mode === 'ai' ? 'AI' : 'Files';
    this.input.placeholder =
      mode === 'ai' ? 'Describe the file you are looking for…' : 'Search files…';
    this.aiSummary.classList.add('hidden');
    this.results.clear();
    this.lastAiQuery = '';
    this.showEmptyState(
      mode === 'ai'
        ? 'Describe what you are looking for in plain language, then press Enter.'
        : 'Start typing to search your files.',
    );
  }

  private handleInput(): void {
    if (this.mode === 'files') {
      this.debouncedFileSearch();
    } else if (this.input.value.trim() === '') {
      this.results.clear();
      this.aiSummary.classList.add('hidden');
    }
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
    if (this.settingsPanel.visible) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.results.moveSelection(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.results.moveSelection(-1);
        break;
      case 'Tab':
        event.preventDefault();
        this.setMode(this.mode === 'files' ? 'ai' : 'files');
        this.input.focus();
        break;
      case 'Enter': {
        event.preventDefault();
        const selected = this.results.selected;
        // AI mode: Enter submits the query; once results are shown for the
        // current text, Enter acts on the selection instead.
        if (this.mode === 'ai' && (this.input.value.trim() !== this.lastAiQuery || !selected)) {
          void this.runAiSearch();
        } else if (selected) {
          if (event.metaKey || event.ctrlKey) {
            void window.lightsearch.revealResult(selected.path);
          } else {
            void window.lightsearch.openResult(selected.path);
          }
        }
        break;
      }
    }
  }

  private async runFileSearch(): Promise<void> {
    const query = this.input.value;
    if (query.trim() === '') {
      this.results.clear();
      this.showEmptyState('Start typing to search your files.');
      return;
    }
    const items = await window.lightsearch.searchFiles(query);
    if (this.mode !== 'files' || this.input.value !== query) return; // stale response
    this.results.setItems(items);
    this.showEmptyState(items.length === 0 ? `No files matching “${query.trim()}”.` : null);
  }

  private async runAiSearch(): Promise<void> {
    const query = this.input.value.trim();
    if (!query) return;
    const requestId = ++this.aiRequestId;

    this.results.clear();
    this.showEmptyState(null);
    this.setAiSummary('<span class="spinner"></span>Thinking…', false);

    const response = await window.lightsearch.searchAi(query);
    if (requestId !== this.aiRequestId || this.mode !== 'ai') return; // superseded

    if (response.error) {
      this.setAiSummary(escapeHtml(response.error), true);
      this.showEmptyState(null);
      return;
    }
    this.setAiSummary(escapeHtml(response.summary || 'Results'), false);
    this.results.setItems(response.results);
    this.showEmptyState(response.results.length === 0 ? 'Nothing matched. Try adding more detail.' : null);
    this.lastAiQuery = query;
  }

  private setAiSummary(html: string, isError: boolean): void {
    this.aiSummary.innerHTML = html;
    this.aiSummary.classList.toggle('error', isError);
    this.aiSummary.classList.remove('hidden');
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
    void window.lightsearch.getIndexStatus().then((status) => {
      const count = status.fileCount.toLocaleString();
      this.indexStatus.textContent = status.indexing
        ? `Indexing… ${count} items`
        : `${count} items indexed`;
    });
  }
}

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
