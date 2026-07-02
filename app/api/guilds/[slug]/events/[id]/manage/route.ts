import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/apiAuth';

/**
 * GET /api/guilds/[slug]/events/[id]/manage — organizer-only attendance
 * analytics: RSVPs vs check-ins, attendee list. `?format=csv` exports the
 * attendee list instead of returning JSON.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await ctx.params;

  let supabase;
  try {
    supabase = createServiceClient();
  } catch {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const me = await requireProfile(request, supabase);
  if (!me) return Response.json({ error: 'Log in required' }, { status: 401 });

  const { data: event } = await supabase.from('events').select('*').eq('id', id).maybeSingle();
  if (!event) return Response.json({ error: 'Event not found' }, { status: 404 });
  if (event.host_id !== me.profileId) {
    return Response.json({ error: 'Only the organizer can view this.' }, { status: 403 });
  }

  const [{ data: rsvps }, { data: checkins }] = await Promise.all([
    supabase
      .from('event_rsvps')
      .select('profile_id, created_at, profiles(display_name, avatar_url)')
      .eq('event_id', id),
    supabase
      .from('checkins')
      .select('profile_id, method, created_at, stamp_minted_at, profiles(display_name, avatar_url)')
      .eq('event_id', id)
      .order('created_at', { ascending: true }),
  ]);

  const format = request.nextUrl.searchParams.get('format');
  if (format === 'csv') {
    const rows = [['display_name', 'method', 'checked_in_at', 'stamp_minted']];
    for (const c of checkins ?? []) {
      // Supabase-js can't statically prove the FK cardinality without generated
      // DB types, so it infers `profiles` as an array even though checkins.profile_id
      // is many-to-one and PostgREST returns a single object at runtime.
      const profile = Array.isArray(c.profiles) ? c.profiles[0] : c.profiles;
      rows.push([profile?.display_name ?? '', c.method, c.created_at, c.stamp_minted_at ? 'yes' : 'no']);
    }
    const csv = rows.map((r) => r.map(csvCell).join(',')).join('\n');
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${slug}-${event.title.replace(/[^a-z0-9]+/gi, '-')}-attendees.csv"`,
      },
    });
  }

  return Response.json({
    event,
    rsvp_count: rsvps?.length ?? 0,
    checkin_count: checkins?.length ?? 0,
    rsvps: rsvps ?? [],
    checkins: checkins ?? [],
  });
}

function csvCell(v: string): string {
  return `"${String(v).replace(/"/g, '""')}"`;
}
