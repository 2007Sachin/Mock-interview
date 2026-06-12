import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Session } from '../types.js';
import type { SessionStore } from './SessionStore.js';

/**
 * Production store: whole sessions as jsonb rows in a Supabase `sessions`
 * table (schema in the README's deploy section). Uses the service-role key,
 * so it must only ever run on the server.
 */
export class SupabaseSessionStore implements SessionStore {
  private readonly client: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async save(session: Session): Promise<void> {
    const { error } = await this.client.from('sessions').upsert({
      id: session.id,
      data: session,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(`Supabase save failed: ${error.message}`);
  }

  async get(id: string): Promise<Session | null> {
    const { data, error } = await this.client
      .from('sessions')
      .select('data')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`Supabase get failed: ${error.message}`);
    return (data?.data as Session | undefined) ?? null;
  }
}
