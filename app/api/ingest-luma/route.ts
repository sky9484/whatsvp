import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { fetchCalendarEvents, lumaEntryToInsertRow } from '@/lib/luma';

// ── Vercel Cron: runs every 15 minutes ────────────────────────────────────────
// vercel.json: { "crons": [{ "path": "/api/ingest-luma", "schedule": "*/15 * * * *" }] }

export async function GET(request: NextRequest) {
  // Verify the request comes from Vercel Cron (or our own calls in dev)
  const auth = request.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (process.env.CRON_SECRET && auth !== expected) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.LUMA_API_KEY;
  const calendarId = process.env.LUMA_CALENDAR_ID;

  if (!apiKey || !calendarId) {
    return Response.json(
      { error: 'LUMA_API_KEY and LUMA_CALENDAR_ID must be set' },
      { status: 503 }
    );
  }

  try {
    const entries = await fetchCalendarEvents(calendarId, apiKey);

    // Filter to events that have valid coordinates
    const rows = entries
      .map(lumaEntryToInsertRow)
      .filter((r): r is NonNullable<typeof r> => r !== null && r.lat !== null && r.lng !== null);

    if (rows.length === 0) {
      return Response.json({ upserted: 0, message: 'No geocoded events found' });
    }

    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from('events')
      .upsert(rows, {
        onConflict: 'luma_url',
        ignoreDuplicates: false, // update existing rows with fresh data
      })
      .select('id');

    if (error) {
      console.error('[ingest-luma] Supabase upsert error:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    console.log(`[ingest-luma] Upserted ${data?.length ?? 0} events from calendar ${calendarId}`);
    return Response.json({ upserted: data?.length ?? 0 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[ingest-luma] Error:', msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
