import { NextRequest } from 'next/server';
import { after } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/apiAuth';
import { mintGuildBadgeServerSide } from '@/lib/sui-admin';

/**
 * POST /api/guilds/join — join (or leave) a guild.
 * Body: { guild_id: string, leave?: boolean }
 *
 * On join, fire-and-forgets a server-side GuildBadge mint via the
 * backend-held AdminCap (pre-v4 P0 audit fix — guild.move's mint used to be
 * client-callable with zero access control; now only the server can mint,
 * and only after this route has already recorded real membership). Mirrors
 * the exact pattern /api/checkin uses for Stamp minting.
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

  let body: { guild_id?: string; leave?: boolean };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.guild_id) return Response.json({ error: 'guild_id is required' }, { status: 400 });

  if (body.leave) {
    // Owners can't leave their own guild (would orphan it)
    const { data: guild } = await supabase.from('guilds').select('owner_id').eq('id', body.guild_id).maybeSingle();
    if (guild?.owner_id === me.profileId) {
      return Response.json({ error: "Owners can't leave their own guild" }, { status: 409 });
    }
    const { error } = await supabase
      .from('guild_members')
      .delete()
      .eq('guild_id', body.guild_id)
      .eq('profile_id', me.profileId);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true, joined: false });
  }

  const { data: guild } = await supabase.from('guilds').select('slug').eq('id', body.guild_id).maybeSingle();
  if (!guild) return Response.json({ error: 'Guild not found' }, { status: 404 });

  const { error } = await supabase
    .from('guild_members')
    .upsert(
      { guild_id: body.guild_id, profile_id: me.profileId, role: 'member' },
      { onConflict: 'guild_id,profile_id', ignoreDuplicates: true }
    );
  if (error) return Response.json({ error: error.message }, { status: 500 });

  after(async () => {
    const attempt = async () => mintGuildBadgeServerSide(me.address, guild.slug);
    let result = await attempt();
    if (!result.minted && result.reason !== 'not_configured') {
      await new Promise((r) => setTimeout(r, 2000));
      result = await attempt(); // one retry — best-effort, not a durable queue
    }
    if (result.minted) {
      await supabase
        .from('guild_members')
        .update({ badge_minted_at: new Date().toISOString(), badge_tx_digest: result.digest })
        .eq('guild_id', body.guild_id)
        .eq('profile_id', me.profileId);
    } else if (result.reason !== 'not_configured') {
      console.warn('[guild-badge] mint failed:', result.reason);
    }
  });

  return Response.json({ ok: true, joined: true });
}
