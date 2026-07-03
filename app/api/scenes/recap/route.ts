import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/apiAuth';
import { RECAP_REACTION_THRESHOLD } from '@/lib/scenes';

const SIGNED_URL_TTL_S = 3600;

/**
 * GET /api/scenes/recap?guild_id=X — the auto-compiled guild recap (v4 P4):
 * Scenes from that guild's events in the last 30 days with at least
 * RECAP_REACTION_THRESHOLD reactions, most-reacted first. A fixed threshold
 * rather than a relative "top N" — see lib/scenes.ts for why.
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

  const guildId = request.nextUrl.searchParams.get('guild_id');
  if (!guildId) return Response.json({ error: 'guild_id is required' }, { status: 400 });

  const cutoff = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
  const { data: scenes } = await supabase
    .from('scenes')
    .select('*, profiles(display_name, avatar_url, avatar_config), events!inner(id, title, guild_id)')
    .eq('hidden', false)
    .eq('events.guild_id', guildId)
    .gt('created_at', cutoff);

  const withCounts = await Promise.all(
    (scenes ?? []).map(async (s) => {
      const { count } = await supabase.from('scene_reactions').select('*', { count: 'exact', head: true }).eq('scene_id', s.id);
      return { ...s, reaction_count: count ?? 0 };
    })
  );

  const recap = withCounts
    .filter((s) => s.reaction_count >= RECAP_REACTION_THRESHOLD)
    .sort((a, b) => b.reaction_count - a.reaction_count);

  const withUrls = await Promise.all(
    recap.map(async (s) => {
      const { data: signed } = await supabase.storage.from('scenes').createSignedUrl(s.storage_path, SIGNED_URL_TTL_S);
      return { ...s, url: signed?.signedUrl };
    })
  );

  return Response.json({ recap: withUrls });
}
