import type { ResultsList, ListEntry, ListGroup } from './ResultsList';
import type { PreviewPane } from './PreviewPane';
import type { SettingsPanel } from './SettingsPanel';
import type { DebugPanel } from './DebugPanel';
import type { SearchMode, SearchResultItem, AiSessionRecord, AllSearchUpdate, AiSearchResponse } from '../../../shared/types';
import { plural, countLabel, escapeHtml } from '../utils/format';

const ASK_AI_ACTION = 'ask-ai';
const HISTORY_ACTION_PREFIX = 'history:';

const MODE_EMPTY_PROMPT: Record<SearchMode, string> = {
  all: 'Start typing to search your apps and files.',
  apps: 'Start typing to search your applications.',
  files: 'Start typing to search your files.',
  ai: 'Describe what you are looking for in plain language, then press Enter.',
};

export class SearchController {
  private mode: SearchMode = 'all';
  private aiRequestId = 0;
  private lastAiQuery = '';
  private allRequestId = 0;
  private allApps: SearchResultItem[] = [];
  private allFiles: SearchResultItem[] = [];
  private allDone = false;
  private showingAiResults = false;
  private aiHistory: AiSessionRecord[] = [];
  private lastAiResponse: AiSearchResponse | null = null;
  private aiSearchInProgress = false;
  private aiView: 'none' | 'history' | 'session' = 'none';
  private historyIndex = 0;

  constructor(
    private readonly input: HTMLInputElement,
    private readonly aiSummary: HTMLDivElement,
    private readonly indexStatus: HTMLSpanElement,
    private readonly results: ResultsList,
    private readonly previewPane: PreviewPane,
    private readonly settingsPanel: SettingsPanel,
    private readonly debugPanel: DebugPanel,
    private readonly callbacks: {
      setResultCount: (text: string | null) => void;
      showEmptyState: (message: string | null) => void;
      refreshIndexStatus: () => void;
    }
  ) {}

  get currentMode(): SearchMode {
    return this.mode;
  }

  get activeAiView(): 'none' | 'history' | 'session' {
    return this.aiView;
  }

  get lastAiQueryVal(): string {
    return this.lastAiQuery;
  }

  get lastAiResponseRecord(): AiSearchResponse | null {
    return this.lastAiResponse;
  }

  get isAiSearchInProgress(): boolean {
    return this.aiSearchInProgress;
  }

  get isShowingAiResults(): boolean {
    return this.showingAiResults;
  }

  setMode(mode: SearchMode): void {
    this.mode = mode;
    this.aiSummary.classList.add('hidden');
    this.aiView = 'none';
    this.previewPane.show(false);
    this.callbacks.setResultCount(null);
    this.results.clear();
    this.lastAiQuery = '';
    this.showingAiResults = false;
    this.allRequestId++;

    if (mode === 'ai') {
      this.input.value = '';
      void this.showAiHistory();
    } else if (this.input.value.trim() !== '') {
      this.runSearchForMode();
    } else {
      this.callbacks.showEmptyState(MODE_EMPTY_PROMPT[mode]);
    }
  }

  handleInput(debouncedSearch: () => void): void {
    if (this.mode === 'ai') {
      if (this.input.value.trim() === '') {
        this.results.clear();
        this.aiSummary.classList.add('hidden');
        this.callbacks.setResultCount(null);
        void this.showAiHistory();
      } else if (this.aiView === 'history') {
        this.aiView = 'none';
        this.previewPane.show(false);
      }
      return;
    }
    debouncedSearch();
  }

  runSearchForMode(): void {
    switch (this.mode) {
      case 'all':
        this.startAllSearch();
        break;
      case 'apps':
        void this.runAppSearch();
        break;
      case 'files':
        void this.runFileSearch();
        break;
    }
  }

  handleAllUpdate(update: AllSearchUpdate): void {
    if (this.mode !== 'all' || update.requestId !== this.allRequestId || this.showingAiResults) return;
    if (update.section === 'apps') {
      this.allApps = update.items;
    } else {
      this.allFiles = update.items;
      this.allDone = update.done;
    }
    this.renderAll();
  }

