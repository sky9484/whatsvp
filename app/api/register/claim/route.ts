import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/apiAuth';

/**
 * POST /api/register/claim — merge a guest registration into the caller's
 * Passport after they log in via the claim link. Also sweeps any other
 * unclaimed guest rows sharing the same email, so someone who guest-
 * registered for several events before ever logging in gets all of them at
 * once, not just the one link they happened to click.
 */
export async function POST(request: NextRequest) {
  let supabase;
  try {
    supabase = createServiceClient();
  } catch {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const me = await requireProfile(request, supabase);
  if (!me) return Response.json({ error: 'Log in to claim your registration.' }, { status: 401 });

  let body: { claim_token?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.claim_token) return Response.json({ error: 'claim_token is required' }, { status: 400 });

  const { data: guest } = await supabase
    .from('guests')
    .select('id, email')
    .eq('claim_token', body.claim_token)
    .is('claimed_profile_id', null)
    .maybeSingle();
  if (!guest) return Response.json({ error: "That link isn't valid or has already been used." }, { status: 404 });

  const { data: sameEmailGuests } = await supabase
    .from('guests')
    .select('id')
    .ilike('email', guest.email)
    .is('claimed_profile_id', null);

  const guestIds = (sameEmailGuests ?? []).map((g) => g.id);
  let claimedEvents = 0;

  for (const guestId of guestIds) {
    const { data: rsvp } = await supabase.from('event_rsvps').select('id, event_id').eq('guest_id', guestId).maybeSingle();
    if (rsvp) {
      const { error } = await supabase.from('event_rsvps').update({ profile_id: me.profileId }).eq('id', rsvp.id);
      if (error) {
        // Unique violation: this profile already has its own row for that
        // event (e.g. registered again after logging in, before claiming) —
        // drop the now-redundant guest-originated row instead of merging.
        if (error.code === '23505') {
          await supabase.from('event_rsvps').delete().eq('id', rsvp.id);
        } else {
          continue;
        }
      }
      await supabase.from('registration_answers').update({ profile_id: me.profileId }).eq('guest_id', guestId);
      claimedEvents++;
    }
    await supabase.from('guests').update({ claimed_profile_id: me.profileId }).eq('id', guestId);
  }

  return Response.json({ ok: true, claimed_events: claimedEvents });
}
