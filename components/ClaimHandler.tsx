'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { REGISTER } from '@/lib/copy';

/**
 * Handles `?claim=<token>` on the /e/[slug] share page (v4 P2) — the guest-
 * registration magic link. Reads the param via window.location (same
 * one-shot-query-param pattern as MapContainer's ?open=/?event=, avoiding a
 * Suspense boundary for useSearchParams). Before login: prompts sign-in.
 * After login: POSTs the claim, merges the guest RSVP(s) into the new
 * Passport, and cleans the URL either way.
 */
export default function ClaimHandler() {
  const { address, token, login } = useAuth();
  const toast = useToast();
  const [claimToken, setClaimToken] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const submitted = useRef(false);

  useEffect(() => {
    setClaimToken(new URLSearchParams(window.location.search).get('claim'));
  }, []);

  useEffect(() => {
    if (!claimToken || !token || submitted.current) return;
    submitted.current = true;
    setClaiming(true);
    fetch('/api/register/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ claim_token: claimToken }),
    })
      .then((r) => r.json())
      .then((d) => toast.show(d.ok ? REGISTER.claimSuccess : d.error ?? 'Could not claim your spot', d.ok ? 'success' : 'error'))
      .catch(() => toast.show('Network error — try again.', 'error'))
      .finally(() => {
        setClaiming(false);
        window.history.replaceState(null, '', window.location.pathname);
      });
  }, [claimToken, token, toast]);

  if (!claimToken) return null;

  if (!address) {
    return (
      <div className="mt-4 rounded-xl border border-teal/30 bg-teal/5 p-3 text-center">
        <p className="text-sm text-ink">{REGISTER.claimTitle}</p>
        <button
          onClick={login}
          className="mt-2 px-4 py-1.5 rounded-full bg-teal text-white text-sm font-medium hover:bg-teal/90 transition-colors"
        >
          {REGISTER.claimCta}
        </button>
      </div>
    );
  }

  if (claiming) return <p className="mt-4 text-center text-sm text-ink/50">{REGISTER.claimBusy}</p>;
  return null;
}
