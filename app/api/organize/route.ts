import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { resolveLumaEvent } from '@/lib/luma';
import { verifySupabaseJwt } from '@/lib/jwt';

/**
 * POST /api/organize
 * Body: { url: string }   — a Luma event URL, e.g. https://lu.ma/my-event
 *
 * Fetches the event server-side (Luma is CORS-blocked in the browser),
 * inserts it into the events table, and returns the new event.
 *
 * Phase 2 will add auth gating (require a valid session JWT).
 */
export async function POST(request: NextRequest) {
  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { url } = body;
  if (!url || typeof url !== 'string') {
    return Response.json({ error: 'url is required' }, { status: 400 });
  }

  // Only accept lu.ma URLs
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return Response.json({ error: 'Invalid URL' }, { status: 400 });
  }

  if (!parsed.hostname.includes('lu.ma')) {
    return Response.json(
      { error: 'Only Luma (lu.ma) event URLs are supported' },
      { status: 422 }
    );
  }

  try {
    const eventData = await resolveLumaEvent(url, process.env.LUMA_API_KEY);

    if (!eventData.lat || !eventData.lng) {
      return Response.json(
        {
          error:
            'Could not determine event location. ' +
            'Please ensure the Luma event has a physical venue with a map pin.',
        },
        { status: 422 }
      );
    }

    if (!eventData.starts_at) {
      return Response.json(
        { error: 'Could not determine event start time from the Luma page.' },
        { status: 422 }
      );
    }

    const supabase = createServiceClient();

    // Attribute the event to its host when a valid session token is present.
    // The UI already gates organize behind login; this tags host_id server-side
    // when SUPABASE_JWT_SECRET is configured. (sub = the user's Sui address.)
    let hostId: string | null = null;
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const claims = verifySupabaseJwt(authHeader.slice(7));
      if (claims?.sub) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('sui_address', claims.sub)
          .maybeSingle();
        hostId = profile?.id ?? null;
      }
    }

    const { data, error } = await supabase
      .from('events')
      .upsert(
        {
          source: 'manual',
          luma_url: eventData.luma_url,
          title: eventData.title,
          description: eventData.description,
          venue_name: eventData.venue_name,
          lat: eventData.lat,
          lng: eventData.lng,
          starts_at: eventData.starts_at,
          ends_at: eventData.ends_at,
          cover_url: eventData.cover_url,
          host_id: hostId,
        },
        { onConflict: 'luma_url', ignoreDuplicates: false }
      )
      .select()
      .single();

    if (error) {
      console.error('[organize] Supabase error:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ event: data }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[organize] Error resolving Luma event:', msg);
    return Response.json(
      { error: `Failed to fetch event details: ${msg}` },
      { status: 502 }
    );
  }
}
