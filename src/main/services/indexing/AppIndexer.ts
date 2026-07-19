import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { FileRecord } from '../../../shared/types';

const RESCAN_INTERVAL_MS = 30 * 60 * 1000;
const MAX_DEPTH = 3;

interface PlatformSpec {
  roots: string[];
  /** Launcher entry extensions for the platform (lowercase, with dot). */
  extensions: Set<string>;
}

function platformSpec(): PlatformSpec {
  switch (process.platform) {
    case 'darwin':
      return {
        roots: ['/Applications', '/System/Applications', path.join(os.homedir(), 'Applications')],
        extensions: new Set(['.app']),
      };
    case 'win32': {
      const roots: string[] = [];
      if (process.env.ProgramData) {
        roots.push(path.join(process.env.ProgramData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'));
      }
      if (process.env.APPDATA) {
        roots.push(path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs'));
      }
      return { roots, extensions: new Set(['.lnk']) };
    }
    default:
      return {
        roots: ['/usr/share/applications', path.join(os.homedir(), '.local/share/applications')],
        extensions: new Set(['.desktop']),
      };
  }
}

/**
 * In-memory index of installed applications (macOS .app bundles, Windows
 * Start Menu shortcuts, Linux .desktop entries). Small enough to rescan
 * eagerly; no disk cache needed.
 */
export class AppIndexer {
  private records: FileRecord[] = [];
  private scanning = false;
  private refreshTimer: NodeJS.Timeout | null = null;

  all(): readonly FileRecord[] {
    return this.records;
  }

  start(): void {
    void this.rescan();
    this.refreshTimer = setInterval(() => void this.rescan(), RESCAN_INTERVAL_MS);
    this.refreshTimer.unref();
  }

  stop(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  async rescan(): Promise<void> {
    if (this.scanning) return;
    this.scanning = true;
    try {
      const { roots, extensions } = platformSpec();
      const found: FileRecord[] = [];
      for (const root of roots) {
        await this.crawl(root, extensions, found);
      }
      this.records = found;
    } catch (err) {
      console.warn('Application scan failed:', err);
    } finally {
      this.scanning = false;
    }
  }

  private async crawl(root: string, extensions: Set<string>, out: FileRecord[]): Promise<void> {
    const stack: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
    while (stack.length > 0) {
      const { dir, depth } = stack.pop()!;
      let entries: fs.Dirent[];
      try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const ext = path.extname(entry.name).toLowerCase();
        const full = path.join(dir, entry.name);
        if (extensions.has(ext)) {
          // .app bundles are directories; never descend into them.
          out.push({
            path: full,
            name: entry.name.slice(0, -ext.length),
            ext,
            dir,
            size: 0,
            mtimeMs: 0,
            isDir: false,
          });
        } else if (entry.isDirectory() && depth < MAX_DEPTH) {
          stack.push({ dir: full, depth: depth + 1 });
        }
      }
    }
  }
}
