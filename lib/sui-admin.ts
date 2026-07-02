import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { getSuiClient } from './sui-server';
import { PACKAGE_ID, isMoveConfigured } from './sui-move';

/**
 * Server-side Stamp minting (v3 P3). Unlike every other mint in this app —
 * Passport, GuildBadge, cosmetic Avatars, all client-signed via the Enoki
 * wallet with sponsored gas — a Stamp requires the backend's OWN keypair,
 * because minting must happen only after the server has verified a real
 * check-in. There is deliberately no client-callable path here at all; see
 * stamp.move's doc comment for why (the direct fix for the guild.move
 * access-control finding from the Move audit).
 *
 * The admin address pays its own gas (a small amount of SUI funded once on
 * the operator's machine) — a backend hot-wallet pattern, not per-user Enoki
 * sponsorship, since there's no user-signed transaction to sponsor here.
 */

const STAMP_REGISTRY_ID = process.env.STAMP_REGISTRY_ID ?? '';
const STAMP_ADMIN_CAP_ID = process.env.STAMP_ADMIN_CAP_ID ?? '';
const STAMP_ADMIN_PRIVATE_KEY = process.env.STAMP_ADMIN_PRIVATE_KEY ?? '';

export function isStampMintingConfigured(): boolean {
  return Boolean(isMoveConfigured() && STAMP_REGISTRY_ID && STAMP_ADMIN_CAP_ID && STAMP_ADMIN_PRIVATE_KEY);
}

let cachedKeypair: Ed25519Keypair | null = null;
function getAdminKeypair(): Ed25519Keypair {
  if (!cachedKeypair) cachedKeypair = Ed25519Keypair.fromSecretKey(STAMP_ADMIN_PRIVATE_KEY);
  return cachedKeypair;
}

export type StampMintResult = { minted: true; digest: string } | { minted: false; reason: string };

/**
 * Mint a Stamp to `recipient` for `eventId`. The caller MUST have already
 * verified attendance (this function trusts it completely) and must never be
 * reachable from a client-controlled code path. No-ops gracefully — returns
 * `{minted:false, reason:'not_configured'}` — until an operator publishes
 * stamp.move and sets the three STAMP_* env vars, same as every other Move
 * feature in this app.
 */
export async function mintStampServerSide(
  recipient: string,
  eventId: string,
  eventTitle: string
): Promise<StampMintResult> {
  if (!isStampMintingConfigured()) return { minted: false, reason: 'not_configured' };

  try {
    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::stamp::mint_to`,
      arguments: [
        tx.object(STAMP_ADMIN_CAP_ID),
        tx.object(STAMP_REGISTRY_ID),
        tx.pure.address(recipient),
        tx.pure.string(eventId),
        tx.pure.string(eventTitle),
      ],
    });

    const client = getSuiClient();
    const result = await client.signAndExecuteTransaction({
      transaction: tx,
      signer: getAdminKeypair(),
      options: { showEffects: true },
    });

    if (result.effects?.status.status === 'success') {
      return { minted: true, digest: result.digest };
    }
    return { minted: false, reason: result.effects?.status.error ?? 'tx_failed' };
  } catch (e) {
    return { minted: false, reason: e instanceof Error ? e.message : 'unknown_error' };
  }
}
