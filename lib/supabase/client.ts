'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

/** True when the public Supabase env vars are present. */
export function hasSupabaseEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/**
 * Returns a browser Supabase client, or null when env isn't configured.
 * The map still renders without Supabase — it just shows no pins.
 */
export function createClient(): SupabaseClient | null {
  if (!hasSupabaseEnv()) return null;
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * Returns a Supabase client authenticated with the user's minted session JWT,
 * so Postgres RLS (`auth.jwt()`, `auth.role()`) recognises them. Used for
 * per-user writes in later phases (RSVPs, chat). Null if env/token missing.
 */
export function createAuthedClient(token: string | null): SupabaseClient | null {
  if (!hasSupabaseEnv() || !token) return null;
  const client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
    }
  );
  // Authorize Realtime with the same session token so RLS-gated channels
  // (chat) deliver messages the user is allowed to read.
  client.realtime.setAuth(token);
  return client;
}
