import { Transaction } from '@mysten/sui/transactions';
import { isValidSuiAddress, parseToMist } from '@mysten/sui/utils';

export type SuiNetwork = 'testnet' | 'mainnet' | 'devnet';

export const SUI_NETWORK: SuiNetwork =
  (process.env.NEXT_PUBLIC_SUI_NETWORK as SuiNetwork) || 'testnet';

// @mysten/sui v2 dropped getFullnodeUrl; network entries now take { url, network }.
// These are the public Sui fullnode endpoints.
export const networkConfig = {
  testnet: { url: 'https://fullnode.testnet.sui.io:443', network: 'testnet' as const },
  mainnet: { url: 'https://fullnode.mainnet.sui.io:443', network: 'mainnet' as const },
  devnet: { url: 'https://fullnode.devnet.sui.io:443', network: 'devnet' as const },
};

/** Shorten a Sui address for display, e.g. 0x1234…cdef. Only shown in Settings. */
export function shortenAddress(address: string, chars = 4): string {
  if (!address) return '';
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`;
}

/** SUI has 9 decimals (1 SUI = 1e9 MIST). */
export function formatSui(mist: bigint | string | number, decimals = 4): string {
  const m = BigInt(mist);
  const whole = m / 1_000_000_000n;
  const frac = m % 1_000_000_000n;
  const fracStr = frac.toString().padStart(9, '0').slice(0, decimals).replace(/0+$/, '');
  return fracStr ? `${whole}.${fracStr}` : `${whole}`;
}

export { isValidSuiAddress };

/**
 * Withdraw to an external wallet (Slush, Phantom, etc.) — a plain on-chain
 * transfer, not a key export. zkLogin addresses have no exportable private
 * key (signing authority comes from a fresh ephemeral key + a ZK proof of the
 * Google login each session, not a stored key), so "send the funds" is the
 * correct — and only — way to move value to a wallet the user controls
 * directly. Works regardless of whether move/whatsvp is published.
 */
export function buildSendSuiTx(recipient: string, amountSui: string): Transaction {
  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [parseToMist(amountSui)]);
  tx.transferObjects([coin], recipient);
  return tx;
}

/** Withdraw a single owned object (e.g. a transferable cosmetic Avatar) to an external address. */
export function buildTransferObjectTx(objectId: string, recipient: string): Transaction {
  const tx = new Transaction();
  tx.transferObjects([tx.object(objectId)], recipient);
  return tx;
}
