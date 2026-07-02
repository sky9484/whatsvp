'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/client';
import { CHECKIN } from '@/lib/copy';

type Status = 'loading' | 'need-login' | 'checking' | 'success' | 'already' | 'error';

/** QR-scan landing page — attendees land here from the organizer's rotating code. */
export default function CheckinPage() {
  return (
    <Suspense fallback={<CenterMessage><Spinner label="Loading…" /></CenterMessage>}>
      <CheckinPageInner />
    </Suspense>
  );
}

function CheckinPageInner() {
  const params = useParams<{ event_id: string }>();
  const searchParams = useSearchParams();
  const { address, token, login } = useAuth();
  const [status, setStatus] = useState<Status>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [eventTitle, setEventTitle] = useState<string | null>(null);

  const eventId = params.event_id;
  const code = searchParams.get('code') ?? '';

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    supabase
      .from('events')
      .select('title')
      .eq('id', eventId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setEventTitle(data.title);
      });
  }, [eventId]);

  useEffect(() => {
    if (!address) {
      setStatus('need-login');
      return;
    }
    if (!token) return; // session still minting
    setStatus((s) => (s === 'success' || s === 'already' ? s : 'checking'));

    let cancelled = false;
    fetch('/api/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ event_id: eventId, method: 'qr', code }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) setStatus('success');
        else if (data.already) setStatus('already');
        else {
          setErrorMsg(data.error ?? 'Check-in failed');
          setStatus('error');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setErrorMsg('Network error — try again.');
          setStatus('error');
        }
      });
    return () => {
      cancelled = true;
    };
    // Deliberately excludes `status` — only re-run when identity/target changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, token, eventId, code]);

  return (
    <CenterMessage>
      {eventTitle && <p className="text-sm text-sub mb-3">{eventTitle}</p>}

      {status === 'loading' && <Spinner label="Loading…" />}

      {status === 'need-login' && (
        <>
          <p className="text-ink/70 mb-4">{CHECKIN.loginRequired}</p>
          <button
            onClick={login}
            className="px-4 py-2 rounded-full bg-teal text-white text-sm font-medium hover:bg-teal/90"
          >
            Log in
          </button>
        </>
      )}

      {status === 'checking' && <Spinner label={CHECKIN.qrScanTitle} />}

      {(status === 'success' || status === 'already') && (
        <>
          <div className="text-4xl mb-3" aria-hidden>
            ✓
          </div>
          <p className="text-ink font-semibold mb-1">
            {status === 'already' ? CHECKIN.alreadyToast : CHECKIN.successToast}
          </p>
          <Link href="/passport" className="inline-block mt-3 text-sm text-teal hover:text-teal/70">
            View your Passport →
          </Link>
        </>
      )}

      {status === 'error' && (
        <>
          <p className="text-live font-medium mb-1">{errorMsg}</p>
          <Link href="/" className="inline-block mt-3 text-sm text-teal hover:text-teal/70">
            Back to the map
          </Link>
        </>
      )}
    </CenterMessage>
  );
}

function CenterMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-6">
      <div className="max-w-sm w-full text-center">{children}</div>
    </div>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-2 border-hairline border-t-teal rounded-full animate-spin" />
      <p className="text-sm text-sub">{label}</p>
    </div>
  );
}
