import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/apiAuth';

/**
 * POST /api/groups/join — join a group as a member.
 * Body: { group_id: string }
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

  let body: { group_id?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.group_id) {
    return Response.json({ error: 'group_id is required' }, { status: 400 });
  }

  // Idempotent: upsert on the composite PK (group_id, profile_id)
  const { error } = await supabase
    .from('group_members')
    .upsert(
      { group_id: body.group_id, profile_id: me.profileId, role: 'member' },
      { onConflict: 'group_id,profile_id', ignoreDuplicates: true }
    );

  if (error) {
    console.error('[groups/join] error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
