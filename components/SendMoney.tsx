'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { useMoney } from '@/lib/useMoney';
import { approxRM, type TransferContextKind } from '@/lib/money';
import AvatarComposite from './AvatarComposite';
import { MONEY } from '@/lib/copy';
import type { AvatarConfig } from '@/lib/types';

interface Recipient {
  profile_id?: string;
  display_name: string;
  handle?: string;
  avatar_config?: AvatarConfig | null;
  address: string;
}

interface SendMoneyProps {
  isOpen: boolean;
  onClose: () => void;
  /** Prefilled, locked recipient (split pay, dues, tip) — hides the @handle lookup. */
  fixedRecipient?: Recipient;
  fixedAmount?: string;
  context?: { kind: TransferContextKind; id?: string };
  onSent?: (digest: string) => void;
}

/**
 * The always-shown confirm screen for any send (§5.2). Two entry shapes: a
 * free @handle lookup (Settings "Send"), or a locked recipient+amount passed
 * in (split pay / dues / tip). No free-text address entry anywhere here — that
 * stays in Settings → Advanced (the withdraw flow), to cut fat-finger + phishing.
 */
export default function SendMoney({ isOpen, onClose, fixedRecipient, fixedAmount, context, onSent }: SendMoneyProps) {
  const { token } = useAuth();
  const { balanceUsdc, usdToMyr, send } = useMoney();

  const [handle, setHandle] = useState('');
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setError('');
      setBusy(false);
      if (fixedRecipient) {
        setRecipient(fixedRecipient);
        setAmount(fixedAmount ?? '');
        setStep('confirm');
      } else {
        setRecipient(null);
        setHandle('');
        setAmount('');
        setStep('enter');
      }
    }
  }, [isOpen, fixedRecipient, fixedAmount]);

  if (!isOpen) return null;

  const lookup = async () => {
    setError('');
    const h = handle.trim().replace(/^@/, '');
    if (!h) return;
    try {
      const res = await fetch(`/api/handle?handle=${encodeURIComponent(h)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? MONEY.noHandle);
        return;
      }
      setRecipient({ profile_id: data.profile_id, display_name: data.display_name, handle: data.handle, avatar_config: data.avatar_config, address: data.address });
    } catch {
      setError('Network error — try again.');
    }
  };

  const proceed = () => {
    setError('');
    if (!recipient) {
      setError('Choose who to send to.');
      return;
    }
    if (!amount || Number(amount) <= 0) {
      setError('Enter an amount.');
      return;
    }
    setStep('confirm');
  };

  const confirm = async () => {
    if (!recipient || !token) return;
    setBusy(true);
    setError('');
    try {
      const digest = await send(recipient.address, amount, context ?? { kind: 'direct' });
      onSent?.(digest);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send.');
      setBusy(false);
    }
  };

  const rm = approxRM(amount, usdToMyr);

  return (
    <>
      <div className="fixed inset-0 z-[75] bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={MONEY.sendTitle}
        className="fixed z-[76] bg-paper shadow-2xl flex flex-col
                   inset-x-0 bottom-0 rounded-t-[20px] pb-[env(safe-area-inset-bottom)]
                   sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-[420px] sm:rounded-[20px]"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-hairline">
          <h2 className="text-sm font-semibold text-ink">{MONEY.sendTitle}</h2>
          <button onClick={onClose} aria-label="Close" className="w-7 h-7 rounded-full bg-ink/10 flex items-center justify-center text-ink/60 hover:bg-ink/20 text-lg leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          {step === 'enter' ? (
            <>
              {!recipient ? (
                <div className="flex gap-2">
                  <input
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && lookup()}
                    placeholder={MONEY.toPlaceholder}
                    className="flex-1 px-3 py-2 rounded-lg border border-hairline bg-paper text-sm focus:outline-none focus:ring-2 focus:ring-teal/30"
                  />
                  <button onClick={lookup} className="px-3.5 py-2 rounded-lg bg-teal text-white text-sm font-medium">Find</button>
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-xl border border-hairline p-3">
                  <AvatarComposite config={recipient.avatar_config} size={32} fallbackInitial={recipient.display_name[0]} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink truncate">{recipient.display_name}</p>
                    {recipient.handle && <p className="text-xs text-ink/50">@{recipient.handle}</p>}
                  </div>
                  <button onClick={() => setRecipient(null)} className="text-xs text-ink/40 hover:text-ink">Change</button>
                </div>
              )}

              <div>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder={MONEY.amountPlaceholder}
                  className="w-full px-3 py-2 rounded-lg border border-hairline bg-paper text-sm focus:outline-none focus:ring-2 focus:ring-teal/30"
                />
                {rm && <p className="mt-1 text-xs text-ink/50">{rm}</p>}
                {balanceUsdc != null && <p className="mt-1 text-[11px] text-ink/40">{MONEY.balanceLabel}: {balanceUsdc} USDC</p>}
              </div>

              {error && <p className="text-sm text-danger">{error}</p>}
              <button onClick={proceed} disabled={!recipient || !amount} className="w-full py-2.5 rounded-xl bg-teal text-white text-sm font-semibold disabled:opacity-50">{MONEY.review}</button>
            </>
          ) : (
            <>
              <div className="rounded-xl border border-hairline p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <AvatarComposite config={recipient?.avatar_config} size={32} fallbackInitial={recipient?.display_name?.[0] ?? '?'} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{recipient?.display_name}</p>
                    {recipient?.handle && <p className="text-xs text-ink/50">@{recipient.handle}</p>}
                  </div>
                </div>
                <div className="flex items-baseline justify-between pt-2 border-t border-hairline">
                  <span className="text-xs text-ink/50">Amount</span>
                  <span className="text-lg font-semibold text-ink">{amount} USDC</span>
                </div>
                {rm && <p className="text-right text-xs text-ink/50">{rm}</p>}
              </div>
              {error && <p className="text-sm text-danger">{error}</p>}
              <div className="flex gap-2">
                {!fixedRecipient && (
                  <button onClick={() => setStep('enter')} disabled={busy} className="flex-1 py-2.5 rounded-xl border border-hairline text-sm text-ink hover:bg-ink/5 disabled:opacity-50">Back</button>
                )}
                <button onClick={confirm} disabled={busy} className="flex-1 py-2.5 rounded-xl bg-teal text-white text-sm font-semibold disabled:opacity-50">
                  {busy ? MONEY.sending : MONEY.confirmSend}
                </button>
              </div>
              <p className="text-[11px] text-ink/40 text-center">This sends real money. Double-check who you&apos;re paying.</p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
