import { config } from '../config.js';
import { FileSessionStore } from './FileSessionStore.js';
import type { SessionStore } from './SessionStore.js';

export function createSessionStore(): SessionStore {
  switch (config.storageBackend) {
    case 'file':
      return new FileSessionStore();
    default:
      throw new Error(`Unknown STORAGE_BACKEND "${config.storageBackend}" (expected "file").`);
  }
}
