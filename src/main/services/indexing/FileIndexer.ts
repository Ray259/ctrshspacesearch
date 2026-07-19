import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { IndexStatus } from '../../../shared/types';
import type { FileRecord } from '../../../shared/types';
import type { SettingsStore } from '../settings/SettingsStore';
import { FileIndex } from './FileIndex';

/** Directory names that are never descended into. */
const IGNORED_DIR_NAMES = new Set([
  'node_modules',
  'bower_components',
  '__pycache__',
  'AppData',
  '$RECYCLE.BIN',
  'System Volume Information',
]);

/** Subpaths (relative to an index root) that are skipped, e.g. macOS caches. */
const IGNORED_SUBPATHS = ['Library/Caches', 'Library/Containers', 'Library/Application Support'];

const MAX_DEPTH = 8;
const MAX_ENTRIES = 200_000;
const REFRESH_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Crawls the configured roots and fills the FileIndex. Emits 'status' with an
 * IndexStatus payload whenever indexing starts or finishes.
 */
export class FileIndexer extends EventEmitter {
  private indexing = false;
  private refreshTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly index: FileIndex,
    private readonly settings: SettingsStore,
  ) {
    super();
    this.settings.on('change', () => void this.rebuild());
  }

  status(): IndexStatus {
    return {
      fileCount: this.index.size,
      indexing: this.indexing,
      lastBuiltMs: this.index.lastBuiltMs,
    };
  }

  /** Load the cached index (if any) and kick off a fresh crawl in the background. */
  start(): void {
    this.index.loadCache();
    void this.rebuild();
    this.refreshTimer = setInterval(() => void this.rebuild(), REFRESH_INTERVAL_MS);
    this.refreshTimer.unref();
  }

  stop(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  async rebuild(): Promise<void> {
    if (this.indexing) return;
    this.indexing = true;
    this.emit('status', this.status());
    try {
      const records: FileRecord[] = [];
      for (const root of this.settings.get().indexRoots) {
        await this.crawl(root, records);
        if (records.length >= MAX_ENTRIES) break;
      }
      this.index.replaceAll(records);
      this.index.saveCache();
    } catch (err) {
      console.error('Index rebuild failed:', err);
    } finally {
      this.indexing = false;
      this.emit('status', this.status());
    }
  }

  private async crawl(root: string, out: FileRecord[]): Promise<void> {
    const stack: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
    let sinceYield = 0;

    while (stack.length > 0 && out.length < MAX_ENTRIES) {
      const { dir, depth } = stack.pop()!;
      let entries: fs.Dirent[];
      try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true });
      } catch {
        continue; // permission denied, vanished, etc.
      }

      for (const entry of entries) {
        if (out.length >= MAX_ENTRIES) break;
        const full = path.join(dir, entry.name);
        if (this.shouldIgnore(root, full, entry)) continue;

        if (entry.isDirectory()) {
          out.push(this.toRecord(full, entry.name, true, null));
          if (depth < MAX_DEPTH) stack.push({ dir: full, depth: depth + 1 });
        } else if (entry.isFile()) {
          let stat: fs.Stats | null = null;
          try {
            stat = await fs.promises.stat(full);
          } catch {
            continue;
          }
          out.push(this.toRecord(full, entry.name, false, stat));
        }

        // Keep the event loop responsive during large crawls.
        if (++sinceYield >= 500) {
          sinceYield = 0;
          await new Promise((resolve) => setImmediate(resolve));
        }
      }
    }
  }

  private shouldIgnore(root: string, full: string, entry: fs.Dirent): boolean {
    if (entry.name.startsWith('.')) return true;
    if (entry.isSymbolicLink()) return true;
    if (entry.isDirectory()) {
      if (IGNORED_DIR_NAMES.has(entry.name)) return true;
      const rel = path.relative(root, full).split(path.sep).join('/');
      if (IGNORED_SUBPATHS.some((p) => rel === p || rel.startsWith(`${p}/`))) return true;
    }
    return false;
  }

  private toRecord(full: string, name: string, isDir: boolean, stat: fs.Stats | null): FileRecord {
    return {
      path: full,
      name,
      ext: isDir ? '' : path.extname(name).toLowerCase(),
      dir: path.dirname(full),
      size: stat?.size ?? 0,
      mtimeMs: stat?.mtimeMs ?? 0,
      isDir,
    };
  }
}
