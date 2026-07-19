import { globalShortcut } from 'electron';
import type { SettingsStore } from '../services/settings/SettingsStore';
import type { SearchWindowManager } from '../windows/SearchWindowManager';

/**
 * Registers the two global shortcuts (regular search and AI search) and
 * re-registers them whenever settings change.
 */
export class ShortcutManager {
  constructor(
    private readonly settings: SettingsStore,
    private readonly windows: SearchWindowManager,
  ) {
    this.settings.on('change', () => this.register());
  }

  register(): void {
    globalShortcut.unregisterAll();
    const { searchShortcut, aiSearchShortcut } = this.settings.get();
    this.tryRegister(searchShortcut, () => this.windows.toggle('files'));
    this.tryRegister(aiSearchShortcut, () => this.windows.toggle('ai'));
  }

  unregisterAll(): void {
    globalShortcut.unregisterAll();
  }

  private tryRegister(accelerator: string, handler: () => void): void {
    if (!accelerator) return;
    try {
      if (!globalShortcut.register(accelerator, handler)) {
        console.warn(`Global shortcut already taken: ${accelerator}`);
      }
    } catch (err) {
      console.warn(`Invalid shortcut "${accelerator}":`, err);
    }
  }
}
