import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/apiAuth';

/**
 * POST /api/groups   — create a group (+ owner membership + default "general" topic)
 * Body: { name: string, description?: string, color?: string }
 *
 * group_members and topics only have SELECT policies under RLS, so this multi-step
 * write runs with the service role after verifying the caller's session token.
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

  let body: { name?: string; description?: string; color?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) return Response.json({ error: 'A group name is required' }, { status: 400 });

  // 1. Create the group
  const { data: group, error: gErr } = await supabase
    .from('groups')
    .insert({
      name,
      description: body.description?.trim() || null,
      color: body.color || '#1D9E75',
      owner_id: me.profileId,
    })
    .select()
    .single();

  if (gErr) {
    console.error('[groups] create error:', gErr);
    return Response.json({ error: gErr.message }, { status: 500 });
  }

  // 2. Add the creator as the owner member
  const { error: mErr } = await supabase.from('group_members').insert({
    group_id: group.id,
    profile_id: me.profileId,
    role: 'owner',
  });
  if (mErr) {
    console.error('[groups] membership error:', mErr);
    return Response.json({ error: mErr.message }, { status: 500 });
  }

  // 3. Seed a default topic
  const { data: topic, error: tErr } = await supabase
    .from('topics')
    .insert({ group_id: group.id, name: 'general' })
    .select()
    .single();
  if (tErr) {
    console.error('[groups] default topic error:', tErr);
    return Response.json({ error: tErr.message }, { status: 500 });
  }

  return Response.json({ group, topic }, { status: 201 });
}
