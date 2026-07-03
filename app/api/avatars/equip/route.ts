import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/apiAuth';
import { getSuiClient } from '@/lib/sui-server';
import { isMoveConfigured } from '@/lib/sui-move';
import type { AvatarSlot } from '@/lib/types';

/**
 * POST /api/avatars/equip — the only path that can change `profiles.avatar_config`
 * (direct client UPDATE is revoked in 010_avatars_presence.sql). Free items
 * equip immediately; premium items require proof of unlock first — either a
 * `granted_items` row (today's only real path: checkin milestones) or, when
 * the item has a real on-chain type and the Move package is published, owned
 * on-chain. Body: { slot, item_id } — item_id: null unequips that slot.
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

  let body: { slot?: AvatarSlot; item_id?: string | null };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.slot) return Response.json({ error: 'slot is required' }, { status: 400 });

  const { data: profile } = await supabase.from('profiles').select('avatar_config').eq('id', me.profileId).maybeSingle();
  if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });
  const config = { ...(profile.avatar_config ?? {}) };

  if (!body.item_id) {
    delete config[body.slot];
  } else {
    const { data: item } = await supabase.from('avatar_items').select('*').eq('id', body.item_id).maybeSingle();
    if (!item) return Response.json({ error: 'Item not found' }, { status: 404 });
    if (item.slot !== body.slot) return Response.json({ error: 'That item does not belong to this slot' }, { status: 400 });

    if (item.premium) {
      const { data: granted } = await supabase
        .from('granted_items')
        .select('id')
        .eq('profile_id', me.profileId)
        .eq('item_id', item.id)
        .maybeSingle();

      let owned = Boolean(granted);
      if (!owned && item.kiosk_type && isMoveConfigured()) {
        try {
          const owned_objects = await getSuiClient().getOwnedObjects({
            owner: me.address,
            filter: { StructType: item.kiosk_type },
            limit: 1,
          });
          owned = (owned_objects.data?.length ?? 0) > 0;
        } catch {
          owned = false;
        }
      }
      if (!owned) return Response.json({ error: "You don't own this item yet." }, { status: 403 });
    }

    config[body.slot] = item.id;
  }

  const { error } = await supabase.from('profiles').update({ avatar_config: config }).eq('id', me.profileId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true, avatar_config: config });
}
