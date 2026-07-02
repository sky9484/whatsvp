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
 * Logged-out landing overlay — the map behind it IS the product, this is just
 * a one-time intro card. Shown once per browser (dismissed state persists in
 * localStorage) and never again once the visitor logs in.
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
      <div className="pointer-events-auto max-w-sm w-full bg-paper/95 backdrop-blur-md rounded-2xl shadow-xl border border-hairline p-5 text-center">
        <h1 className="text-h3 font-semibold text-ink leading-snug">{TAGLINE}</h1>
        <p className="mt-1.5 text-sm text-sub">
          {liveCount > 0 ? `${liveCount} ${liveCount === 1 ? 'spot is' : 'spots are'} live right now · ` : ''}
          {weekCount} happening this week
        </p>
        <div className="mt-4 flex gap-2">
          <button onClick={dismiss} className="flex-1 py-2 rounded-xl bg-teal text-white text-sm font-semibold hover:bg-teal/90 transition-colors">
            Explore the map
          </button>
          <Link
            href="/about"
            className="px-3.5 py-2 rounded-xl border border-hairline text-sm font-medium text-ink hover:bg-ink/5 transition-colors"
          >
            How it works
          </Link>
        </div>
      </div>
    </div>
  );
}
