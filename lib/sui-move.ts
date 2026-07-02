import { Transaction } from '@mysten/sui/transactions';

/**
 * Transaction builders for the whatsvp Move package (Upgrade 3).
 * All mints are executed through the connected Enoki wallet, which sponsors the
 * gas (gasless) when sponsorship is enabled in the Enoki portal.
 *
 * Everything is gated on NEXT_PUBLIC_WHATSVP_PACKAGE_ID — until the package is
 * published to testnet and the id is set, isMoveConfigured() is false and the
 * app skips all on-chain calls (no crypto UX ever surfaces).
 */

export const PACKAGE_ID = process.env.NEXT_PUBLIC_WHATSVP_PACKAGE_ID ?? '';
export const PASSPORT_REGISTRY_ID = process.env.NEXT_PUBLIC_PASSPORT_REGISTRY_ID ?? '';

export function isMoveConfigured(): boolean {
  return Boolean(PACKAGE_ID && PASSPORT_REGISTRY_ID);
}

export const PASSPORT_TYPE = () => `${PACKAGE_ID}::passport::Passport`;
export const AVATAR_TYPE = () => `${PACKAGE_ID}::cosmetics::Avatar`;
export const GUILD_BADGE_TYPE = () => `${PACKAGE_ID}::guild::GuildBadge`;

/** Free soulbound Passport mint (one per address, enforced on-chain). */
export function buildMintPassportTx(displayName: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::passport::mint`,
    arguments: [tx.object(PASSPORT_REGISTRY_ID), tx.pure.string(displayName)],
  });
  return tx;
}

/** Soulbound GuildBadge mint, called on guild join. */
export function buildMintGuildBadgeTx(guildSlug: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::guild::mint`,
    arguments: [tx.pure.string(guildSlug)],
  });
  return tx;
}
