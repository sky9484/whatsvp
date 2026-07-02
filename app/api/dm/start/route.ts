import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/apiAuth';

/**
 * POST /api/dm/start — find-or-create a DM thread with a mutual friend.
 * Body: { friend_profile_id }
 *
 * The only DM write that needs the service role: creating a thread requires
 * checking mutual-friendship status (a separate table) and a canonical sorted
 * pair for uniqueness — a multi-row invariant cleaner to enforce once here
 * than to duplicate as an RLS WITH CHECK. Sending messages and toggling
 * disappearing mode both happen via direct RLS-authed client calls afterward.
 */
export async function POST(request: NextRequest) {
  let supabase;
  try {
    supabase = createServiceClient();
  } catch {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const me = await requireProfile(request, supabase);
  if (!me) return Response.json({ error: 'Log in required' }, { status: 401 });

  let body: { friend_profile_id?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const friendId = body.friend_profile_id;
  if (!friendId) return Response.json({ error: 'friend_profile_id is required' }, { status: 400 });
  if (friendId === me.profileId) return Response.json({ error: "Can't message yourself" }, { status: 400 });

  const { data: friendship } = await supabase
    .from('friendships')
    .select('status')
    .or(
      `and(requester_id.eq.${me.profileId},addressee_id.eq.${friendId}),and(requester_id.eq.${friendId},addressee_id.eq.${me.profileId})`
    )
    .eq('status', 'accepted')
    .maybeSingle();

  if (!friendship) {
    return Response.json({ error: 'You can only message mutual friends' }, { status: 403 });
  }

  const [a, b] = [me.profileId, friendId].sort();

  const { data: upserted } = await supabase
    .from('dm_threads')
    .upsert({ profile_a_id: a, profile_b_id: b }, { onConflict: 'profile_a_id,profile_b_id', ignoreDuplicates: true })
    .select()
    .maybeSingle();

  if (upserted) return Response.json({ thread: upserted });

  // ignoreDuplicates skips the RETURNING row on a real conflict — re-select explicitly.
  const { data: existing, error } = await supabase.from('dm_threads').select('*').eq('profile_a_id', a).eq('profile_b_id', b).single();
  if (error || !existing) return Response.json({ error: error?.message ?? 'Could not start conversation' }, { status: 500 });
  return Response.json({ thread: existing });
}
