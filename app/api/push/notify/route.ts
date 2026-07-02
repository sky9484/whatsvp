import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/apiAuth';
import { sendPushToProfile } from '@/lib/webPush';

/**
 * POST /api/push/notify — best-effort push after a DM or @mention.
 * Body: { recipient_profile_id, title, body, url? }
 *
 * Called fire-and-forget from the client right after a successful message
 * send. Not a durable queue: if the tab closes before this fires, no push
 * goes out — but the message itself was already saved either way, so this
 * failure mode only costs a notification, never data.
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

  let body: { recipient_profile_id?: string; title?: string; body?: string; url?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.recipient_profile_id || !body.title || !body.body) {
    return Response.json({ error: 'recipient_profile_id, title, and body are required' }, { status: 400 });
  }
  if (body.recipient_profile_id === me.profileId) {
    return Response.json({ ok: true }); // never notify yourself
  }

  await sendPushToProfile(body.recipient_profile_id, { title: body.title, body: body.body, url: body.url });
  return Response.json({ ok: true });
}
