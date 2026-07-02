import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/apiAuth';

/** GET /api/passport — my Passport: profile + every stamp I've collected. */
export async function GET(request: NextRequest) {
  let supabase;
  try {
    supabase = createServiceClient();
  } catch {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const me = await requireProfile(request, supabase);
  if (!me) return Response.json({ error: 'Log in required' }, { status: 401 });

  const [{ data: profile }, { data: stamps }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', me.profileId).single(),
    supabase
      .from('checkins')
      .select('id, event_id, method, created_at, stamp_minted_at, stamp_tx_digest, events(id, title, venue_name, starts_at, ends_at, cover_url)')
      .eq('profile_id', me.profileId)
      .order('created_at', { ascending: false }),
  ]);

  return Response.json({ profile, stamps: stamps ?? [] });
}
