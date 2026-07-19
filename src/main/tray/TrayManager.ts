import { Menu, Tray, app, nativeImage } from 'electron';
import * as path from 'node:path';
import type { SearchWindowManager } from '../windows/SearchWindowManager';

/** System tray icon with quick actions; keeps the app reachable while windowless. */
export class TrayManager {
  private tray: Tray | null = null;

  constructor(
    private readonly windows: SearchWindowManager,
    private readonly rebuildIndex: () => void,
  ) {}

  create(): void {
    const iconPath = path.join(__dirname, '../assets/trayTemplate.png');
    let icon = nativeImage.createFromPath(iconPath);
    if (process.platform === 'darwin') icon.setTemplateImage(true);
    if (icon.isEmpty()) icon = nativeImage.createEmpty();

    this.tray = new Tray(icon);
    this.tray.setToolTip('LightSearch');
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Search', click: () => this.windows.show('all') },
        { label: 'AI Search', click: () => this.windows.show('ai') },
        { type: 'separator' },
        { label: 'Rebuild Index', click: () => this.rebuildIndex() },
        { type: 'separator' },
        { label: 'Quit LightSearch', click: () => app.quit() },
      ]),
    );
    this.tray.on('click', () => this.windows.show('all'));
  }
}
