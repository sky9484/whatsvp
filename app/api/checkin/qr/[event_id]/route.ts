import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/apiAuth';
import { currentCheckinCode } from '@/lib/checkinCode';

/**
 * GET /api/checkin/qr/[event_id] — the current rotating check-in code, for the
 * organizer to display as a QR. Host-only: this is the credential attendees
 * scan to check in, so it must never be exposed to non-organizers.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ event_id: string }> }) {
  const { event_id } = await ctx.params;

  let supabase;
  try {
    supabase = createServiceClient();
  } catch {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const me = await requireProfile(request, supabase);
  if (!me) return Response.json({ error: 'Log in required' }, { status: 401 });

  const { data: event } = await supabase
    .from('events')
    .select('id, host_id, checkin_secret, checkin_methods')
    .eq('id', event_id)
    .maybeSingle();
  if (!event) return Response.json({ error: 'Event not found' }, { status: 404 });
  if (event.host_id !== me.profileId) {
    return Response.json({ error: 'Only the organizer can show the check-in code.' }, { status: 403 });
  }
  if (!event.checkin_methods?.includes('qr')) {
    return Response.json({ error: 'QR check-in is not enabled for this event.' }, { status: 400 });
  }

  const { code, expiresAt } = currentCheckinCode(event.checkin_secret, event.id);
  const checkinUrl = `${request.nextUrl.origin}/checkin/${event.id}?code=${code}`;

  return Response.json({ code, expiresAt, checkinUrl });
}
