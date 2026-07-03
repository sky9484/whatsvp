import type { SupabaseClient } from '@supabase/supabase-js';
import { isMoveConfigured } from './sui-move';
import { getSuiClient } from './sui-server';
import { PASSPORT_TYPE } from './sui-move';

/**
 * Server-side spend caps + new-account friction for money routes (§5.5).
 * Enforced at verify time so a client that skips the UI can't bypass them.
 */

export const MIN_ACCOUNT_AGE_MS = 24 * 60 * 60 * 1000;
export const MAX_TRANSFERS_PER_DAY = 20;
/** Sponsored transfers only up to this; larger = user pays own gas or is blocked in v1. */
export const MAX_SPONSORED_USDC = 200;
export const MAX_SPONSORED_BASE = BigInt(MAX_SPONSORED_USDC) * 1_000_000n;

export interface GuardResult {
  ok: boolean;
  reason?: string;
}

/**
 * Gate transfers on Passport + 24h account age (§5.5 bot damper). The Passport
 * half only applies when the Move package is actually published — otherwise no
 * one could ever mint one, and gating on it would permanently lock money for
 * every deployment without the package, the same trap avoided for the withdraw
 * gate in P0 and the avatar prompt in P3.
 */
export async function checkAccountEligible(
  supabase: SupabaseClient,
  profileId: string,
  address: string
): Promise<GuardResult> {
  const { data: profile } = await supabase.from('profiles').select('created_at').eq('id', profileId).maybeSingle();
  if (!profile) return { ok: false, reason: 'Profile not found.' };

  const ageMs = Date.now() - new Date(profile.created_at).getTime();
  if (ageMs < MIN_ACCOUNT_AGE_MS) {
    return { ok: false, reason: 'New accounts can send after 24 hours.' };
  }

  if (isMoveConfigured()) {
    try {
      const owned = await getSuiClient().getOwnedObjects({ owner: address, filter: { StructType: PASSPORT_TYPE() }, limit: 1 });
      if ((owned.data?.length ?? 0) === 0) {
        return { ok: false, reason: 'Set up your Passport first — it’s ready shortly after you sign in.' };
      }
    } catch {
      // RPC hiccup shouldn't hard-block a 24h-old account; fail open on the
      // Passport check only (account age already passed).
    }
  }

  return { ok: true };
}

/** Per-profile daily transfer ceiling — counts rows written by /api/transfers/verify. */
export async function checkDailyCount(supabase: SupabaseClient, profileId: string): Promise<GuardResult> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('transfers')
    .select('*', { count: 'exact', head: true })
    .eq('from_profile', profileId)
    .gt('created_at', since);
  if ((count ?? 0) >= MAX_TRANSFERS_PER_DAY) {
    return { ok: false, reason: 'Daily send limit reached — try again tomorrow.' };
  }
  return { ok: true };
}
