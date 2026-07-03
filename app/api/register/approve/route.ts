import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/apiAuth';

/**
 * POST /api/register/approve — the organizer approves or declines a pending
 * registration (events.approval_mode). A service-role route because
 * event_rsvps has no client UPDATE policy allowing a host to change someone
 * else's row — that would be a much bigger RLS surface to open up for one
 * narrow action.
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

  let body: { rsvp_id?: string; decision?: 'confirmed' | 'declined' };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.rsvp_id || (body.decision !== 'confirmed' && body.decision !== 'declined')) {
    return Response.json({ error: 'rsvp_id and a valid decision are required' }, { status: 400 });
  }

  const { data: rsvp } = await supabase
    .from('event_rsvps')
    .select('id, event_id, status, events(host_id, capacity)')
    .eq('id', body.rsvp_id)
    .maybeSingle();
  if (!rsvp) return Response.json({ error: 'Registration not found' }, { status: 404 });

  const event = Array.isArray(rsvp.events) ? rsvp.events[0] : rsvp.events;
  if (!event || event.host_id !== me.profileId) {
    return Response.json({ error: 'Only the organizer can approve this.' }, { status: 403 });
  }
  if (rsvp.status !== 'pending') {
    return Response.json({ error: 'That request was already decided.' }, { status: 409 });
  }

  if (body.decision === 'confirmed' && typeof event.capacity === 'number') {
    const { count } = await supabase
      .from('event_rsvps')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', rsvp.event_id)
      .eq('status', 'confirmed');
    if ((count ?? 0) >= event.capacity) {
      return Response.json({ error: 'This event is already full.' }, { status: 409 });
    }
  }

  const { error } = await supabase.from('event_rsvps').update({ status: body.decision }).eq('id', body.rsvp_id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, status: body.decision });
}
