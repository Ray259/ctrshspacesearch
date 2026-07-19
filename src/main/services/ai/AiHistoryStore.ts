import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AiSessionRecord, SearchResultItem } from '../../../shared/types';

const MAX_SESSIONS = 20;
const HISTORY_VERSION = 1;

interface HistoryFile {
  version: number;
  sessions: AiSessionRecord[];
}

/** JSON-backed store of recent AI search sessions, most recent first. */
export class AiHistoryStore {
  private sessions: AiSessionRecord[] = [];
  private readonly file: string;

  constructor(userDataDir: string) {
    this.file = path.join(userDataDir, 'ai-history.json');
    this.load();
  }

  list(): readonly AiSessionRecord[] {
    return this.sessions;
  }

  add(entry: { query: string; summary: string; insight: string; results: SearchResultItem[] }): void {
    // Re-running a query moves it to the top instead of duplicating it.
    this.sessions = this.sessions.filter((s) => s.query !== entry.query);
    this.sessions.unshift({ id: randomUUID(), createdAt: Date.now(), ...entry });
    if (this.sessions.length > MAX_SESSIONS) this.sessions.length = MAX_SESSIONS;
    this.save();
  }

  private load(): void {
    try {
      const data: HistoryFile = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (data.version === HISTORY_VERSION && Array.isArray(data.sessions)) {
        // Sessions written before the insight field existed get an empty one.
        this.sessions = data.sessions.map((s) => ({ ...s, insight: s.insight ?? '' }));
      }
    } catch {
      // Missing or corrupt history starts fresh.
    }
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const data: HistoryFile = { version: HISTORY_VERSION, sessions: this.sessions };
      fs.writeFileSync(this.file, JSON.stringify(data));
    } catch (err) {
      console.warn('Failed to persist AI history:', err);
    }
  }
}
