import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/apiAuth';

const HANDLE_RE = /^[a-z0-9_]{3,20}$/i;
const RESERVED = new Set([
  'admin', 'root', 'support', 'help', 'whatsvp', 'official', 'mod', 'moderator',
  'staff', 'team', 'system', 'api', 'me', 'you', 'guild', 'event', 'settings',
]);

/**
 * GET /api/handle?handle=ana — resolve a @handle to a send-target for the
 * confirm screen: display name + avatar + sui_address. Public read (handles
 * are meant to be looked up), but never returns anything beyond what's needed
 * to show a recipient.
 *
 * POST /api/handle { handle } — claim your own @handle. Direct client writes to
 * profiles.handle are revoked (010/012), so format + reserved-word +
 * uniqueness checks all live here.
 */
export async function GET(request: NextRequest) {
  let supabase;
  try {
    supabase = createServiceClient();
  } catch {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const handle = request.nextUrl.searchParams.get('handle')?.trim();
  if (!handle) return Response.json({ error: 'handle is required' }, { status: 400 });

  const { data } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, avatar_config, sui_address, handle')
    .ilike('handle', handle)
    .maybeSingle();
  if (!data) return Response.json({ error: 'No one goes by that handle.' }, { status: 404 });

  return Response.json({
    profile_id: data.id,
    display_name: data.display_name,
    avatar_url: data.avatar_url,
    avatar_config: data.avatar_config,
    handle: data.handle,
    address: data.sui_address,
  });
}

export async function POST(request: NextRequest) {
  let supabase;
  try {
    supabase = createServiceClient();
  } catch {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const me = await requireProfile(request, supabase);
  if (!me) return Response.json({ error: 'Log in required' }, { status: 401 });

  let body: { handle?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const handle = body.handle?.trim();
  if (!handle || !HANDLE_RE.test(handle)) {
    return Response.json({ error: 'Handles are 3–20 letters, numbers, or underscores.' }, { status: 400 });
  }
  if (RESERVED.has(handle.toLowerCase())) {
    return Response.json({ error: 'That handle is reserved.' }, { status: 400 });
  }

  const { data: taken } = await supabase.from('profiles').select('id').ilike('handle', handle).maybeSingle();
  if (taken && taken.id !== me.profileId) {
    return Response.json({ error: 'That handle is taken.' }, { status: 409 });
  }

  const { error } = await supabase.from('profiles').update({ handle }).eq('id', me.profileId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, handle });
}
