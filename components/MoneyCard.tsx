'use client';

import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { useAuth } from '@/lib/auth';
import { useMoney } from '@/lib/useMoney';
import { approxRM } from '@/lib/money';
import { SUI_NETWORK } from '@/lib/sui';
import SendMoney from './SendMoney';
import { MONEY } from '@/lib/copy';

/**
 * The money surface (v5 fintech pass) — a premium balance card in Settings.
 * Passes the auntie test: "Balance", "Send", "≈ RM", "@handle", never
 * wallet/token/crypto. When USDC isn't configured for the network (e.g.
 * testnet with no type set) it shows an HONEST "activates on mainnet" state
 * rather than vanishing — Send is disabled, but Receive + @handle (pure
 * identity, no money movement) still work.
 */
export default function MoneyCard() {
  const { profile, token } = useAuth();
  const { configured, balanceUsdc, usdToMyr, refreshBalance } = useMoney();

  const [showSend, setShowSend] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [handleInput, setHandleInput] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [handleError, setHandleError] = useState('');
  const [handle, setHandle] = useState<string | null>(profile?.handle ?? null);

  useEffect(() => {
    setHandle(profile?.handle ?? null);
  }, [profile?.handle]);

  useEffect(() => {
    if (showReceive && profile?.sui_address) {
      QRCode.toDataURL(profile.sui_address, { margin: 1, width: 240 }).then(setQr).catch(() => setQr(null));
    }
  }, [showReceive, profile?.sui_address]);

  const claimHandle = async () => {
    if (!token) return;
    setHandleError('');
    setClaiming(true);
    try {
      const res = await fetch('/api/handle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ handle: handleInput.trim().replace(/^@/, '') }),
      });
      const data = await res.json();
      if (!res.ok) {
        setHandleError(data.error ?? 'Could not claim that handle.');
        return;
      }
      setHandle(data.handle);
      setHandleInput('');
    } finally {
      setClaiming(false);
    }
  };

  const rm = balanceUsdc ? approxRM(balanceUsdc, usdToMyr) : null;

  return (
    <div className="rounded-2xl border border-hairline overflow-hidden">
      {/* Balance panel — money gradient wash, large number, network chip */}
      <div className="relative p-4 grad-money">
        <div className="absolute inset-0 bg-surface/85" aria-hidden />
        <div className="relative">
          <div className="flex items-center justify-between">
            <span className="text-caption font-medium text-ink/60">{MONEY.balanceLabel}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-ink/[0.06] text-ink/50">
              {SUI_NETWORK}
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-h1 font-bold text-ink tabular-nums">{balanceUsdc ?? (configured ? '0' : '—')}</span>
            <span className="text-sm font-medium text-ink/40">USDC</span>
          </div>
          <p className="text-caption text-ink/50 min-h-[1.1rem]">
            {configured ? rm ?? '≈ RM —' : 'Payments activate on mainnet — you’re on testnet.'}
          </p>

          <div className="mt-3 flex gap-2">
            <button
              onClick={() => setShowSend(true)}
              disabled={!configured}
              className="flex-1 py-2.5 rounded-xl bg-brand text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {MONEY.send}
            </button>
            <button
              onClick={() => setShowReceive((v) => !v)}
              className="flex-1 py-2.5 rounded-xl border border-hairline bg-surface/60 text-sm font-medium text-ink hover:bg-ink/5 transition-colors"
            >
              {MONEY.receive}
            </button>
          </div>
        </div>
      </div>

      <div className="p-3.5 space-y-3">
        {showReceive && profile?.sui_address && (
          <div className="flex flex-col items-center pb-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {qr && <img src={qr} alt="Receive code" className="w-44 h-44 rounded-xl border border-hairline" />}
            {handle && <p className="mt-2 text-sm font-semibold text-brand">@{handle}</p>}
            <p className="text-[11px] text-ink/40">{MONEY.receiveHint}</p>
          </div>
        )}

        {/* @handle — pure identity, works regardless of network config */}
        {handle ? (
          <div className="flex items-center justify-between">
            <span className="text-caption text-ink/50">Your handle</span>
            <span className="text-sm font-semibold text-brand">@{handle}</span>
          </div>
        ) : (
          <div>
            <p className="text-caption font-medium text-ink/60 mb-1.5">{MONEY.claimHandleTitle}</p>
            <div className="flex gap-2">
              <span className="flex items-center text-sm text-ink/40">@</span>
              <input
                value={handleInput}
                onChange={(e) => setHandleInput(e.target.value)}
                placeholder={MONEY.claimHandlePlaceholder}
                className="flex-1 px-3 py-1.5 rounded-lg border border-hairline bg-paper text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
              <button
                onClick={claimHandle}
                disabled={claiming || !handleInput.trim()}
                className="px-3 py-1.5 rounded-lg bg-ink/[0.06] text-ink text-sm font-medium hover:bg-ink/10 disabled:opacity-50"
              >
                {MONEY.claimHandleCta}
              </button>
            </div>
            {handleError ? <p className="mt-1 text-xs text-danger">{handleError}</p> : <p className="mt-1 text-[11px] text-ink/40">{MONEY.handleHint}</p>}
          </div>
        )}
      </div>

      <SendMoney isOpen={showSend} onClose={() => setShowSend(false)} onSent={() => refreshBalance()} />
    </div>
  );
}
