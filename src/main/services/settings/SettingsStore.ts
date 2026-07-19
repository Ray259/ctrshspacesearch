import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AppSettings } from '../../../shared/types';
import { DEFAULT_FREE_MODEL } from '../ai/OpenRouterModels';

/** Former defaults that no longer exist upstream; migrated to the current one. */
const RETIRED_OPENROUTER_MODELS = new Set(['meta-llama/llama-3.3-70b-instruct:free']);

export const DEFAULT_SETTINGS: AppSettings = {
  aiProvider: 'openrouter',
  geminiApiKey: '',
  geminiModel: 'gemini-2.0-flash',
  openRouterApiKey: '',
  openRouterModel: DEFAULT_FREE_MODEL,
  searchShortcut: 'CommandOrControl+Shift+Space',
  aiSearchShortcut: 'CommandOrControl+Shift+A',
  indexRoots: [os.homedir()],
  maxIndexedFiles: 200_000,
  maxSemanticFiles: 5_000,
  maxQueryTimeMs: 150,
  semanticModel: 'english',
  aiSearchStrategy: 'plan',
  agenticMaxSteps: 10,
};

/** Bounds for the numeric resource controls; out-of-range values are clamped. */
const NUMERIC_BOUNDS: Record<'maxIndexedFiles' | 'maxSemanticFiles' | 'maxQueryTimeMs' | 'agenticMaxSteps', [min: number, max: number]> = {
  maxIndexedFiles: [1_000, 2_000_000],
  maxSemanticFiles: [0, 100_000],
  maxQueryTimeMs: [50, 10_000],
  agenticMaxSteps: [1, 30],
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
    for (const key of Object.keys(NUMERIC_BOUNDS) as Array<keyof typeof NUMERIC_BOUNDS>) {
      const value = clean[key];
      if (value === undefined) continue;
      const [min, max] = NUMERIC_BOUNDS[key];
      if (!Number.isFinite(value)) delete clean[key];
      else clean[key] = Math.min(max, Math.max(min, Math.round(value)));
    }
    if (clean.semanticModel !== undefined && clean.semanticModel !== 'english' && clean.semanticModel !== 'multilingual') {
      delete clean.semanticModel;
    }
    if (clean.aiSearchStrategy !== undefined && clean.aiSearchStrategy !== 'plan' && clean.aiSearchStrategy !== 'context') {
      delete clean.aiSearchStrategy;
    }
    return clean;
  }

  private load(): AppSettings {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      const settings: AppSettings = { ...DEFAULT_SETTINGS, ...raw };
      if (RETIRED_OPENROUTER_MODELS.has(settings.openRouterModel)) {
        settings.openRouterModel = DEFAULT_FREE_MODEL;
      }
      return settings;
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.settings, null, 2));
  }
}
