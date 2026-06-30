import type { SupabaseClient } from '@supabase/supabase-js';
import { verifySupabaseJwt } from './jwt';

/**
 * Resolve the calling user's profile from the request's Bearer session token.
 * Returns null when the token is missing/invalid or the profile doesn't exist.
 * Used by mutation routes that run with the service role but must act as the user.
 */
export async function requireProfile(
  request: Request,
  supabase: SupabaseClient
): Promise<{ profileId: string; address: string } | null> {
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;

  const claims = verifySupabaseJwt(auth.slice(7));
  if (!claims?.sub) return null;

  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('sui_address', claims.sub)
    .maybeSingle();

  if (!data) return null;
  return { profileId: data.id, address: claims.sub };
}
