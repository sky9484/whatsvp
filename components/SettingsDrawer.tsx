'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useSuiClient } from '@mysten/dapp-kit';
import { useAuth } from '@/lib/auth';
import { shortenAddress, formatSui, SUI_NETWORK } from '@/lib/sui';

// viem (EVM wallet + chain defs) is only needed by this opt-in, power-user
// feature — load it on demand instead of bundling it into every page load.
const ExternalPfpLinker = dynamic(() => import('./ExternalPfpLinker'), { ssr: false });

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsDrawer({ isOpen, onClose }: SettingsDrawerProps) {
  const { address, profile, logout } = useAuth();
  const suiClient = useSuiClient();

  const [balance, setBalance] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showTopUp, setShowTopUp] = useState(false);
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
                  {profile?.display_name?.[0]?.toUpperCase() ?? 'B'}
                </span>
              )}
              <div className="min-w-0">
                <p className="font-medium text-ink truncate">
                  {profile?.display_name ?? 'Builder'}
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
            </div>

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
    </>
  );
}
