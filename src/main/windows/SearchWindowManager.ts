import { BrowserWindow, screen } from 'electron';
import * as path from 'node:path';
import { IpcChannels } from '../../shared/ipc';
import type { SearchMode } from '../../shared/types';

const WINDOW_WIDTH = 680;
const WINDOW_HEIGHT = 460;

/**
 * Owns the single Spotlight-style panel window: frameless, transparent,
 * centered near the top of the screen, hidden on blur/Escape.
 */
export class SearchWindowManager {
  private window: BrowserWindow | null = null;

  show(mode: SearchMode): void {
    const win = this.ensureWindow();
    this.position(win);
    win.show();
    win.focus();
    win.webContents.send(IpcChannels.windowShown, mode);
  }

  hide(): void {
    this.window?.hide();
  }

  toggle(mode: SearchMode): void {
    if (this.window?.isVisible() && this.window.isFocused()) {
      this.hide();
    } else {
      this.show(mode);
    }
  }

  private ensureWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) return this.window;

    const win = new BrowserWindow({
      width: WINDOW_WIDTH,
      height: WINDOW_HEIGHT,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.on('blur', () => win.hide());
    win.on('closed', () => {
      this.window = null;
    });
    void win.loadFile(path.join(__dirname, '../renderer/index.html'));

    this.window = win;
    return win;
  }

  private position(win: BrowserWindow): void {
    const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const x = workArea.x + Math.round((workArea.width - WINDOW_WIDTH) / 2);
    const y = workArea.y + Math.round(workArea.height * 0.18);
    win.setPosition(x, y);
  }
}
