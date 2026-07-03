import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/apiAuth';
import { MAX_SCENES_PER_EVENT, MAX_VIDEO_SECONDS } from '@/lib/scenes';

const SIGNED_URL_TTL_S = 3600;

/**
 * GET /api/scenes — Scenes are read = logged-in users only (never public),
 * and the 'scenes' Storage bucket is private, so this route always resolves
 * signed URLs server-side rather than handing back raw storage paths.
 *
 * - ?event_id=X → all visible scenes for that event (the full-screen viewer).
 * - no event_id → the Dock Scenes tab feed: one row per event with a scene
 *   in the last 48h, "my guilds" first, then most-recent first.
 */
export async function GET(request: NextRequest) {
  let supabase;
  try {
    supabase = createServiceClient();
  } catch {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const me = await requireProfile(request, supabase);
  if (!me) return Response.json({ error: 'Log in required' }, { status: 401 });

  const eventId = request.nextUrl.searchParams.get('event_id');

  if (eventId) {
    const { data: scenes } = await supabase
      .from('scenes')
      .select('*, profiles(display_name, avatar_url, avatar_config), events(id, title, venue_name, lat, lng, host_id)')
      .eq('event_id', eventId)
      .eq('hidden', false)
      .order('created_at', { ascending: true });

    const withUrls = await Promise.all(
      (scenes ?? []).map(async (s) => {
        const { data: signed } = await supabase.storage.from('scenes').createSignedUrl(s.storage_path, SIGNED_URL_TTL_S);
        const { count } = await supabase.from('scene_reactions').select('*', { count: 'exact', head: true }).eq('scene_id', s.id);
        return { ...s, url: signed?.signedUrl, reaction_count: count ?? 0 };
      })
    );
    return Response.json({ scenes: withUrls });
  }

  const cutoff = new Date(Date.now() - 48 * 3600_000).toISOString();
  const { data: recent } = await supabase
    .from('scenes')
    .select('event_id, created_at, events(id, title, guild_id, lat, lng)')
    .eq('hidden', false)
    .gt('created_at', cutoff)
    .order('created_at', { ascending: false });

  const { data: myGuilds } = await supabase.from('guild_members').select('guild_id').eq('profile_id', me.profileId);
  const myGuildIds = new Set((myGuilds ?? []).map((g) => g.guild_id));

  const byEvent = new Map<string, { event: unknown; latest: string; count: number }>();
  for (const row of recent ?? []) {
    const event = Array.isArray(row.events) ? row.events[0] : row.events;
    if (!event) continue;
    const existing = byEvent.get(row.event_id);
    if (existing) existing.count++;
    else byEvent.set(row.event_id, { event, latest: row.created_at, count: 1 });
  }

  const feed = [...byEvent.entries()]
    .map(([event_id, v]) => ({
      event_id,
      event: v.event as { guild_id: string | null },
      latest: v.latest,
      count: v.count,
    }))
    .sort((a, b) => {
      const aMine = myGuildIds.has(a.event.guild_id ?? '') ? 1 : 0;
      const bMine = myGuildIds.has(b.event.guild_id ?? '') ? 1 : 0;
      if (aMine !== bMine) return bMine - aMine;
      return new Date(b.latest).getTime() - new Date(a.latest).getTime();
    });

  return Response.json({ feed });
}

/**
 * POST /api/scenes — create a Scene. The camera/gallery upload itself
 * (Supabase Storage) already happened client-side and is gated by RLS on
 * the checked-in relationship; this route records the metadata row and
 * enforces the invariants a raw client insert couldn't: the 10-per-event
 * cap and the 15s video duration ceiling (never trust a client-reported
 * duration for the hard limit — recompute nothing here since the file is
 * already uploaded, but reject obviously-lying values).
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

  let body: { event_id?: string; kind?: 'photo' | 'video'; storage_path?: string; duration_s?: number };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { event_id, kind, storage_path } = body;
  if (!event_id || !kind || !storage_path) {
    return Response.json({ error: 'event_id, kind, and storage_path are required' }, { status: 400 });
  }
  if (kind === 'video' && (typeof body.duration_s !== 'number' || body.duration_s > MAX_VIDEO_SECONDS + 1)) {
    return Response.json({ error: 'Video is too long.' }, { status: 400 });
  }

  const { data: checkin } = await supabase
    .from('checkins')
    .select('id')
    .eq('event_id', event_id)
    .eq('profile_id', me.profileId)
    .maybeSingle();
  if (!checkin) return Response.json({ error: 'Check in to this event before adding a Scene.' }, { status: 403 });

  const { count } = await supabase
    .from('scenes')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', event_id)
    .eq('profile_id', me.profileId);
  if ((count ?? 0) >= MAX_SCENES_PER_EVENT) {
    return Response.json({ error: "You've posted the max Scenes for this event." }, { status: 429 });
  }

  const { data: scene, error } = await supabase
    .from('scenes')
    .insert({ event_id, profile_id: me.profileId, kind, storage_path, duration_s: body.duration_s ?? null })
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true, scene });
}
