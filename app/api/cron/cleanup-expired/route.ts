import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

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

  return Response.json({ photosDeleted, messagesDeleted: messagesDeleted ?? 0 });
}
