import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/apiAuth';

/**
 * POST /api/topics — create a topic (community) inside a group.
 * Body: { group_id: string, name: string }
 * Only members of the group may add topics.
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

  let body: { group_id?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!body.group_id || !name) {
    return Response.json({ error: 'group_id and name are required' }, { status: 400 });
  }

  // Caller must be a member of the group
  const { data: membership } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('group_id', body.group_id)
    .eq('profile_id', me.profileId)
    .maybeSingle();

  if (!membership) {
    return Response.json({ error: 'You must be a member of this group' }, { status: 403 });
  }

  const { data: topic, error } = await supabase
    .from('topics')
    .insert({ group_id: body.group_id, name })
    .select()
    .single();

  if (error) {
    console.error('[topics] create error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ topic }, { status: 201 });
}
