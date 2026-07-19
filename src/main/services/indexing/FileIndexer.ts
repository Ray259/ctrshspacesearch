import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { IndexStatus } from '../../../shared/types';
import type { FileRecord } from '../../../shared/types';
import type { EmbeddingService } from '../semantic/EmbeddingService';
import { embeddingText, roundVector } from '../semantic/vector';
import type { SettingsStore } from '../settings/SettingsStore';
import { FileIndex } from './FileIndex';
import { computeTags } from './TagRules';

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
const REFRESH_INTERVAL_MS = 30 * 60 * 1000;
/** Files embedded per worker round-trip while building semantic vectors. */
const EMBED_BATCH_SIZE = 16;
/** Persist embedding progress every N batches so a quit loses little work. */
const EMBED_SAVE_EVERY_BATCHES = 64;

/**
 * Crawls the configured roots and fills the FileIndex. Emits 'status' with an
 * IndexStatus payload whenever indexing starts or finishes. After each crawl
 * a background pass computes semantic embeddings for up to
 * `maxSemanticFiles` of the most recently modified files.
 */
export class FileIndexer extends EventEmitter {
  private indexing = false;
  private refreshTimer: NodeJS.Timeout | null = null;
  /** Bumped per rebuild; a stale embedding pass sees the bump and stops. */
  private generation = 0;

  constructor(
    private readonly index: FileIndex,
    private readonly settings: SettingsStore,
    private readonly embedder: EmbeddingService,
  ) {
    super();
    this.settings.on('change', () => void this.rebuild());
  }

  status(): IndexStatus {
    return {
      fileCount: this.index.size,
      indexing: this.indexing,
      lastBuiltMs: this.index.lastBuiltMs,
      semanticCount: this.index.semanticCount,
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
    this.generation++; // stop any in-flight embedding pass
  }

  async rebuild(): Promise<void> {
    if (this.indexing) return;
    this.indexing = true;
    const generation = ++this.generation;
    this.emit('status', this.status());
    try {
      const maxEntries = this.settings.get().maxIndexedFiles;
      const records: FileRecord[] = [];
      for (const root of this.settings.get().indexRoots) {
        await this.crawl(root, records, maxEntries);
        if (records.length >= maxEntries) break;
      }
      this.carryOverEmbeddings(records);
      this.index.replaceAll(records);
      this.index.saveCache();
    } catch (err) {
      console.error('Index rebuild failed:', err);
    } finally {
      this.indexing = false;
      this.emit('status', this.status());
    }
    void this.embedRecords(generation);
  }

  private async crawl(root: string, out: FileRecord[], maxEntries: number): Promise<void> {
    const stack: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
    let sinceYield = 0;

    while (stack.length > 0 && out.length < maxEntries) {
      const { dir, depth } = stack.pop()!;
      let entries: fs.Dirent[];
      try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true });
      } catch {
        continue; // permission denied, vanished, etc.
      }

      for (const entry of entries) {
        if (out.length >= maxEntries) break;
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
    const ext = isDir ? '' : path.extname(name).toLowerCase();
    return {
      path: full,
      name,
      ext,
      dir: path.dirname(full),
      size: stat?.size ?? 0,
      mtimeMs: stat?.mtimeMs ?? 0,
      isDir,
      tags: computeTags(full, name, ext, isDir),
    };
  }

  /** Reuses embeddings from the previous index for unchanged files. */
  private carryOverEmbeddings(next: FileRecord[]): void {
    if (this.index.embeddingModel !== this.settings.get().semanticModel) return; // model changed: recompute all
    const previous = new Map<string, FileRecord>();
    for (const record of this.index.all()) {
      if (record.embedding) previous.set(record.path, record);
    }
    if (previous.size === 0) return;
    for (const record of next) {
      const old = previous.get(record.path);
      if (old?.embedding && old.mtimeMs === record.mtimeMs) record.embedding = old.embedding;
    }
  }

  /**
   * Background pass: embed the `maxSemanticFiles` most recently modified
   * files that do not have a vector yet. Aborts silently when a newer
   * rebuild starts or the embedder is unavailable.
   */
  private async embedRecords(generation: number): Promise<void> {
    const { maxSemanticFiles, semanticModel } = this.settings.get();
    if (!this.embedder.available) return;

    const files = this.index.all().filter((r) => !r.isDir);
    files.sort((a, b) => b.mtimeMs - a.mtimeMs);
    const wanted = files.slice(0, maxSemanticFiles);

    // The cap may have been lowered: drop embeddings beyond it.
    let changed = false;
    for (const record of files.slice(maxSemanticFiles)) {
      if (record.embedding) {
        delete record.embedding;
        changed = true;
      }
    }

    const todo = wanted.filter((r) => !r.embedding);
    if (todo.length > 0) this.index.embeddingModel = semanticModel;

    let sinceSave = 0;
    for (let i = 0; i < todo.length; i += EMBED_BATCH_SIZE) {
      if (generation !== this.generation) return;
      const batch = todo.slice(i, i + EMBED_BATCH_SIZE);
      const vectors = await this.embedder.embed(batch.map(embeddingText));
      if (!vectors) break;
      batch.forEach((record, j) => {
        if (vectors[j]) record.embedding = roundVector(vectors[j]);
      });
      changed = true;
      if (++sinceSave >= EMBED_SAVE_EVERY_BATCHES) {
        sinceSave = 0;
        this.index.saveCache();
      }
    }

    if (changed && generation === this.generation) {
      this.index.saveCache();
      this.emit('status', this.status());
    }
  }
}
