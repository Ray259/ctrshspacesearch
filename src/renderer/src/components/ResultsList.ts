import type { SearchResultItem } from '../../../shared/types';
import { formatDate, formatSize } from '../utils/format';
import type { IconName } from '../utils/icons';
import { iconElement, iconNameForFile } from '../utils/icons';

/** A selectable row: either a search hit or a special action ("Ask AI", history entry). */
export type ListEntry =
  | { kind: 'item'; item: SearchResultItem }
  | { kind: 'action'; id: string; icon: IconName; label: string; sublabel?: string };

/** A titled section of rows ("Applications", "Files", …). Title is optional. */
export interface ListGroup {
  title?: string;
  entries: ListEntry[];
}

export interface ResultsListCallbacks {
  onOpen(item: SearchResultItem): void;
  onAction(id: string): void;
  /** Fired whenever the selected entry changes (keyboard, hover or re-render). */
  onSelectionChange?(entry: ListEntry | undefined): void;
}

/**
 * Renders grouped search hits / action rows and owns list selection state
 * (keyboard + mouse). Selection spans groups; section titles are skipped.
 */
export class ResultsList {
  private entries: ListEntry[] = [];
  private rows: HTMLLIElement[] = [];
  private selectedIndex = 0;
  /** Whether the user moved the selection since the last query started. */
  private userNavigated = false;

  constructor(
    private readonly root: HTMLUListElement,
    private readonly callbacks: ResultsListCallbacks,
  ) {
    this.root.addEventListener('click', (event) => {
      const row = (event.target as HTMLElement).closest<HTMLElement>('[data-index]');
      if (!row) return;
      const entry = this.entries[Number(row.dataset.index)];
      if (!entry) return;
      if (entry.kind === 'item') this.callbacks.onOpen(entry.item);
      else this.callbacks.onAction(entry.id);
    });
    // Moving the pointer over a row selects it, launcher-style.
    this.root.addEventListener('mousemove', (event) => {
      const row = (event.target as HTMLElement).closest<HTMLElement>('[data-index]');
      if (!row) return;
      const index = Number(row.dataset.index);
      if (index === this.selectedIndex) return;
      this.userNavigated = true;
      this.selectedIndex = index;
      this.updateSelectionClasses(false);
    });
  }

  /**
   * Replaces the whole list. If the user has moved the selection, it is
   * preserved by identity; otherwise it snaps to the top so streamed-in
   * results (not the trailing "Ask AI" row) become the default choice.
   */
  setGroups(groups: ListGroup[]): void {
    const previousKey = this.userNavigated ? this.selectedKey() : null;
    this.entries = groups.flatMap((g) => g.entries);
    const restored = previousKey === null ? -1 : this.entries.findIndex((e) => entryKey(e) === previousKey);
    this.selectedIndex = restored === -1 ? 0 : restored;
    this.render(groups);
  }

  /** Forget arrow-key navigation; the next update selects the top row again. */
  resetNavigation(): void {
    this.userNavigated = false;
  }

  setItems(items: SearchResultItem[]): void {
    this.setGroups(items.length === 0 ? [] : [{ entries: items.map((item) => ({ kind: 'item' as const, item })) }]);
  }

  clear(): void {
    this.resetNavigation();
    this.setGroups([]);
  }

  get selected(): ListEntry | undefined {
    return this.entries[this.selectedIndex];
  }

  get isEmpty(): boolean {
    return this.entries.length === 0;
  }

  moveSelection(delta: number): void {
    if (this.entries.length === 0) return;
    this.userNavigated = true;
    this.selectedIndex = (this.selectedIndex + delta + this.entries.length) % this.entries.length;
    this.updateSelectionClasses();
  }

  /** Programmatically selects a row by entry index (e.g. restoring history selection). */
  select(index: number): void {
    if (this.entries.length === 0) return;
    this.userNavigated = true;
    this.selectedIndex = Math.max(0, Math.min(index, this.entries.length - 1));
    this.updateSelectionClasses();
  }

  private selectedKey(): string | null {
    const entry = this.entries[this.selectedIndex];
    return entry ? entryKey(entry) : null;
  }

  private render(groups: ListGroup[]): void {
    const nodes: HTMLLIElement[] = [];
    this.rows = [];
    let index = 0;
    for (const group of groups) {
      if (group.entries.length === 0) continue;
      if (group.title) {
        const title = document.createElement('li');
        title.className = 'section-title';
        title.textContent = group.title;
        nodes.push(title);
      }
      for (const entry of group.entries) {
        const row = this.renderRow(entry, index++);
        this.rows.push(row);
        nodes.push(row);
      }
    }
    this.root.replaceChildren(...nodes);
    this.updateSelectionClasses();
  }

  private renderRow(entry: ListEntry, index: number): HTMLLIElement {
    const li = document.createElement('li');
    li.dataset.index = String(index);

    const body = document.createElement('div');
    body.className = 'result-body';
    const name = document.createElement('div');
    name.className = 'result-name';
    const detail = document.createElement('div');

    if (entry.kind === 'item') {
      const item = entry.item;
      li.className = 'result';
      name.textContent = item.name;
      if (item.matchedBy === 'content' && item.snippet) {
        detail.className = 'result-snippet';
        detail.textContent = item.snippet;
      } else {
        detail.className = 'result-dir';
        detail.textContent = item.dir;
      }
      const meta = document.createElement('div');
      meta.className = 'result-meta';
      meta.textContent = [formatSize(item.size), formatDate(item.mtimeMs)].filter(Boolean).join(' · ');
      body.append(name, detail);
      li.append(itemIcon(item), body, meta);
    } else {
      li.className = 'result action';
      name.textContent = entry.label;
      body.append(name);
      if (entry.sublabel) {
        detail.className = 'result-dir';
        detail.textContent = entry.sublabel;
        body.append(detail);
      }
      li.append(iconElement(entry.icon), body);
    }
    return li;
  }

  private updateSelectionClasses(scroll = true): void {
    for (let i = 0; i < this.rows.length; i++) {
      this.rows[i].classList.toggle('selected', i === this.selectedIndex);
    }
    if (scroll) this.rows[this.selectedIndex]?.scrollIntoView({ block: 'nearest' });
    this.callbacks.onSelectionChange?.(this.selected);
  }
}

function entryKey(entry: ListEntry): string {
  return entry.kind === 'item' ? `item:${entry.item.path}` : `action:${entry.id}`;
}

export function itemIcon(item: SearchResultItem): HTMLSpanElement {
  // Apps carry their real OS icon; everything else gets a type glyph.
  if (item.kind === 'app' && item.iconDataUrl) {
    const span = document.createElement('span');
    span.className = 'result-icon';
    const img = document.createElement('img');
    img.className = 'result-app-icon';
    img.src = item.iconDataUrl;
    img.alt = '';
    span.append(img);
    return span;
  }
  return iconElement(item.kind === 'app' ? 'app' : iconNameForFile(item.name, item.isDir));
}
