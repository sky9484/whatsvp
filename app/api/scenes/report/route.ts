import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/apiAuth';
import { REPORT_HIDE_THRESHOLD } from '@/lib/scenes';

/**
 * POST /api/scenes/report — the auto-hide-at-3-reports invariant, so this
 * can't be a direct client insert (a client write could never also flip
 * `scenes.hidden` for everyone). No ML filter yet — the check-in gate plus
 * this reports threshold carry moderation for the founding-guild phase.
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

  let body: { scene_id?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.scene_id) return Response.json({ error: 'scene_id is required' }, { status: 400 });

  const { error: insertErr } = await supabase
    .from('scene_reports')
    .insert({ scene_id: body.scene_id, profile_id: me.profileId, reason: body.reason ?? null });
  if (insertErr && insertErr.code !== '23505') {
    return Response.json({ error: insertErr.message }, { status: 500 });
  }

  const { count } = await supabase.from('scene_reports').select('*', { count: 'exact', head: true }).eq('scene_id', body.scene_id);
  if ((count ?? 0) >= REPORT_HIDE_THRESHOLD) {
    await supabase.from('scenes').update({ hidden: true }).eq('id', body.scene_id);
    await supabase.from('moderation_actions').insert({
      action: 'auto_hide_reports',
      target_type: 'scene',
      target_id: body.scene_id,
      reason: `${count} reports`,
    });
  }

  return Response.json({ ok: true });
}
