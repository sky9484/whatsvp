import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/apiAuth';

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;

/** GET /api/guilds — list all guilds with member counts. */
export async function GET() {
  let supabase;
  try {
    supabase = createServiceClient();
  } catch {
    return Response.json({ guilds: [] });
  }

  const { data: guilds, error } = await supabase
    .from('guilds')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Attach member counts (small N of guilds → a grouped count is fine)
  const { data: members } = await supabase.from('guild_members').select('guild_id');
  const counts = new Map<string, number>();
  for (const m of members ?? []) counts.set(m.guild_id, (counts.get(m.guild_id) ?? 0) + 1);

  return Response.json({
    guilds: (guilds ?? []).map((g) => ({ ...g, member_count: counts.get(g.id) ?? 0 })),
  });
}

/**
 * POST /api/guilds — create a guild (+ owner membership).
 * Body: { name, slug, description?, color?, logo_url? }
 * The GuildBadge mint (Upgrade 3) is triggered client-side after this succeeds.
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

  let body: { name?: string; slug?: string; description?: string; color?: string; logo_url?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const name = body.name?.trim();
  const slug = body.slug?.trim().toLowerCase();
  if (!name) return Response.json({ error: 'A guild name is required' }, { status: 400 });
  if (!slug || !SLUG_RE.test(slug)) {
    return Response.json(
      { error: 'Slug must be 3–32 chars: lowercase letters, numbers, hyphens' },
      { status: 400 }
    );
  }

  const { data: existing } = await supabase.from('guilds').select('id').eq('slug', slug).maybeSingle();
  if (existing) return Response.json({ error: 'That slug is taken' }, { status: 409 });

  const { data: guild, error } = await supabase
    .from('guilds')
    .insert({
      slug,
      name,
      description: body.description?.trim() || null,
      color: body.color || '#1D9E75',
      logo_url: body.logo_url || null,
      owner_id: me.profileId,
    })
    .select()
    .single();

  if (error) {
    console.error('[guilds] create error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  const { error: mErr } = await supabase
    .from('guild_members')
    .insert({ guild_id: guild.id, profile_id: me.profileId, role: 'owner' });
  if (mErr) {
    console.error('[guilds] owner membership error:', mErr);
    return Response.json({ error: mErr.message }, { status: 500 });
  }

  return Response.json({ guild: { ...guild, member_count: 1 } }, { status: 201 });
}
