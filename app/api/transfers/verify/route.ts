import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/apiAuth';
import { getSuiClient } from '@/lib/sui-server';
import { USDC_TYPE } from '@/lib/money';
import { checkAccountEligible, checkDailyCount } from '@/lib/moneyGuards';
import { rateLimited, clientIp } from '@/lib/rateLimit';
import type { TransferContextKind } from '@/lib/money';

/**
 * POST /api/transfers/verify — the money-history integrity path (§5.2). The
 * client signs + submits the USDC transfer itself (self-custodial, Enoki-
 * sponsored when on the allowlist), then posts the digest here. The SERVER
 * re-fetches the tx, confirms sender = this session's address, the coin type,
 * the recipient, and the amount from the chain's own balance changes — never
 * a client-reported amount — then writes the `transfers` row and applies the
 * context side effect (mark a split share paid / extend guild dues).
 *
 * Body: { digest, context_kind, context_id? }
 */
function isAddressOwned(owner: unknown): owner is { AddressOwner: string } {
  return typeof owner === 'object' && owner !== null && 'AddressOwner' in owner;
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

  if (rateLimited(`xfer:${me.profileId}`, 20, 60_000) || rateLimited(`xfer-ip:${clientIp(request)}`, 40, 60_000)) {
    return Response.json({ error: 'Slow down a moment and try again.' }, { status: 429 });
  }

  let body: { digest?: string; context_kind?: TransferContextKind; context_id?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { digest, context_kind } = body;
  const validKinds: TransferContextKind[] = ['direct', 'split', 'dues', 'tip'];
  if (!digest || !context_kind || !validKinds.includes(context_kind)) {
    return Response.json({ error: 'digest and a valid context_kind are required' }, { status: 400 });
  }

  // Idempotent — a retried confirm must not double-record or double-apply.
  const { data: existing } = await supabase.from('transfers').select('id').eq('digest', digest).maybeSingle();
  if (existing) return Response.json({ ok: true, alreadyRecorded: true });

  const eligible = await checkAccountEligible(supabase, me.profileId, me.address);
  if (!eligible.ok) return Response.json({ error: eligible.reason }, { status: 403 });
  const daily = await checkDailyCount(supabase, me.profileId);
  if (!daily.ok) return Response.json({ error: daily.reason }, { status: 429 });

  let tx;
  try {
    tx = await getSuiClient().getTransactionBlock({
      digest,
      options: { showEffects: true, showInput: true, showBalanceChanges: true },
    });
  } catch {
    return Response.json({ error: 'Could not find that transaction.' }, { status: 404 });
  }

  if (tx.effects?.status.status !== 'success') {
    return Response.json({ error: "That transfer didn't go through." }, { status: 400 });
  }
  const sender = tx.transaction?.data.sender;
  if (!sender || sender !== me.address) {
    return Response.json({ error: 'That transfer is not from your session.' }, { status: 403 });
  }

  // The recipient's positive USDC balance change is the authoritative amount —
  // it can't be spoofed by a client claiming a different figure.
  const recipientChange = (tx.balanceChanges ?? []).find(
    (bc) =>
      bc.coinType === USDC_TYPE &&
      isAddressOwned(bc.owner) &&
      bc.owner.AddressOwner !== sender &&
      BigInt(bc.amount) > 0n
  );
  if (!recipientChange || !isAddressOwned(recipientChange.owner)) {
    return Response.json({ error: "Couldn't verify a USDC transfer in that transaction." }, { status: 400 });
  }
  const toAddress = recipientChange.owner.AddressOwner;
  const amountBase = BigInt(recipientChange.amount);

  // Resolve the recipient profile (if any) from the on-chain address.
  const { data: toProfile } = await supabase.from('profiles').select('id').eq('sui_address', toAddress).maybeSingle();

  const { data: inserted, error } = await supabase
    .from('transfers')
    .insert({
      digest,
      from_profile: me.profileId,
      to_profile: toProfile?.id ?? null,
      to_address: toAddress,
      amount_base: amountBase.toString(),
      context_kind,
      context_id: body.context_id ?? null,
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') return Response.json({ ok: true, alreadyRecorded: true });
    return Response.json({ error: error.message }, { status: 500 });
  }

  // ── Apply the context side effect, each re-verifying recipient + amount ──
  if (context_kind === 'split' && body.context_id) {
    const { data: share } = await supabase
      .from('split_shares')
      .select('id, amount_base, split_id, splits(payee_address)')
      .eq('id', body.context_id)
      .eq('profile_id', me.profileId)
      .maybeSingle();
    const split = share && (Array.isArray(share.splits) ? share.splits[0] : share.splits);
    if (share && split && split.payee_address === toAddress && amountBase >= BigInt(share.amount_base)) {
      await supabase.from('split_shares').update({ paid_transfer: inserted.id }).eq('id', share.id);
    }
  } else if (context_kind === 'dues' && body.context_id) {
    const { data: guild } = await supabase
      .from('guilds')
      .select('id, owner_id, dues_period, profiles:owner_id(sui_address)')
      .eq('id', body.context_id)
      .maybeSingle();
    const owner = guild && (Array.isArray(guild.profiles) ? guild.profiles[0] : guild.profiles);
    if (guild && owner?.sui_address === toAddress && guild.dues_period !== 'none') {
      const addMs = guild.dues_period === 'yearly' ? 365 * 864e5 : 30 * 864e5;
      const until = new Date(Date.now() + addMs).toISOString();
      await supabase.from('guild_members').update({ dues_paid_until: until }).eq('guild_id', guild.id).eq('profile_id', me.profileId);
    }
  }

  return Response.json({ ok: true });
}
