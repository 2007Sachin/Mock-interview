import type { Session } from '../types.js';

export interface SessionStore {
  /** Insert or fully replace a session. */
  save(session: Session): Promise<void>;
  get(id: string): Promise<Session | null>;
}
