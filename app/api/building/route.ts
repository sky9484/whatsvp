import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/apiAuth';

/**
 * POST /api/building — attach a community-uploaded building photo to an event.
 * Body: { event_id: string, image_url: string }
 *
 * Any logged-in user may contribute a building image to help the community, as
 * long as one isn't already set (first contributor wins; landmarks are never
 * overwritten). The image itself is uploaded to the public `buildings` Storage
 * bucket client-side; this route records its URL on the event.
 */
export async function POST(request: NextRequest) {
  let supabase;
  try {
    supabase = createServiceClient();
  } catch {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const me = await requireProfile(request, supabase);
  if (!me) return Response.json({ error: 'Login required' }, { status: 401 });

  let body: { event_id?: string; image_url?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.event_id || !body.image_url) {
    return Response.json({ error: 'event_id and image_url are required' }, { status: 400 });
  }

  // Only accept URLs from our own Supabase storage (avoid arbitrary remote URLs)
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  if (!body.image_url.startsWith(supaUrl)) {
    return Response.json({ error: 'Image must be uploaded to WhatsVP storage' }, { status: 422 });
  }

  const { data: event } = await supabase
    .from('events')
    .select('id, building_key, building_image_url')
    .eq('id', body.event_id)
    .maybeSingle();

  if (!event) return Response.json({ error: 'Event not found' }, { status: 404 });
  if (event.building_key) {
    return Response.json({ error: 'This venue already has a landmark design' }, { status: 409 });
  }
  if (event.building_image_url) {
    return Response.json({ error: 'A building photo already exists for this venue' }, { status: 409 });
  }

  const { data, error } = await supabase
    .from('events')
    .update({ building_image_url: body.image_url })
    .eq('id', body.event_id)
    .select()
    .single();

  if (error) {
    console.error('[building] update error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ event: data });
}
