import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AppSettings } from '../../../shared/types';

export const DEFAULT_SETTINGS: AppSettings = {
  aiProvider: 'openrouter',
  geminiApiKey: '',
  geminiModel: 'gemini-2.0-flash',
  openRouterApiKey: '',
  openRouterModel: 'meta-llama/llama-3.3-70b-instruct:free',
  searchShortcut: 'CommandOrControl+Shift+Space',
  aiSearchShortcut: 'CommandOrControl+Shift+A',
  indexRoots: [os.homedir()],
};

/**
 * JSON-file-backed settings repository. Emits 'change' with the new settings
 * so dependents (shortcuts, indexer) can react without polling.
 */
export class SettingsStore extends EventEmitter {
  private readonly file: string;
  private settings: AppSettings;

  constructor(userDataDir: string) {
    super();
    this.file = path.join(userDataDir, 'settings.json');
    this.settings = this.load();
  }

  get(): AppSettings {
    return { ...this.settings };
  }

  update(patch: Partial<AppSettings>): AppSettings {
    this.settings = { ...this.settings, ...this.sanitize(patch) };
    this.persist();
    this.emit('change', this.get());
    return this.get();
  }

  private sanitize(patch: Partial<AppSettings>): Partial<AppSettings> {
    const clean: Partial<AppSettings> = { ...patch };
    if (clean.indexRoots) {
      clean.indexRoots = clean.indexRoots.map((r) => r.trim()).filter(Boolean);
      if (clean.indexRoots.length === 0) delete clean.indexRoots;
    }
    return clean;
  }

  private load(): AppSettings {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return { ...DEFAULT_SETTINGS, ...raw };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.settings, null, 2));
  }
}
