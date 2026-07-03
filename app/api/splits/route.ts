import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/apiAuth';

/**
 * Splits — the event-room hero flow (§5.3). Creation goes through this route
 * (not a direct client write) because it snapshots the payee address and
 * fans out one share row per participant atomically; paid status is flipped
 * only by /api/transfers/verify after a real on-chain payment.
 *
 * GET  /api/splits?event_id=X → splits I'm involved in for that event (+ shares).
 * POST /api/splits { event_id, total_base, note?, participant_ids[] }
 */
export async function GET(request: NextRequest) {
  let supabase;
  try {
    supabase = createServiceClient();
  } catch {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const me = await requireProfile(request, supabase);
  if (!me) return Response.json({ error: 'Log in required' }, { status: 401 });

  const eventId = request.nextUrl.searchParams.get('event_id');
  if (!eventId) return Response.json({ error: 'event_id is required' }, { status: 400 });

  const { data: splits } = await supabase
    .from('splits')
    .select('*, creator:creator_id(display_name, avatar_url, avatar_config), split_shares(id, profile_id, amount_base, paid_transfer, profiles(display_name, avatar_url, avatar_config))')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false });

  // RLS already limits rows to splits I created or owe a share on.
  return Response.json({ splits: splits ?? [] });
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

  let body: { event_id?: string; total_base?: string; note?: string; participant_ids?: string[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { event_id, participant_ids = [] } = body;
  const totalBase = body.total_base ? BigInt(body.total_base) : 0n;
  if (!event_id || totalBase <= 0n) {
    return Response.json({ error: 'An event and a total are required.' }, { status: 400 });
  }
  // The creator must be checked in to split at an event — splits are anchored
  // to real presence, not just anyone with the event id.
  const { data: myCheckin } = await supabase.from('checkins').select('id').eq('event_id', event_id).eq('profile_id', me.profileId).maybeSingle();
  if (!myCheckin) return Response.json({ error: 'Check in to the event to start a split.' }, { status: 403 });

  const { data: me_profile } = await supabase.from('profiles').select('sui_address').eq('id', me.profileId).maybeSingle();
  if (!me_profile) return Response.json({ error: 'Profile not found' }, { status: 404 });

  // Participants exclude the creator (they paid); split the total evenly, with
  // any rounding remainder landing on the first share so the shares sum exactly.
  const payers = participant_ids.filter((id) => id !== me.profileId);
  if (payers.length === 0) return Response.json({ error: 'Pick at least one person to split with.' }, { status: 400 });

  const per = totalBase / BigInt(payers.length);
  const remainder = totalBase % BigInt(payers.length);

  const { data: split, error } = await supabase
    .from('splits')
    .insert({ event_id, creator_id: me.profileId, payee_address: me_profile.sui_address, note: body.note ?? null, total_base: totalBase.toString() })
    .select('id')
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const shares = payers.map((profile_id, i) => ({
    split_id: split.id,
    profile_id,
    amount_base: (per + (i === 0 ? remainder : 0n)).toString(),
  }));
  const { error: sharesErr } = await supabase.from('split_shares').insert(shares);
  if (sharesErr) return Response.json({ error: sharesErr.message }, { status: 500 });

  return Response.json({ ok: true, split_id: split.id });
}
