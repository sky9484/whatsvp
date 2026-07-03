import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { RECAP_REACTION_THRESHOLD } from '@/lib/scenes';

// ── Vercel Cron: runs daily ─────────────────────────────────────────────────
// vercel.json: { "crons": [{ "path": "/api/cron/cleanup-expired", "schedule": "0 3 * * *" }] }
//
// Supabase Storage has no built-in TTL/lifecycle rules, so "7-day photo
// expiry" is an application-level contract: event_photos.expires_at already
// gates visibility immediately (see 007_chat2.sql RLS), and this sweep does
// the actual deletion of the Storage object + row once it's passed. Also
// clears disappearing-DM messages past their expires_at.

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (process.env.CRON_SECRET && auth !== expected) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let supabase;
  try {
    supabase = createServiceClient();
  } catch {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const now = new Date().toISOString();

  const { data: expiredPhotos } = await supabase.from('event_photos').select('id, image_url').lt('expires_at', now);
  let photosDeleted = 0;
  for (const photo of expiredPhotos ?? []) {
    const match = photo.image_url.match(/event-photos\/(.+)$/);
    if (match) await supabase.storage.from('event-photos').remove([match[1]]);
    await supabase.from('event_photos').delete().eq('id', photo.id);
    photosDeleted++;
  }

  const { count: messagesDeleted } = await supabase
    .from('messages')
    .delete({ count: 'exact' })
    .not('expires_at', 'is', null)
    .lt('expires_at', now);

  // Area presence (v4 P3) has a 60-minute TTL — the client only ever reads
  // recent rows (lib/usePresence.ts filters by updated_at), but rows should
  // still be deleted for storage hygiene rather than accumulating forever.
  const staleCutoff = new Date(Date.now() - 60 * 60_000).toISOString();
  const { count: presenceDeleted } = await supabase.from('presence').delete({ count: 'exact' }).lt('updated_at', staleCutoff);

  // Scenes (v4 P4) lifecycle: visible 48h (a query-time filter, not deletion
  // — see /api/scenes GET) → hard-delete at 7 days unless it earned enough
  // reactions to survive into the guild recap → everything gone by 30 days
  // regardless, recap included. Storage has no native TTL, same "app-level
  // expiry contract" already established for event_photos above.
  const day7 = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  const day30 = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();

  const { data: agingScenes } = await supabase.from('scenes').select('id, storage_path, created_at').lt('created_at', day7);
  let scenesDeleted = 0;
  for (const scene of agingScenes ?? []) {
    const { count: reactionCount } = await supabase.from('scene_reactions').select('*', { count: 'exact', head: true }).eq('scene_id', scene.id);
    const pastRecapWindow = scene.created_at < day30;
    const notRecapWorthy = (reactionCount ?? 0) < RECAP_REACTION_THRESHOLD;
    if (pastRecapWindow || notRecapWorthy) {
      await supabase.storage.from('scenes').remove([scene.storage_path]);
      await supabase.from('scenes').delete().eq('id', scene.id);
      scenesDeleted++;
    }
  }

  return Response.json({
    photosDeleted,
    messagesDeleted: messagesDeleted ?? 0,
    presenceDeleted: presenceDeleted ?? 0,
    scenesDeleted,
  });
}
