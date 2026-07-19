import type { AiSessionRecord, SearchResultItem } from '../../../shared/types';
import { itemIcon } from './ResultsList';
import { countLabel } from '../utils/format';

export class PreviewPane {
  private active = false;
  private index = 0;
  private items: SearchResultItem[] = [];
  private rows: HTMLLIElement[] = [];

  constructor(
    private readonly pane: HTMLElement,
    private readonly title: HTMLDivElement,
    private readonly list: HTMLUListElement,
    private readonly resultsArea: HTMLDivElement,
  ) {}

  get previewActive(): boolean {
    return this.active;
  }

  get previewItems(): SearchResultItem[] {
    return this.items;
  }

  get previewIndex(): number {
    return this.index;
  }

  show(visible: boolean): void {
    this.pane.classList.toggle('hidden', !visible);
    if (!visible) this.setActive(false);
  }

  setActive(active: boolean): void {
    this.active = active;
    this.resultsArea.classList.toggle('preview-active', active);
    if (active && this.index >= this.items.length) this.index = 0;
    this.updateSelection();
  }

  move(delta: number): void {
    if (this.items.length === 0) return;
    this.index = (this.index + delta + this.items.length) % this.items.length;
    this.updateSelection();
  }

  render(session: AiSessionRecord | null): void {
    this.items = session?.results ?? [];
    this.index = 0;
    this.setActive(false);
    this.title.textContent = this.items.length === 0 ? 'Preview' : countLabel(this.items);

    this.rows = [];
    const elements: HTMLLIElement[] = [];
    if (this.items.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'preview-empty';
      empty.textContent = 'This search had no results.';
      elements.push(empty);
    }
    this.items.forEach((item, i) => {
      const li = document.createElement('li');
      li.className = 'result';
      const body = document.createElement('div');
      body.className = 'result-body';
      const name = document.createElement('div');
      name.className = 'result-name';
      name.textContent = item.name;
      const dir = document.createElement('div');
      dir.className = 'result-dir';
      dir.textContent = item.dir;
      body.append(name, dir);
      li.append(itemIcon(item), body);
      li.addEventListener('click', () => void window.lightsearch.openResult(item.path));
      li.addEventListener('mousemove', () => {
        if (!this.active) this.setActive(true);
        if (this.index !== i) {
          this.index = i;
          this.updateSelection(false);
        }
      });
      this.rows.push(li);
      elements.push(li);
    });
    this.list.replaceChildren(...elements);
  }

  private updateSelection(scroll = true): void {
    for (let i = 0; i < this.rows.length; i++) {
      this.rows[i].classList.toggle('selected', this.active && i === this.index);
    }
    if (scroll && this.active) this.rows[this.index]?.scrollIntoView({ block: 'nearest' });
  }
}


