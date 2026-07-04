'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSuiClient, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { useAuth } from '@/lib/auth';
import { shortenAddress, formatSui, buildSendSuiTx, isValidSuiAddress, SUI_NETWORK } from '@/lib/sui';
import { getPushSubscriptionState, subscribeToPush, unsubscribeFromPush, type PushState } from '@/lib/pwa';
import { useAreaPresence } from '@/lib/usePresence';
import { MONEY } from '@/lib/copy';
import AvatarComposite from './AvatarComposite';
import AvatarBuilder from './AvatarBuilder';
import MoneyCard from './MoneyCard';

// viem (EVM wallet + chain defs) is only needed by this opt-in, power-user
// feature — load it on demand instead of bundling it into every page load.
const ExternalPfpLinker = dynamic(() => import('./ExternalPfpLinker'), { ssr: false });

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsDrawer({ isOpen, onClose }: SettingsDrawerProps) {
  const { address, profile, logout, token } = useAuth();
  const suiClient = useSuiClient();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const presence = useAreaPresence();
  const [showAvatarBuilder, setShowAvatarBuilder] = useState(false);

  const [balance, setBalance] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showTopUp, setShowTopUp] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawConfirming, setWithdrawConfirming] = useState(false);
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [withdrawError, setWithdrawError] = useState('');
  const [pushState, setPushState] = useState<PushState | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [identity, setIdentity] = useState<{
    passport: unknown;
    cosmetics: unknown[];
    configured: boolean;
  } | null>(null);

  // Read on-chain identity (Passport + cosmetics) when the drawer opens
  useEffect(() => {
    if (!isOpen || !address) return;
    let cancelled = false;
    setIdentity(null);
    fetch(`/api/avatars/list?address=${address}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setIdentity(d);
      })
      .catch(() => {
        if (!cancelled) setIdentity({ passport: null, cosmetics: [], configured: false });
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, address]);

  // Read SUI balance on-chain when the drawer opens
  useEffect(() => {
    if (!isOpen || !address) return;
    let cancelled = false;
    setBalance(null);
    suiClient
      .getBalance({ owner: address })
      .then((res) => {
        if (!cancelled) setBalance(formatSui(res.totalBalance));
      })
      .catch(() => {
        if (!cancelled) setBalance('—');
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, address, suiClient]);

  const refreshBalance = () => {
    if (!address) return;
    suiClient.getBalance({ owner: address }).then((res) => setBalance(formatSui(res.totalBalance)));
  };

  const GAS_BUFFER_SUI = 0.02;
  const setMaxWithdraw = () => {
    if (!balance) return;
    setWithdrawAmount(Math.max(0, parseFloat(balance) - GAS_BUFFER_SUI).toFixed(4));
  };

  // UI-level gates only — withdraw is a self-custodial, client-signed transfer
  // with no server relay, so there's no point in the flow where a backend can
  // block it from executing on-chain (§5.5's "caps" are enforceable for
  // sponsored/relayed transfers, not this one). This just keeps a brand-new
  // session from being an instant drain target the moment it's created, and
  // ties into the Passport identity check the same way §5.5 specifies for
  // the money system generally. When Move isn't published yet, Passport can't
  // be minted by anyone, so that half of the gate is skipped rather than
  // permanently locking a feature that predates the Move package.
  const passportOk = !identity?.configured || Boolean(identity?.passport);
  const accountAgeOk = profile ? Date.now() - new Date(profile.created_at).getTime() > 24 * 60 * 60 * 1000 : false;
  const withdrawUnlocked = accountAgeOk && passportOk;

  const reviewWithdraw = () => {
    setWithdrawError('');
    if (!isValidSuiAddress(withdrawAddress)) {
      setWithdrawError("That doesn't look like a valid Sui address.");
      return;
    }
    const amountNum = Number(withdrawAmount);
    if (!amountNum || amountNum <= 0) {
      setWithdrawError('Enter an amount greater than 0.');
      return;
    }
    setWithdrawConfirming(true);
  };

  const confirmWithdraw = () => {
    setWithdrawBusy(true);
    signAndExecute(
      { transaction: buildSendSuiTx(withdrawAddress, withdrawAmount) },
      {
        onSuccess: (result) => {
          // Best-effort server audit log (§5.2 "history integrity") — never
          // blocks or undoes the transfer, which already executed; the server
          // independently re-derives recipient + amount from the chain by
          // digest rather than trusting what we post here.
          if (token) {
            fetch('/api/withdraw/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ digest: result.digest }),
            }).catch(() => {});
          }
          setWithdrawBusy(false);
          setWithdrawConfirming(false);
          setShowWithdraw(false);
          setWithdrawAddress('');
          setWithdrawAmount('');
          refreshBalance();
        },
        onError: (e) => {
          setWithdrawBusy(false);
          setWithdrawError(e.message || MONEY.failed);
        },
      }
    );
  };

  // Read push subscription state when the drawer opens
  useEffect(() => {
    if (!isOpen) return;
    void getPushSubscriptionState().then(setPushState);
  }, [isOpen]);

  const togglePush = async () => {
    if (!token) return;
    setPushBusy(true);
    try {
      if (pushState === 'subscribed') {
        await unsubscribeFromPush(token);
        setPushState('unsubscribed');
      } else {
        const ok = await subscribeToPush(token);
        setPushState(ok ? 'subscribed' : await getPushSubscriptionState());
      }
    } finally {
      setPushBusy(false);
    }
  };

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const copyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be unavailable; ignore
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 transition-opacity duration-200
          ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
        aria-hidden
        style={{ background: 'rgba(27, 27, 24, 0.35)', backdropFilter: 'blur(2px)' }}
      />

      {/* Drawer — right side on desktop, bottom sheet on mobile */}
      <div
        role="dialog"
        aria-label="Settings"
        aria-modal="true"
        className={`fixed z-50 bg-paper shadow-2xl border-hairline transition-transform duration-[280ms]
                    [transition-timing-function:cubic-bezier(0.32,0.72,0,1)]
                    bottom-0 left-0 right-0 rounded-t-2xl border-t px-5 pt-5 pb-8
                    sm:top-0 sm:bottom-0 sm:left-auto sm:right-0 sm:w-96 sm:rounded-none sm:border-l sm:border-t-0
                    ${isOpen
                      ? 'translate-y-0 sm:translate-x-0'
                      : 'translate-y-[110%] sm:translate-y-0 sm:translate-x-full'}`}
      >
        {/* Handle (mobile) */}
        <div className="mx-auto mb-4 w-9 h-1 rounded-full bg-hairline sm:hidden" />

        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Settings</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 rounded-full bg-ink/10 flex items-center justify-center
                       text-ink/60 hover:bg-ink/20 transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        {!address ? (
          <p className="mt-6 text-sm text-ink/60">You&apos;re not logged in.</p>
        ) : (
          <div className="mt-5 space-y-5">
            {/* Identity */}
            <div className="flex items-center gap-3">
              {profile?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar_url}
                  alt=""
                  className="w-12 h-12 rounded-full object-cover"
                />
              ) : (
                <span className="w-12 h-12 rounded-full bg-teal text-paper text-lg font-semibold flex items-center justify-center">
                  {profile?.display_name?.[0]?.toUpperCase() ?? '?'}
                </span>
              )}
              <div className="min-w-0">
                <p className="font-medium text-ink truncate">
                  {profile?.display_name ?? 'Signing in…'}
                </p>
                <p className="text-xs text-ink/50">WhatsVP account</p>
              </div>
            </div>

            {/* Account (Advanced) — the ONLY place the Sui address is shown */}
            <div className="rounded-xl border border-hairline p-3.5 bg-ink/[0.02]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-ink/50 uppercase tracking-wide">
                  Your account · Advanced
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-ink/10 text-ink/50 uppercase">
                  {SUI_NETWORK}
                </span>
              </div>

              <button
                onClick={copyAddress}
                className="mt-2 w-full flex items-center justify-between gap-2 text-left group"
                title="Copy address"
              >
                <code className="text-sm text-ink font-mono">
                  {shortenAddress(address, 6)}
                </code>
                <span className="text-xs text-teal group-hover:text-teal/70">
                  {copied ? 'Copied!' : 'Copy'}
                </span>
              </button>

              <div className="mt-3 pt-3 border-t border-hairline flex items-baseline justify-between">
                <span className="text-sm text-ink/60">Balance</span>
                <span className="text-sm font-medium text-ink">
                  {balance === null ? (
                    <span className="inline-block h-4 w-12 bg-ink/10 rounded animate-pulse" />
                  ) : (
                    `${balance} SUI`
                  )}
                </span>
              </div>

              {/* Withdraw — a real on-chain transfer to any wallet you control
                  (Slush, Phantom, ...). Not a key export: your account isn't
                  secured by a private key you could hand over — this is the
                  correct way to move value out. */}
              <div className="mt-3 pt-3 border-t border-hairline">
                {!showWithdraw ? (
                  <>
                    <button
                      onClick={() => setShowWithdraw(true)}
                      disabled={!balance || balance === '0' || balance === '—' || !withdrawUnlocked}
                      className="w-full py-2 rounded-lg border border-hairline text-sm text-ink hover:bg-ink/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Withdraw to another wallet
                    </button>
                    {balance && balance !== '0' && balance !== '—' && !withdrawUnlocked && (
                      <p className="mt-1.5 text-[11px] text-ink/40 text-center">
                        {!accountAgeOk
                          ? 'Unlocks 24h after your account is created.'
                          : 'Unlocks once your Passport is set up.'}
                      </p>
                    )}
                  </>
                ) : withdrawConfirming ? (
                  <div className="space-y-2">
                    <div className="rounded-lg border border-hairline p-3 space-y-2">
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs text-ink/50">Sending</span>
                        <span className="text-sm font-semibold text-ink">{withdrawAmount} SUI</span>
                      </div>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-xs text-ink/50 shrink-0">To</span>
                        <code className="text-xs text-ink font-mono break-all text-right">{withdrawAddress}</code>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs text-ink/50">Network</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-ink/10 text-ink/50 uppercase">
                          {SUI_NETWORK}
                        </span>
                      </div>
                    </div>
                    {withdrawError && <p className="text-xs text-live">{withdrawError}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setWithdrawConfirming(false);
                          setWithdrawError('');
                        }}
                        disabled={withdrawBusy}
                        className="flex-1 py-2 rounded-lg border border-hairline text-sm text-ink hover:bg-ink/5 disabled:opacity-50"
                      >
                        Back
                      </button>
                      <button
                        onClick={confirmWithdraw}
                        disabled={withdrawBusy}
                        className="flex-1 py-2 rounded-lg bg-teal text-white text-sm font-semibold disabled:opacity-50"
                      >
                        {withdrawBusy ? 'Sending…' : 'Confirm & send'}
                      </button>
                    </div>
                    <p className="text-[11px] text-ink/40 text-center">
                      This sends real funds on {SUI_NETWORK}. Double-check the address — it can&apos;t be undone.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input
                      value={withdrawAddress}
                      onChange={(e) => setWithdrawAddress(e.target.value.trim())}
                      placeholder="Recipient Sui address (0x…)"
                      className="w-full px-3 py-2 rounded-lg border border-hairline bg-paper text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal/30"
                    />
                    <div className="flex gap-2">
                      <input
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                        placeholder="Amount"
                        inputMode="decimal"
                        className="flex-1 px-3 py-2 rounded-lg border border-hairline bg-paper text-sm focus:outline-none focus:ring-2 focus:ring-teal/30"
                      />
                      <button
                        onClick={setMaxWithdraw}
                        className="px-3 py-2 rounded-lg border border-hairline text-xs font-medium text-ink hover:bg-ink/5"
                      >
                        Max
                      </button>
                    </div>
                    {withdrawError && <p className="text-xs text-live">{withdrawError}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setShowWithdraw(false);
                          setWithdrawError('');
                        }}
                        className="flex-1 py-2 rounded-lg border border-hairline text-sm text-ink hover:bg-ink/5"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={reviewWithdraw}
                        disabled={!withdrawAddress || !withdrawAmount}
                        className="flex-1 py-2 rounded-lg bg-teal text-white text-sm font-semibold disabled:opacity-50"
                      >
                        Review
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Identity — free Passport + cosmetic avatars */}
            <div className="rounded-xl border border-hairline p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-ink">Your Passport</span>
                {identity?.passport ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal/15 text-teal font-medium uppercase">
                    Active
                  </span>
                ) : (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-ink/10 text-ink/50 font-medium uppercase">
                    Free
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-ink/50">
                {identity?.configured === false
                  ? 'Your free Passport is created automatically when you sign in — nothing to buy, nothing to set up.'
                  : identity?.passport
                  ? "Your passport to every community you're part of."
                  : 'Setting up your Passport… it’s ready shortly after you sign in.'}
              </p>

              {/* Cosmetic avatars (optional, tradable) */}
              <div className="mt-3 pt-3 border-t border-hairline">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-ink/60">Avatars</span>
                  <span className="text-[10px] text-ink/40">cosmetic only</span>
                </div>
                {identity && identity.cosmetics.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {identity.cosmetics.map((c, i) => {
                      const display = (c as { display?: { data?: Record<string, string> } })?.display?.data;
                      const img = display?.image_url;
                      return (
                        <span key={i} className="w-10 h-10 rounded-lg overflow-hidden border border-hairline bg-ink/[0.04] flex items-center justify-center">
                          {img ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={img} alt={display?.name ?? ''} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-ink/30 text-xs">◈</span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-1.5 text-xs text-ink/40">
                    No avatars yet — cosmetics are optional and never change your access.
                  </p>
                )}
              </div>

              <Link
                href="/passport"
                onClick={onClose}
                className="mt-3 pt-3 border-t border-hairline flex items-center justify-between text-sm text-teal hover:text-teal/70 transition-colors"
              >
                View full Passport
                <span aria-hidden>→</span>
              </Link>
            </div>

            {/* Your look — the free layered avatar (v4 P3), separate from the
                on-chain tradable cosmetics above */}
            <div className="rounded-xl border border-hairline p-3.5 flex items-center gap-3">
              <AvatarComposite config={profile?.avatar_config} size={48} fallbackInitial={profile?.display_name?.[0] ?? '?'} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink">Your look</p>
                <p className="text-xs text-ink/50">Free — build it in under a minute.</p>
              </div>
              <button
                onClick={() => setShowAvatarBuilder(true)}
                className="px-3 py-1.5 rounded-full border border-hairline text-xs font-medium text-ink hover:bg-ink/5 transition-colors flex-none"
              >
                Edit
              </button>
            </div>

            {/* Money — Balance / Send / @handle / Receive (v4 P5). Self-renders
                nothing until USDC is configured for the network. */}
            <MoneyCard />

            {/* Area presence (v4 P3 Level 2) — ghost by default, mutuals-only, coarse */}
            <div className="rounded-xl border border-hairline p-3.5">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={presence.enabled}
                  disabled={presence.busy || !presence.loaded}
                  onChange={(e) => presence.toggle(e.target.checked)}
                />
                <span className="flex-1">
                  <span className="block text-sm font-medium text-ink">Show my area to mutuals</span>
                  <span className="block text-xs text-ink/50">Off by default. Only mutuals see roughly which area you're in — never a precise spot, never strangers.</span>
                </span>
              </label>
              {presence.enabled && presence.nearby.length > 0 && (
                <div className="mt-3 pt-3 border-t border-hairline">
                  <p className="text-xs font-medium text-ink/60 mb-1.5">Mutuals in your area</p>
                  <div className="flex flex-wrap gap-2">
                    {presence.nearby.map((m) => (
                      <span key={m.profile_id} className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-ink/[0.05]">
                        <AvatarComposite config={m.avatar_config} size={24} fallbackInitial={m.display_name[0]} />
                        <span className="text-xs text-ink">{m.display_name}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Notifications — web-push, opt-in */}
            {pushState && pushState !== 'unsupported' && (
              <div className="rounded-xl border border-hairline p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-ink">Notifications</span>
                  {pushState === 'not-configured' ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-ink/10 text-ink/50 font-medium uppercase">Soon</span>
                  ) : (
                    <button
                      onClick={togglePush}
                      disabled={pushBusy || pushState === 'denied'}
                      className={`text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors disabled:opacity-50
                        ${pushState === 'subscribed' ? 'bg-teal/15 text-teal' : 'bg-ink/[0.06] text-ink hover:bg-ink/10'}`}
                    >
                      {pushBusy ? '…' : pushState === 'subscribed' ? 'On' : pushState === 'denied' ? 'Blocked' : 'Turn on'}
                    </button>
                  )}
                </div>
                <p className="mt-1 text-xs text-ink/50">
                  {pushState === 'denied'
                    ? 'Notifications are blocked in your browser settings.'
                    : "Get a nudge when an event you're going to is starting soon, or someone messages you."}
                </p>
              </div>
            )}

            {/* Top-up — interface only (Phase 6). Clearly non-functional. */}
            <div className="rounded-xl border border-hairline p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-ink">Top up</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-upcoming/15 text-upcoming font-medium uppercase">
                  Soon
                </span>
              </div>
              <p className="mt-1 text-xs text-ink/50">
                Add funds to your account — no extra fees, nothing else to set up.
              </p>

              {!showTopUp ? (
                <button
                  onClick={() => setShowTopUp(true)}
                  className="mt-3 w-full py-2 rounded-lg border border-hairline text-sm
                             text-ink hover:bg-ink/5 transition-colors"
                >
                  Add funds
                </button>
              ) : (
                <div className="mt-3 space-y-2">
                  <div className="flex gap-2">
                    {['10', '25', '50'].map((amt) => (
                      <button
                        key={amt}
                        className="flex-1 py-2 rounded-lg border border-hairline text-sm
                                   text-ink hover:bg-ink/5 transition-colors"
                        disabled
                      >
                        ${amt}
                      </button>
                    ))}
                  </div>
                  <button
                    disabled
                    className="w-full py-2 rounded-lg bg-ink/20 text-paper text-sm font-medium cursor-not-allowed"
                  >
                    Continue (coming soon)
                  </button>
                  <p className="text-[11px] text-ink/40 text-center">
                    Payments aren&apos;t live yet — this is a preview.
                  </p>
                </div>
              )}
            </div>

            {/* External-collection PFP — opt-in, power-user, behind the free identity */}
            <ExternalPfpLinker />

            {/* Logout */}
            <button
              onClick={() => {
                logout();
                onClose();
              }}
              className="w-full py-2.5 rounded-xl text-sm font-medium text-live
                         hover:bg-live/5 transition-colors"
            >
              Log out
            </button>
          </div>
        )}
      </div>

      <AvatarBuilder isOpen={showAvatarBuilder} onClose={() => setShowAvatarBuilder(false)} />
    </>
  );
}
