import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { sendPushToProfile } from '@/lib/webPush';

// ── Vercel Cron: runs every 5 minutes, catches events starting in ~10-20 min ──
// vercel.json: { "crons": [{ "path": "/api/cron/event-reminders", "schedule": "*/5 * * * *" }] }

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (process.env.CRON_SECRET && auth !== expected) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let supabase;
  try {
    supabase = createServiceClient();
  } catch {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const now = Date.now();
  const windowStart = new Date(now + 10 * 60_000).toISOString();
  const windowEnd = new Date(now + 20 * 60_000).toISOString();

  const { data: events } = await supabase
    .from('events')
    .select('id, title, venue_name, starts_at')
    .gte('starts_at', windowStart)
    .lte('starts_at', windowEnd);

  if (!events?.length) return Response.json({ notified: 0 });

  let notified = 0;
  for (const event of events) {
    const { data: rsvps } = await supabase.from('event_rsvps').select('profile_id').eq('event_id', event.id);
    if (!rsvps?.length) continue;

    const { data: already } = await supabase
      .from('event_reminders_sent')
      .select('profile_id')
      .eq('event_id', event.id)
      .in(
        'profile_id',
        rsvps.map((r) => r.profile_id)
      );
    const alreadySet = new Set((already ?? []).map((a) => a.profile_id));
    const pending = rsvps.filter((r) => !alreadySet.has(r.profile_id));
    if (!pending.length) continue;

    await Promise.all(
      pending.map((r) =>
        sendPushToProfile(r.profile_id, {
          title: `${event.title} is starting soon`,
          body: event.venue_name ? `Starting soon at ${event.venue_name}` : 'Starting soon',
          url: '/',
        })
      )
    );
    await supabase.from('event_reminders_sent').upsert(pending.map((r) => ({ event_id: event.id, profile_id: r.profile_id })));
    notified += pending.length;
  }

  return Response.json({ notified });
}
