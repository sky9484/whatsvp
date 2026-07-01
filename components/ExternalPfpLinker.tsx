'use client';

import { useState } from 'react';
import { createWalletClient, custom } from 'viem';
import { mainnet } from 'viem/chains';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { buildSiweMessage } from '@/lib/siwe';
import { ALLOWED_COLLECTIONS } from '@/lib/externalCollections';

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

function getInjectedProvider(): EthereumProvider | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { ethereum?: EthereumProvider }).ethereum ?? null;
}

/**
 * Opt-in, power-user-only external-collection PFP linker (v2 Upgrade 4).
 * Lives collapsed inside Settings, well behind the free Sui Builder ID — a
 * mainstream user never needs to open this. Links an EVM wallet via a signed
 * message (no funds move, no bridge) and verifies NFT ownership server-side,
 * read-only, before the image can be used as an avatar.
 */
export default function ExternalPfpLinker() {
  const { address, token } = useAuth();
  const toast = useToast();

  const [expanded, setExpanded] = useState(false);
  const [collectionIdx, setCollectionIdx] = useState(0);
  const [tokenId, setTokenId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const collection = ALLOWED_COLLECTIONS[collectionIdx];

  const link = async () => {
    if (!address || !token) return;
    const provider = getInjectedProvider();
    if (!provider) {
      setError('No EVM wallet found — install MetaMask or another browser wallet.');
      return;
    }
    if (!tokenId.trim()) {
      setError('Enter the token # you own in that collection.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const client = createWalletClient({ chain: mainnet, transport: custom(provider) });
      const [evmAddress] = await client.requestAddresses();

      const message = buildSiweMessage(evmAddress, address, Date.now());
      const signature = await client.signMessage({ account: evmAddress, message });

      const res = await fetch('/api/pfp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          message,
          signature,
          token_id: tokenId.trim(),
          chain: collection.chain,
          contract: collection.contract,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Verification failed');
        return;
      }
      toast.show(`Verified! Using your ${collection.name} #${tokenId} as PFP.`, 'success');
      setExpanded(false);
      setTokenId('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Wallet interaction was cancelled or failed');
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    if (!token) return;
    setBusy(true);
    try {
      await fetch('/api/pfp/verify', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      toast.show('External PFP removed', 'success');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-hairline border-dashed p-3.5">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between text-left"
      >
        <span>
          <span className="text-sm font-medium text-ink">External collection PFP</span>
          <span className="block text-[11px] text-ink/40 mt-0.5">Optional · power users · read-only wallet check</span>
        </span>
        <span className="text-ink/40 text-xs">{expanded ? '−' : '+'}</span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-ink/50">
            Prove you own an NFT from an allowlisted collection and use it as your PFP. This links
            an EVM wallet by signature only — no funds move, nothing is bridged, and your WhatsVP
            account stays your Sui Builder ID.
          </p>

          <select
            value={collectionIdx}
            onChange={(e) => setCollectionIdx(Number(e.target.value))}
            className="w-full px-3 py-2 rounded-lg border border-hairline bg-paper text-sm"
          >
            {ALLOWED_COLLECTIONS.map((c, i) => (
              <option key={c.contract} value={i}>
                {c.name} ({c.chain})
              </option>
            ))}
          </select>

          <input
            value={tokenId}
            onChange={(e) => setTokenId(e.target.value.replace(/\D/g, ''))}
            placeholder="Token #"
            inputMode="numeric"
            className="w-full px-3 py-2 rounded-lg border border-hairline bg-paper text-sm"
          />

          {error && <p className="text-xs text-live">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={link}
              disabled={busy || !tokenId.trim()}
              className="flex-1 py-2 rounded-lg bg-ink text-paper text-sm font-medium disabled:opacity-50"
            >
              {busy ? 'Verifying…' : 'Link + verify'}
            </button>
            <button
              onClick={unlink}
              disabled={busy}
              className="px-3 py-2 rounded-lg border border-hairline text-ink/60 text-sm disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
