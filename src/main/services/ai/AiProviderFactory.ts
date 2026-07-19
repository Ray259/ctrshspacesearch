import type { SettingsStore } from '../settings/SettingsStore';
import type { AiProvider } from './AiProvider';
import { GeminiProvider } from './GeminiProvider';
import { OpenRouterProvider } from './OpenRouterProvider';

/** Builds the configured AiProvider strategy from current settings. */
export class AiProviderFactory {
  constructor(private readonly settings: SettingsStore) {}

  create(): AiProvider {
    const s = this.settings.get();
    switch (s.aiProvider) {
      case 'gemini':
        return new GeminiProvider(s.geminiApiKey, s.geminiModel);
      case 'openrouter':
        return new OpenRouterProvider(s.openRouterApiKey, s.openRouterModel);
    }
  }
}
