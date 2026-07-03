import { Transaction } from '@mysten/sui/transactions';
import { SUI_NETWORK } from './sui';

/**
 * Money foundations (v4 P5) — self-custodial USDC transfers, anchored to
 * events and guilds. NOT a general wallet: no fiat ramp, no balances held by
 * WhatsVP, no yield. The UI passes the auntie test — "Send", "Balance",
 * amounts shown with "≈ RM". Everything here no-ops gracefully until the
 * network's USDC type is configured and the user has a session.
 */

// Native (Circle-issued) USDC on mainnet — verified against Circle's official
// docs (developers.circle.com/stablecoins/usdc-contract-addresses, 2026-07).
// Only mainnet is hardcoded because it's the one value I could verify; for
// testnet staging, set NEXT_PUBLIC_USDC_TYPE explicitly (I won't ship an
// unverified testnet coin address — a wrong type would silently point money
// at the wrong asset). So on the default testnet config with no env set,
// isMoneyConfigured() is false and every money surface stays hidden until an
// operator opts in — the same "gated on env" discipline as the Move features.
const MAINNET_USDC = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

export const USDC_TYPE = process.env.NEXT_PUBLIC_USDC_TYPE || (SUI_NETWORK === 'mainnet' ? MAINNET_USDC : '');

/** USDC has 6 decimals (1 USDC = 1e6 base units). */
export const USDC_DECIMALS = 6;

/** Money is only meaningful once we know which USDC type to look at. */
export function isMoneyConfigured(): boolean {
  return Boolean(USDC_TYPE);
}

/** "12.5" (display USDC) → 12500000n (base units). Throws on garbage. */
export function usdcToBaseUnits(amount: string): bigint {
  const trimmed = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new Error('Enter a valid amount.');
  const [whole, frac = ''] = trimmed.split('.');
  const fracPadded = (frac + '0'.repeat(USDC_DECIMALS)).slice(0, USDC_DECIMALS);
  return BigInt(whole) * 10n ** BigInt(USDC_DECIMALS) + BigInt(fracPadded || '0');
}

/** 12500000n (base units) → "12.5" (trimmed display USDC). */
export function baseUnitsToUsdc(base: bigint | string | number, maxFrac = 2): string {
  const b = BigInt(base);
  const whole = b / 10n ** BigInt(USDC_DECIMALS);
  const frac = b % 10n ** BigInt(USDC_DECIMALS);
  const fracStr = frac.toString().padStart(USDC_DECIMALS, '0').slice(0, maxFrac).replace(/0+$/, '');
  return fracStr ? `${whole}.${fracStr}` : `${whole}`;
}

/** "12.5" USDC + a rate → "≈ RM 51" (approximate, always labeled). */
export function approxRM(amountUsdc: string, usdToMyr: number | null): string | null {
  if (usdToMyr == null) return null;
  const n = Number(amountUsdc);
  if (!Number.isFinite(n)) return null;
  return `≈ RM ${(n * usdToMyr).toFixed(2)}`;
}

export interface UsdcCoin {
  coinObjectId: string;
  balance: string;
}

/**
 * Build the USDC-transfer PTB: merge the sender's coins into one, split the
 * exact amount, transfer it to the recipient. Coins are fetched by the caller
 * (client.getCoins filtered to USDC_TYPE) and passed in, so this stays a pure,
 * testable builder. Gas is sponsored by the Enoki wallet when the coin ops are
 * on the mainnet allowlist (per the Enoki portal config); otherwise the user
 * pays their own gas in SUI, exactly like the withdraw flow.
 */
export function buildUsdcTransferTx(coins: UsdcCoin[], amountBaseUnits: bigint, recipient: string): Transaction {
  if (coins.length === 0) throw new Error('No USDC to send.');
  const tx = new Transaction();
  const [primary, ...rest] = coins;
  const primaryRef = tx.object(primary.coinObjectId);
  if (rest.length > 0) {
    tx.mergeCoins(
      primaryRef,
      rest.map((c) => tx.object(c.coinObjectId))
    );
  }
  const [payment] = tx.splitCoins(primaryRef, [amountBaseUnits]);
  tx.transferObjects([payment], recipient);
  return tx;
}

export type TransferContextKind = 'direct' | 'split' | 'dues' | 'tip';
