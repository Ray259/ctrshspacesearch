import type { AppSettings } from '../../../shared/types';

const FIELD_NAMES = [
  'aiProvider',
  'geminiApiKey',
  'geminiModel',
  'openRouterApiKey',
  'openRouterModel',
  'searchShortcut',
  'aiSearchShortcut',
  'semanticModel',
  'aiSearchStrategy',
] as const;

/** Resource-control fields; sent as numbers (main clamps them to sane bounds). */
const NUMBER_FIELD_NAMES = ['maxIndexedFiles', 'maxSemanticFiles', 'maxQueryTimeMs', 'agenticMaxSteps'] as const;

/** The in-window settings form; reads/writes AppSettings through the bridge. */
export class SettingsPanel {
  constructor(
    private readonly form: HTMLFormElement,
    private readonly onSaved: () => void,
  ) {
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.save();
    });
    this.providerSelect().addEventListener('change', () => this.updateProviderVisibility());
    this.form
      .querySelector<HTMLButtonElement>('#rebuild-index')!
      .addEventListener('click', () => void window.lightsearch.rebuildIndex());
  }

  get visible(): boolean {
    return !this.form.classList.contains('hidden');
  }

  async open(): Promise<void> {
    const [settings, freeModels] = await Promise.all([
      window.lightsearch.getSettings(),
      window.lightsearch.getFreeModels(),
    ]);
    this.populateModelOptions(freeModels, settings.openRouterModel);
    for (const name of FIELD_NAMES) {
      this.field(name).value = String(settings[name] ?? '');
    }
    for (const name of NUMBER_FIELD_NAMES) {
      this.field(name).value = String(settings[name] ?? '');
    }
    this.updateProviderVisibility();
    this.form.classList.remove('hidden');
  }

  close(): void {
    this.form.classList.add('hidden');
  }

  private async save(): Promise<void> {
    const patch: Partial<AppSettings> = {};
    for (const name of FIELD_NAMES) {
      (patch as Record<string, string>)[name] = this.field(name).value.trim();
    }
    for (const name of NUMBER_FIELD_NAMES) {
      const value = Number(this.field(name).value);
      if (Number.isFinite(value)) (patch as Record<string, number>)[name] = value;
    }
    await window.lightsearch.saveSettings(patch);
    this.close();
    this.onSaved();
  }

  /** Fills the OpenRouter model select; a stored model outside the pool stays selectable. */
  private populateModelOptions(models: string[], current: string): void {
    const select = this.field('openRouterModel') as HTMLSelectElement;
    const ids = current && !models.includes(current) ? [current, ...models] : models;
    select.replaceChildren(...ids.map((id) => new Option(id.replace(/:free$/, ''), id)));
  }

  private updateProviderVisibility(): void {
    const provider = this.providerSelect().value;
    for (const label of this.form.querySelectorAll<HTMLElement>('[data-provider]')) {
      label.classList.toggle('hidden', label.dataset.provider !== provider);
    }
  }

  private field(name: string): HTMLInputElement | HTMLSelectElement {
    return this.form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement;
  }

  private providerSelect(): HTMLSelectElement {
    return this.field('aiProvider') as HTMLSelectElement;
  }
}
