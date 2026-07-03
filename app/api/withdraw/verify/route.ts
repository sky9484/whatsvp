import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/apiAuth';
import { getSuiClient } from '@/lib/sui-server';

const SUI_COIN_TYPE = '0x2::sui::SUI';

/**
 * POST /api/withdraw/verify — audit-log a completed withdraw-to-external-wallet
 * transfer (pre-v4 P0 audit fix). The client signs and submits the transfer
 * itself (self-custodial, its own gas — there is no server relay for this
 * flow, so this route can't prevent the on-chain transfer from happening).
 * What it DOES do is the "history integrity" half of the v4 brief's §5.2
 * rule: never trust a client-reported amount/recipient. It re-fetches the
 * transaction by digest, confirms the sender really is this session's
 * address, and derives recipient + amount from the chain's own balance
 * changes — then writes the one audit row the client has no INSERT policy
 * for (see 008_p0_audit_fixes.sql).
 *
 * Body: { digest: string }
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

  let body: { digest?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.digest) return Response.json({ error: 'digest is required' }, { status: 400 });

  // Idempotent: a retried confirm (e.g. flaky network right after signAndExecute)
  // must not error or double-count.
  const { data: existing } = await supabase
    .from('withdrawals')
    .select('id')
    .eq('digest', body.digest)
    .maybeSingle();
  if (existing) return Response.json({ ok: true, alreadyRecorded: true });

  let tx;
  try {
    tx = await getSuiClient().getTransactionBlock({
      digest: body.digest,
      options: { showEffects: true, showInput: true, showBalanceChanges: true },
    });
  } catch {
    return Response.json({ error: 'Could not find that transaction on-chain.' }, { status: 404 });
  }

  if (tx.effects?.status.status !== 'success') {
    return Response.json({ error: "That transaction didn't succeed on-chain." }, { status: 400 });
  }

  const sender = tx.transaction?.data.sender;
  if (!sender || sender !== me.address) {
    return Response.json({ error: 'That transaction is not from your session.' }, { status: 403 });
  }

  // The recipient's positive SUI balance change is the authoritative transfer
  // amount — it excludes gas (which only debits the sender) so it can't be
  // spoofed by a client claiming a different amount than what actually moved.
  // ObjectOwner is a union that can be a bare string ('Immutable'), so guard
  // the object shape before narrowing with `in`.
  const isAddressOwned = (owner: unknown): owner is { AddressOwner: string } =>
    typeof owner === 'object' && owner !== null && 'AddressOwner' in owner;

  const recipientChange = (tx.balanceChanges ?? []).find(
    (bc) =>
      bc.coinType === SUI_COIN_TYPE &&
      isAddressOwned(bc.owner) &&
      bc.owner.AddressOwner !== sender &&
      BigInt(bc.amount) > 0n
  );
  if (!recipientChange || !isAddressOwned(recipientChange.owner)) {
    return Response.json({ error: "Couldn't verify a transfer in that transaction." }, { status: 400 });
  }

  const { error } = await supabase.from('withdrawals').insert({
    profile_id: me.profileId,
    from_address: sender,
    to_address: recipientChange.owner.AddressOwner,
    amount_mist: recipientChange.amount,
    digest: body.digest,
  });
  // A unique-violation here means a concurrent request already recorded it — fine, idempotent.
  if (error && error.code !== '23505') {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
