'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { TAGLINE } from '@/lib/copy';

const DISMISSED_KEY = 'whatsvp-hero-dismissed';

interface HeroOverlayProps {
  liveCount: number;
  weekCount: number;
}

/**
 * Logged-out landing overlay (v5 premium pass) — the live map behind it IS the
 * product; this is a one-time intro that states the positioning ("Luma shows
 * events. WhatsVP shows the living city.") and the live pulse. Shown once per
 * browser, never again once the visitor logs in.
 */
export default function HeroOverlay({ liveCount, weekCount }: HeroOverlayProps) {
  const [dismissed, setDismissed] = useState(true); // default true avoids a flash before we can read localStorage

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISSED_KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      /* storage may be unavailable */
    }
  };

  if (dismissed) return null;

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center px-4 pt-36 pb-24 pointer-events-none md:pt-20">
      <div className="pointer-events-auto max-w-sm w-full glass rounded-[24px] shadow-2xl overflow-hidden">
        {/* Gradient accent bar — the brand's aqua→teal signature */}
        <div className="h-1.5 grad-brand" aria-hidden />

        <div className="p-6">
          <div className="flex items-center justify-between">
            <span className="font-bold text-callout text-ink tracking-tight">
              Whats<span className="text-grad-brand">VP</span>
            </span>
            {liveCount > 0 && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-live">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-live opacity-70 animate-ping" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-live" />
                </span>
                {liveCount} live now
              </span>
            )}
          </div>

          <h1 className="mt-4 text-h1 font-bold text-ink leading-[1.1]">{TAGLINE}</h1>
          <p className="mt-2 text-body text-sub">Luma shows events. WhatsVP shows the living city — who&apos;s out, what&apos;s alive, and where your people are.</p>

          {/* Stat row */}
          <div className="mt-4 flex gap-2">
            <div className="flex-1 rounded-xl bg-ink/[0.04] px-3 py-2">
              <p className="text-h3 font-bold text-ink tabular-nums leading-none">{liveCount}</p>
              <p className="text-[11px] text-ink/50 mt-1">live now</p>
            </div>
            <div className="flex-1 rounded-xl bg-ink/[0.04] px-3 py-2">
              <p className="text-h3 font-bold text-ink tabular-nums leading-none">{weekCount}</p>
              <p className="text-[11px] text-ink/50 mt-1">this week</p>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={dismiss}
              className="flex-1 py-2.5 rounded-xl bg-brand text-white text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              Explore the map
            </button>
            <Link
              href="/about"
              className="px-3.5 py-2.5 rounded-xl border border-hairline text-sm font-medium text-ink hover:bg-ink/5 transition-colors"
            >
              How it works
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
