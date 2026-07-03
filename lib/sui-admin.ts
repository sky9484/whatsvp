import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { getSuiClient } from './sui-server';
import { PACKAGE_ID, isMoveConfigured } from './sui-move';

/**
 * Server-side minting for anything that requires the backend to have already
 * verified something real before the mint happens — Stamps (real check-in,
 * v3 P3) and, since the pre-v4 P0 audit fix, GuildBadges (real membership row
 * in `guild_members`, previously ungated — see guild.move's doc comment).
 * Unlike Passport/cosmetic Avatars (client-signed via the Enoki wallet, gas
 * sponsored), these mints use the backend's OWN keypair because there is no
 * user-signed transaction to gate them — the client must never be able to
 * call these move targets directly.
 *
 * One backend hot-wallet address holds both AdminCaps (stamp::AdminCap and
 * guild::AdminCap) and pays its own gas — funded once on the operator's
 * machine, separate from per-user Enoki sponsorship.
 */

const STAMP_REGISTRY_ID = process.env.STAMP_REGISTRY_ID ?? '';
const STAMP_ADMIN_CAP_ID = process.env.STAMP_ADMIN_CAP_ID ?? '';
const STAMP_ADMIN_PRIVATE_KEY = process.env.STAMP_ADMIN_PRIVATE_KEY ?? '';
// Reuses the same backend signer as Stamps (STAMP_ADMIN_PRIVATE_KEY) — only
// the object ids differ, since the guild module has its own Registry/AdminCap.
const GUILD_REGISTRY_ID = process.env.GUILD_REGISTRY_ID ?? '';
const GUILD_ADMIN_CAP_ID = process.env.GUILD_ADMIN_CAP_ID ?? '';

export function isStampMintingConfigured(): boolean {
  return Boolean(isMoveConfigured() && STAMP_REGISTRY_ID && STAMP_ADMIN_CAP_ID && STAMP_ADMIN_PRIVATE_KEY);
}

export function isGuildBadgeMintingConfigured(): boolean {
  return Boolean(isMoveConfigured() && GUILD_REGISTRY_ID && GUILD_ADMIN_CAP_ID && STAMP_ADMIN_PRIVATE_KEY);
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

export type GuildBadgeMintResult = { minted: true; digest: string } | { minted: false; reason: string };

/**
 * Mint a GuildBadge to `recipient` for `guildSlug`. The caller MUST have
 * already recorded real membership (a `guild_members` row) before calling
 * this — see /api/guilds/join, which is the only caller. This is the pre-v4
 * P0 audit fix: guild.move's `mint` used to be a plain public function with
 * no access control at all; it's now gated the same way as Stamps.
 */
export async function mintGuildBadgeServerSide(
  recipient: string,
  guildSlug: string
): Promise<GuildBadgeMintResult> {
  if (!isGuildBadgeMintingConfigured()) return { minted: false, reason: 'not_configured' };

  try {
    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::guild::mint_to`,
      arguments: [
        tx.object(GUILD_ADMIN_CAP_ID),
        tx.object(GUILD_REGISTRY_ID),
        tx.pure.address(recipient),
        tx.pure.string(guildSlug),
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
