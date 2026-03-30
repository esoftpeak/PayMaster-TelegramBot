import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env";

let singleton: SupabaseClient | null = null;

/**
 * Single Supabase client for the Node process.
 * Uses the service role key — server-side only; never expose to browsers or Telegram clients.
 */
export function getSupabaseClient(): SupabaseClient {
  if (singleton === null) {
    singleton = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return singleton;
}

/**
 * Lightweight health check: verifies URL, key, and that `merchants` is reachable.
 */
export async function verifySupabaseConnection(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("merchants").select("id").limit(1);
  if (error !== null) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
