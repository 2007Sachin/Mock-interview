import { config } from '../config.js';
import { FileSessionStore } from './FileSessionStore.js';
import type { SessionStore } from './SessionStore.js';
import { SupabaseSessionStore } from './SupabaseSessionStore.js';

export function createSessionStore(): SessionStore {
  switch (config.storageBackend) {
    case 'file':
      return new FileSessionStore();
    case 'supabase':
      if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
        throw new Error('STORAGE_BACKEND=supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
      }
      return new SupabaseSessionStore(config.supabaseUrl, config.supabaseServiceRoleKey);
    default:
      throw new Error(`Unknown STORAGE_BACKEND "${config.storageBackend}" (expected "file" or "supabase").`);
  }
}
