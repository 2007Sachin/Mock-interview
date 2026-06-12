import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Session } from '../types.js';
import type { SessionStore } from './SessionStore.js';

/** Local-dev store: one JSON file per session under ./data/sessions. */
export class FileSessionStore implements SessionStore {
  constructor(private readonly dir = path.resolve('data', 'sessions')) {}

  private filePath(id: string): string {
    // Session ids are server-generated UUIDs; reject anything else so a
    // crafted id can never traverse outside the data directory.
    if (!/^[0-9a-f-]{36}$/.test(id)) {
      throw new Error(`Invalid session id: ${id}`);
    }
    return path.join(this.dir, `${id}.json`);
  }

  async save(session: Session): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.filePath(session.id), JSON.stringify(session, null, 2), 'utf8');
  }

  async get(id: string): Promise<Session | null> {
    try {
      const raw = await readFile(this.filePath(id), 'utf8');
      return JSON.parse(raw) as Session;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }
}
