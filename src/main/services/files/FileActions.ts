import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { app, shell } from 'electron';

const execFileAsync = promisify(execFile);
const ICON_CACHE_LIMIT = 500;

/** Thin wrapper over Electron shell so file actions are mockable and in one place. */
export class FileActions {
  private readonly iconCache = new Map<string, string>();

  async open(filePath: string): Promise<void> {
    const error = await shell.openPath(filePath);
    if (error) throw new Error(error);
  }

  reveal(filePath: string): void {
    shell.showItemInFolder(filePath);
  }

  /** Native OS icon for a path as a data URL; '' when the OS has none. */
  async icon(filePath: string): Promise<string> {
    const cached = this.iconCache.get(filePath);
    if (cached !== undefined) return cached;

    let dataUrl = '';
    // Electron's getFileIcon returns a generic placeholder for macOS .app
    // bundles, so extract the real icon from the bundle instead.
    if (process.platform === 'darwin' && filePath.endsWith('.app')) {
      dataUrl = await macAppBundleIcon(filePath);
    }
    if (!dataUrl) {
      try {
        const image = await app.getFileIcon(filePath, { size: 'normal' });
        if (!image.isEmpty()) dataUrl = image.toDataURL();
      } catch {
        // Unsupported path or platform quirk: fall through to ''.
      }
    }
    if (this.iconCache.size >= ICON_CACHE_LIMIT) this.iconCache.clear();
    this.iconCache.set(filePath, dataUrl);
    return dataUrl;
  }
}

/** Finds the bundle's .icns and converts it to a 64px PNG with `sips`. */
async function macAppBundleIcon(appPath: string): Promise<string> {
  const resources = path.join(appPath, 'Contents', 'Resources');
  const icnsPath = await findIcnsFile(appPath, resources);
  if (!icnsPath) return '';

  const tmpPng = path.join(os.tmpdir(), `lightsearch-icon-${randomUUID()}.png`);
  try {
    await execFileAsync('sips', ['-s', 'format', 'png', '-z', '64', '64', icnsPath, '--out', tmpPng]);
    const png = await fs.promises.readFile(tmpPng);
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch {
    return '';
  } finally {
    fs.promises.unlink(tmpPng).catch(() => {});
  }
}

async function findIcnsFile(appPath: string, resources: string): Promise<string> {
  // Info.plist names the icon; plutil handles both XML and binary plists.
  try {
    const { stdout } = await execFileAsync('plutil', [
      '-convert', 'json', '-o', '-',
      path.join(appPath, 'Contents', 'Info.plist'),
    ]);
    const iconFile: unknown = JSON.parse(stdout).CFBundleIconFile;
    if (typeof iconFile === 'string' && iconFile) {
      const named = path.join(resources, iconFile.endsWith('.icns') ? iconFile : `${iconFile}.icns`);
      if (fs.existsSync(named)) return named;
    }
  } catch {
    // Fall through to scanning Resources.
  }
  // No usable CFBundleIconFile (e.g. asset-catalog apps): take any .icns.
  try {
    const entries = await fs.promises.readdir(resources);
    const icns =
      entries.find((f) => f.toLowerCase() === 'appicon.icns') ?? entries.find((f) => f.endsWith('.icns'));
    return icns ? path.join(resources, icns) : '';
  } catch {
    return '';
  }
}
