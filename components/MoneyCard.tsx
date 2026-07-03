'use client';

import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { useAuth } from '@/lib/auth';
import { useMoney } from '@/lib/useMoney';
import { approxRM } from '@/lib/money';
import SendMoney from './SendMoney';
import { MONEY } from '@/lib/copy';

/**
 * The money surface (v4 P5) — lives in Settings (passes the auntie test:
 * "Balance", "Send", "≈ RM", "@handle", never wallet/token/crypto). Balance +
 * Send + a claimable @handle + a Receive QR (encodes the address, so a payer's
 * app can fill it in). No dedicated "wallet screen" — money stays anchored to
 * Settings/events/guilds per the scope law. No-ops cleanly until USDC is
 * configured for the network.
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
      QRCode.toDataURL(profile.sui_address, { margin: 1, width: 220 }).then(setQr).catch(() => setQr(null));
    }
  }, [showReceive, profile?.sui_address]);

  if (!configured) return null;

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
    <div className="rounded-xl border border-hairline p-3.5">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-ink">{MONEY.balanceLabel}</span>
        <span className="text-right">
          <span className="text-sm font-semibold text-ink">{balanceUsdc == null ? '—' : `${balanceUsdc} USDC`}</span>
          {rm && <span className="block text-[11px] text-ink/50">{rm}</span>}
        </span>
      </div>

      <div className="mt-3 flex gap-2">
        <button onClick={() => setShowSend(true)} className="flex-1 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal/90">{MONEY.send}</button>
        <button onClick={() => setShowReceive((v) => !v)} className="flex-1 py-2 rounded-lg border border-hairline text-sm font-medium text-ink hover:bg-ink/5">{MONEY.receive}</button>
      </div>

      {showReceive && profile?.sui_address && (
        <div className="mt-3 pt-3 border-t border-hairline flex flex-col items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {qr && <img src={qr} alt="Receive code" className="w-40 h-40 rounded-lg" />}
          {handle && <p className="mt-2 text-sm font-medium text-teal">@{handle}</p>}
          <p className="text-[11px] text-ink/40">{MONEY.receiveHint}</p>
        </div>
      )}

      {/* @handle claim */}
      <div className="mt-3 pt-3 border-t border-hairline">
        {handle ? (
          <p className="text-xs text-ink/60">Your handle: <span className="font-medium text-teal">@{handle}</span></p>
        ) : (
          <div>
            <p className="text-xs font-medium text-ink/60 mb-1.5">{MONEY.claimHandleTitle}</p>
            <div className="flex gap-2">
              <span className="flex items-center text-sm text-ink/40">@</span>
              <input
                value={handleInput}
                onChange={(e) => setHandleInput(e.target.value)}
                placeholder={MONEY.claimHandlePlaceholder}
                className="flex-1 px-3 py-1.5 rounded-lg border border-hairline bg-paper text-sm focus:outline-none focus:ring-2 focus:ring-teal/30"
              />
              <button onClick={claimHandle} disabled={claiming || !handleInput.trim()} className="px-3 py-1.5 rounded-lg bg-ink/[0.06] text-ink text-sm font-medium hover:bg-ink/10 disabled:opacity-50">
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
