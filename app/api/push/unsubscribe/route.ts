import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/apiAuth';

/** POST /api/push/unsubscribe — remove a web-push subscription. */
export async function POST(request: NextRequest) {
  let supabase;
  try {
    supabase = createServiceClient();
  } catch {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const me = await requireProfile(request, supabase);
  if (!me) return Response.json({ error: 'Log in required' }, { status: 401 });

  let body: { endpoint?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.endpoint) return Response.json({ error: 'endpoint is required' }, { status: 400 });

  await supabase.from('push_subscriptions').delete().eq('profile_id', me.profileId).eq('endpoint', body.endpoint);
  return Response.json({ ok: true });
}
