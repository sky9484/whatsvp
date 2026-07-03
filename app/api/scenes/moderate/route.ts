import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/apiAuth';

/** POST /api/scenes/moderate — the organizer removes any Scene at their own event. */
export async function POST(request: NextRequest) {
  let supabase;
  try {
    supabase = createServiceClient();
  } catch {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const me = await requireProfile(request, supabase);
  if (!me) return Response.json({ error: 'Log in required' }, { status: 401 });

  let body: { scene_id?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.scene_id) return Response.json({ error: 'scene_id is required' }, { status: 400 });

  const { data: scene } = await supabase.from('scenes').select('id, event_id, events(host_id)').eq('id', body.scene_id).maybeSingle();
  if (!scene) return Response.json({ error: 'Scene not found' }, { status: 404 });
  const event = Array.isArray(scene.events) ? scene.events[0] : scene.events;
  if (!event || event.host_id !== me.profileId) {
    return Response.json({ error: 'Only the organizer can remove this.' }, { status: 403 });
  }

  await supabase.from('scenes').update({ hidden: true }).eq('id', body.scene_id);
  await supabase.from('moderation_actions').insert({
    actor_profile_id: me.profileId,
    action: 'host_remove',
    target_type: 'scene',
    target_id: body.scene_id,
  });

  return Response.json({ ok: true });
}