  handleAiUpdate(query: string, intent: string): void {
    if (this.aiSearchInProgress && this.input.value.trim() === query) {
      this.indexStatus.textContent = intent;
    }
  }

  handleSelectionChange(entry: ListEntry | undefined): void {
    if (this.mode !== 'ai' || this.aiView !== 'history') return;
    if (!entry || entry.kind !== 'action' || !entry.id.startsWith(HISTORY_ACTION_PREFIX)) return;
    const index = Number(entry.id.slice(HISTORY_ACTION_PREFIX.length));
    this.historyIndex = index;
    this.previewPane.render(this.aiHistory[index] ?? null);
  }

  handleAction(id: string): void {
    if (id === ASK_AI_ACTION) {
      void this.runAiSearch();
    } else if (id.startsWith(HISTORY_ACTION_PREFIX)) {
      this.restoreAiSession(Number(id.slice(HISTORY_ACTION_PREFIX.length)));
    }
  }

  backToHistory(): void {
    this.input.value = '';
    this.lastAiQuery = '';
    this.aiSummary.classList.add('hidden');
    this.callbacks.setResultCount(null);
    this.results.clear();
    void this.showAiHistory();
    this.input.focus();
  }

  async runAiSearch(): Promise<void> {
    const query = this.input.value.trim();
    if (!query) return;
    const requestId = ++this.aiRequestId;
    const startedInMode = this.mode;
    this.allRequestId++;
    this.showingAiResults = true;
    this.aiSearchInProgress = true;
    this.aiView = 'none';
    this.previewPane.show(false);
    this.callbacks.setResultCount(null);

    this.results.clear();
    this.callbacks.showEmptyState(null);
    this.setAiSummary('<span class="spinner"></span>Thinking…', false);
    this.indexStatus.textContent = 'Thinking…';

    const response = await window.lightsearch.searchAi(query);
    this.aiSearchInProgress = false;
    this.callbacks.refreshIndexStatus();
    this.lastAiResponse = response;
    if (requestId !== this.aiRequestId || this.mode !== startedInMode) return;

    if (response.error) {
      this.setAiSummary(escapeHtml(response.error), true);
      this.callbacks.showEmptyState(null);
      return;
    }

    this.historyIndex = 0;
    this.showAiHeader(response.summary || 'Results', response.plan?.insight ?? '', startedInMode === 'ai');
    this.results.setItems(response.results);
    this.callbacks.setResultCount(response.results.length > 0 ? countLabel(response.results) : null);
    this.callbacks.showEmptyState(response.results.length === 0 ? 'Nothing matched. Try adding more detail.' : null);
    this.lastAiQuery = query;
  }

  private async showAiHistory(): Promise<void> {
    this.aiHistory = await window.lightsearch.getAiHistory();
    if (this.mode !== 'ai' || this.input.value.trim() !== '') return;
    this.aiView = 'history';
    if (this.aiHistory.length === 0) {
      this.previewPane.show(false);
      this.results.clear();
      this.callbacks.showEmptyState(MODE_EMPTY_PROMPT.ai);
      return;
    }
    this.previewPane.show(true);
    this.results.setGroups([
      {
        title: 'Recent AI searches',
        entries: this.aiHistory.map((session, i) => ({
          kind: 'action' as const,
          id: `${HISTORY_ACTION_PREFIX}${i}`,
          icon: 'history' as const,
          label: session.query,
          sublabel: session.summary,
        })),
      },
    ]);
    this.results.select(Math.min(this.historyIndex, this.aiHistory.length - 1));
    this.callbacks.showEmptyState(null);
  }

  private restoreAiSession(index: number): void {
    const session = this.aiHistory[index];
    if (!session) return;
    this.historyIndex = index;
    this.aiView = 'session';
    this.previewPane.show(false);
    this.input.value = session.query;
    this.lastAiQuery = session.query;
    this.showAiHeader(session.summary, session.insight, true);
    this.results.resetNavigation();
    this.results.setItems(session.results);
    this.callbacks.setResultCount(session.results.length > 0 ? countLabel(session.results) : null);
    this.callbacks.showEmptyState(session.results.length === 0 ? 'This search had no results.' : null);
  }

