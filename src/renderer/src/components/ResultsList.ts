import type { SearchResultItem } from '../../../shared/types';
import { formatDate, formatSize, iconFor } from '../utils/format';

export interface ResultsListCallbacks {
  onOpen(item: SearchResultItem): void;
}

/** Renders search hits and owns list selection state (keyboard + mouse). */
export class ResultsList {
  private items: SearchResultItem[] = [];
  private selectedIndex = 0;

  constructor(
    private readonly root: HTMLUListElement,
    private readonly callbacks: ResultsListCallbacks,
  ) {
    this.root.addEventListener('click', (event) => {
      const row = (event.target as HTMLElement).closest<HTMLElement>('[data-index]');
      if (!row) return;
      const item = this.items[Number(row.dataset.index)];
      if (item) this.callbacks.onOpen(item);
    });
  }

  setItems(items: SearchResultItem[]): void {
    this.items = items;
    this.selectedIndex = 0;
    this.render();
  }

  clear(): void {
    this.setItems([]);
  }

  get selected(): SearchResultItem | undefined {
    return this.items[this.selectedIndex];
  }

  get isEmpty(): boolean {
    return this.items.length === 0;
  }

  moveSelection(delta: number): void {
    if (this.items.length === 0) return;
    this.selectedIndex = (this.selectedIndex + delta + this.items.length) % this.items.length;
    this.updateSelectionClasses();
  }

  private render(): void {
    this.root.replaceChildren(
      ...this.items.map((item, index) => this.renderRow(item, index)),
    );
    this.updateSelectionClasses();
  }

  private renderRow(item: SearchResultItem, index: number): HTMLLIElement {
    const li = document.createElement('li');
    li.className = 'result';
    li.dataset.index = String(index);

    const icon = document.createElement('span');
    icon.className = 'result-icon';
    icon.textContent = iconFor(item.name, item.isDir);

    const body = document.createElement('div');
    body.className = 'result-body';
    const name = document.createElement('div');
    name.className = 'result-name';
    name.textContent = item.name;
    const detail = document.createElement('div');
    if (item.matchedBy === 'content' && item.snippet) {
      detail.className = 'result-snippet';
      detail.textContent = item.snippet;
    } else {
      detail.className = 'result-dir';
      detail.textContent = item.dir;
    }
    body.append(name, detail);

    const meta = document.createElement('div');
    meta.className = 'result-meta';
    meta.textContent = [formatSize(item.size), formatDate(item.mtimeMs)].filter(Boolean).join(' · ');

    li.append(icon, body, meta);
    return li;
  }

  private updateSelectionClasses(): void {
    const rows = this.root.children;
    for (let i = 0; i < rows.length; i++) {
      rows[i].classList.toggle('selected', i === this.selectedIndex);
    }
    (rows[this.selectedIndex] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
  }
}
