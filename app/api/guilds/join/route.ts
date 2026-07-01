import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/apiAuth';

/**
 * POST /api/guilds/join — join (or leave) a guild.
 * Body: { guild_id: string, leave?: boolean }
 *
 * On join, the client then triggers an Enoki-sponsored GuildBadge mint (Upgrade 3).
 * Membership itself is recorded here idempotently.
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

  const { error } = await supabase
    .from('guild_members')
    .upsert(
      { guild_id: body.guild_id, profile_id: me.profileId, role: 'member' },
      { onConflict: 'guild_id,profile_id', ignoreDuplicates: true }
    );
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, joined: true });
}