  private startAllSearch(): void {
    const query = this.input.value.trim();
    const requestId = ++this.allRequestId;
    this.showingAiResults = false;
    this.aiSummary.classList.add('hidden');
    this.allApps = [];
    this.allFiles = [];
    this.allDone = false;

    if (query === '') {
      this.results.clear();
      this.callbacks.setResultCount(null);
      this.callbacks.showEmptyState(MODE_EMPTY_PROMPT.all);
      return;
    }
    this.results.resetNavigation();
    void window.lightsearch.searchAll(query, requestId);
    this.renderAll();
  }

  private async runLocalSearch(
    mode: 'apps' | 'files',
    searchFn: (query: string) => Promise<SearchResultItem[]>,
    noun: string,
    emptyPrompt: string,
  ): Promise<void> {
    const query = this.input.value;
    if (query.trim() === '') {
      this.results.clear();
      this.callbacks.setResultCount(null);
      this.callbacks.showEmptyState(emptyPrompt);
      return;
    }
    const items = await searchFn(query);
    if (this.mode !== mode || this.input.value !== query) return;
    this.results.setItems(items);
    this.callbacks.setResultCount(plural(items.length, noun));
    this.callbacks.showEmptyState(items.length === 0 ? `No ${noun}s matching “${query.trim()}”.` : null);
  }

  private runAppSearch(): Promise<void> {
    return this.runLocalSearch('apps', window.lightsearch.searchApps, 'app', MODE_EMPTY_PROMPT.apps);
  }

  private runFileSearch(): Promise<void> {
    return this.runLocalSearch('files', window.lightsearch.searchFiles, 'file', MODE_EMPTY_PROMPT.files);
  }

  private renderAll(): void {
    const query = this.input.value.trim();
    if (query === '') return;
    const counts = `${plural(this.allApps.length, 'app')} · ${plural(this.allFiles.length, 'file')}`;
    this.callbacks.setResultCount(this.allDone ? counts : `${counts}…`);

    const groups: ListGroup[] = [];
    if (this.allApps.length > 0) {
      groups.push({
        title: 'Applications',
        entries: this.allApps.map((item) => ({ kind: 'item' as const, item })),
      });
    }
    if (this.allFiles.length > 0) {
      groups.push({
        title: 'Files',
        entries: this.allFiles.map((item) => ({ kind: 'item' as const, item })),
      });
    }
    const nothingFound = this.allDone && this.allApps.length === 0 && this.allFiles.length === 0;
    groups.push({
      entries: [
        {
          kind: 'action',
          id: ASK_AI_ACTION,
          icon: 'sparkles',
          label: `Ask AI about “${query}”`,
          sublabel: nothingFound
            ? 'Nothing matched by name — try describing it to AI'
            : 'Search with your AI provider instead',
        },
      ],
    });
    this.results.setGroups(groups);
    this.callbacks.showEmptyState(null);
  }

  private setAiSummary(html: string, isError: boolean): void {
    this.aiSummary.innerHTML = html;
    this.aiSummary.classList.toggle('error', isError);
    this.aiSummary.classList.remove('hidden');
  }

  private showAiHeader(summary: string, insight: string, withBack: boolean): void {
    this.aiSummary.replaceChildren();
    this.aiSummary.classList.remove('error');
    const row = document.createElement('div');
    row.className = 'ai-summary-row';
    if (withBack) {
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'back-button';
      back.textContent = '‹ History';
      back.addEventListener('click', () => this.backToHistory());
      row.append(back);
    }
    const text = document.createElement('span');
    text.className = 'ai-summary-text';
    text.textContent = summary;
    row.append(text);
    this.aiSummary.append(row);
    if (insight) {
      const tip = document.createElement('div');
      tip.className = 'ai-insight';
      tip.textContent = insight;
      this.aiSummary.append(tip);
    }
    this.aiSummary.classList.remove('hidden');
  }
}
