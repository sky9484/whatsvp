import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/apiAuth';

/** GET /api/guilds/[slug] — a guild's full home: roster, events, groups. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;

  let supabase;
  try {
    supabase = createServiceClient();
  } catch {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  // owner:owner_id join gives the address dues are paid to (v4 P5) — needed
  // client-side to build the transfer PTB; the server re-verifies it at
  // /api/transfers/verify anyway.
  const { data: guild } = await supabase.from('guilds').select('*, owner:owner_id(sui_address)').eq('slug', slug).maybeSingle();
  if (!guild) return Response.json({ error: 'Guild not found' }, { status: 404 });
  const owner = Array.isArray(guild.owner) ? guild.owner[0] : guild.owner;

  const [{ data: members }, { data: events }, { data: groups }] = await Promise.all([
    supabase
      .from('guild_members')
      .select('role, joined_at, profile_id, dues_paid_until, profiles(display_name, avatar_url)')
      .eq('guild_id', guild.id)
      .order('joined_at', { ascending: true }),
    supabase
      .from('events')
      .select('*')
      .eq('guild_id', guild.id)
      .gte('starts_at', new Date(Date.now() - 8 * 3600_000).toISOString())
      .order('starts_at', { ascending: true }),
    supabase.from('groups').select('*').eq('guild_id', guild.id),
  ]);

  return Response.json({
    guild: { ...guild, owner: undefined, owner_address: owner?.sui_address ?? null, member_count: members?.length ?? 0 },
    members: members ?? [],
    events: events ?? [],
    groups: groups ?? [],
  });
}

/** PATCH /api/guilds/[slug] — owner-only branding update. */
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;

  let supabase;
  try {
    supabase = createServiceClient();
  } catch {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const me = await requireProfile(request, supabase);
  if (!me) return Response.json({ error: 'Login required' }, { status: 401 });

  const { data: guild } = await supabase.from('guilds').select('*').eq('slug', slug).maybeSingle();
  if (!guild) return Response.json({ error: 'Guild not found' }, { status: 404 });
  if (guild.owner_id !== me.profileId) {
    return Response.json({ error: 'Only the owner can edit this guild' }, { status: 403 });
  }

  let body: Partial<{ name: string; description: string; color: string; logo_url: string; banner_url: string; dues_amount_base: string | null; dues_period: string }>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const patch: Record<string, string | null> = {};
  for (const k of ['name', 'description', 'color', 'logo_url', 'banner_url'] as const) {
    if (k in body) patch[k] = (body[k] ?? '').toString().trim() || null;
  }
  // Dues config (v4 P5) — amount in USDC base units + a period the dues cover.
  if ('dues_amount_base' in body) patch.dues_amount_base = body.dues_amount_base ? String(body.dues_amount_base) : null;
  if ('dues_period' in body && ['none', 'monthly', 'yearly'].includes(String(body.dues_period))) {
    patch.dues_period = String(body.dues_period);
  }

  const { data, error } = await supabase.from('guilds').update(patch).eq('id', guild.id).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ guild: data });
}
