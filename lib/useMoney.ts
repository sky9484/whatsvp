'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSuiClient, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { useAuth } from './auth';
import {
  USDC_TYPE,
  USDC_DECIMALS,
  isMoneyConfigured,
  baseUnitsToUsdc,
  usdcToBaseUnits,
  buildUsdcTransferTx,
  type UsdcCoin,
  type TransferContextKind,
} from './money';

/**
 * Client money engine (v4 P5) — USDC balance, FX, and the send flow (fetch
 * coins → build the transfer PTB → sign+execute via the Enoki wallet → post
 * the digest to /api/transfers/verify for server-side history integrity).
 * Gas is Enoki-sponsored when the coin ops are on the mainnet allowlist;
 * otherwise the user pays their own gas, same as the withdraw flow.
 */
export function useMoney() {
  const { address, token } = useAuth();
  const suiClient = useSuiClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  const [balanceBase, setBalanceBase] = useState<bigint | null>(null);
  const [usdToMyr, setUsdToMyr] = useState<number | null>(null);

  const refreshBalance = useCallback(async () => {
    if (!address || !isMoneyConfigured()) {
      setBalanceBase(null);
      return;
    }
    try {
      const res = await suiClient.getBalance({ owner: address, coinType: USDC_TYPE });
      setBalanceBase(BigInt(res.totalBalance));
    } catch {
      setBalanceBase(null);
    }
  }, [address, suiClient]);

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  useEffect(() => {
    fetch('/api/fx')
      .then((r) => r.json())
      .then((d) => setUsdToMyr(d.usd_to_myr ?? null))
      .catch(() => setUsdToMyr(null));
  }, []);

  /**
   * Execute a USDC transfer. `amount` is display USDC (e.g. "12.5"). Returns
   * the digest on success. The caller is responsible for having shown a
   * confirm screen first (§5.2 requires one always).
   */
  const send = useCallback(
    async (recipient: string, amount: string, context: { kind: TransferContextKind; id?: string }): Promise<string> => {
      if (!address) throw new Error('Log in to send.');
      if (!isMoneyConfigured()) throw new Error('Payments aren’t available yet.');
      const amountBase = usdcToBaseUnits(amount);

      // Gather the sender's USDC coins (paginated getCoins, USDC type only).
      const coins: UsdcCoin[] = [];
      let cursor: string | null | undefined = null;
      do {
        const page = await suiClient.getCoins({ owner: address, coinType: USDC_TYPE, cursor });
        for (const c of page.data) coins.push({ coinObjectId: c.coinObjectId, balance: c.balance });
        cursor = page.hasNextPage ? page.nextCursor : null;
      } while (cursor);

      const total = coins.reduce((s, c) => s + BigInt(c.balance), 0n);
      if (total < amountBase) throw new Error('Not enough in your balance — receive first.');

      const tx = buildUsdcTransferTx(coins, amountBase, recipient);
      const result = await signAndExecute({ transaction: tx });

      // Fire-and-forget server verification (writes the history row, ticks the
      // split/dues). Never blocks the transfer, which already executed.
      if (token) {
        fetch('/api/transfers/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ digest: result.digest, context_kind: context.kind, context_id: context.id }),
        }).catch(() => {});
      }
      void refreshBalance();
      return result.digest;
    },
    [address, token, suiClient, signAndExecute, refreshBalance]
  );

  return {
    configured: isMoneyConfigured(),
    balanceBase,
    balanceUsdc: balanceBase == null ? null : baseUnitsToUsdc(balanceBase),
    usdToMyr,
    decimals: USDC_DECIMALS,
    refreshBalance,
    send,
  };
}
