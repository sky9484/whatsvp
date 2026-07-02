'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { formatEventTime } from '@/lib/utils';
import CheckinQR from '@/components/CheckinQR';
import type { RawEvent } from '@/lib/types';

interface AttendeeRow {
  profile_id: string;
  method?: 'geofence' | 'qr';
  created_at: string;
  stamp_minted_at?: string | null;
  profiles?: { display_name: string; avatar_url?: string | null } | null;
}

interface ManageData {
  event: RawEvent;
  rsvp_count: number;
  checkin_count: number;
  rsvps: AttendeeRow[];
  checkins: AttendeeRow[];
}

export default function ManageEventPage() {
  const { slug, id } = useParams<{ slug: string; id: string }>();
  const { token, address, login } = useAuth();
  const [data, setData] = useState<ManageData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    fetch(`/api/guilds/${slug}/events/${id}/manage`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        const d = await res.json();
        if (!res.ok) {
          setError(d.error ?? 'Could not load analytics');
          return;
        }
        setData(d);
      })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false));
  }, [slug, id, token]);

  useEffect(() => {
    if (token) load();
    else setLoading(false);
  }, [token, load]);

  const exportCsv = async () => {
    if (!token) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/guilds/${slug}/events/${id}/manage?format=csv`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slug}-attendees.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-10 h-14 bg-paper/90 backdrop-blur-md border-b border-hairline flex items-center px-4 gap-3">
        <Link href="/" className="text-ink/60 hover:text-ink text-lg leading-none" aria-label="Back to map">
          ‹
        </Link>
        <h1 className="text-[17px] font-semibold text-ink truncate">{data?.event.title ?? 'Manage event'}</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 pb-16">
        {!address ? (
          <div className="text-center py-16">
            <p className="text-ink/60 mb-4">Log in to manage this event.</p>
            <button onClick={login} className="px-4 py-2 rounded-full bg-teal text-white text-sm font-medium hover:bg-teal/90">
              Log in
            </button>
          </div>
        ) : loading ? (
          <p className="text-sm text-ink/40 text-center py-16">Loading…</p>
        ) : error ? (
          <p className="text-sm text-live text-center py-16">{error}</p>
        ) : data ? (
          <div className="space-y-6">
            <p className="text-sm text-sub">{formatEventTime(data.event)}</p>

            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-hairline p-4 text-center">
                <p className="text-2xl font-semibold text-ink">{data.rsvp_count}</p>
                <p className="text-xs text-sub mt-0.5">RSVPs</p>
              </div>
              <div className="rounded-xl border border-hairline p-4 text-center">
                <p className="text-2xl font-semibold text-teal">{data.checkin_count}</p>
                <p className="text-xs text-sub mt-0.5">
                  Checked in
                  {data.rsvp_count > 0 && (
                    <span className="text-sub/70"> · {Math.round((data.checkin_count / data.rsvp_count) * 100)}%</span>
                  )}
                </p>
              </div>
            </div>

            {/* Timeline sparkline */}
            {data.checkins.length > 0 && (
              <div>
                <h2 className="text-xs font-semibold text-sub uppercase tracking-wide mb-2">Check-ins over time</h2>
                <div className="rounded-xl border border-hairline p-3">
                  <Sparkline checkins={data.checkins} event={data.event} />
                </div>
              </div>
            )}

            {/* Check-in code */}
            <div className="rounded-xl border border-hairline p-4">
              <CheckinQR eventId={id} />
            </div>

            {/* Attendee list */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-semibold text-sub uppercase tracking-wide">Attendees</h2>
                <button
                  onClick={exportCsv}
                  disabled={exporting || data.checkins.length === 0}
                  className="text-xs font-medium text-teal hover:text-teal/70 disabled:opacity-40 transition-colors"
                >
                  {exporting ? 'Exporting…' : 'Export CSV'}
                </button>
              </div>
              {data.checkins.length === 0 ? (
                <p className="text-sm text-ink/40 py-6 text-center rounded-xl border border-dashed border-hairline">
                  No check-ins yet.
                </p>
              ) : (
                <ul className="divide-y divide-hairline rounded-xl border border-hairline overflow-hidden">
                  {data.checkins.map((c) => (
                    <li key={c.profile_id} className="flex items-center gap-3 px-3.5 py-2.5">
                      <span className="w-7 h-7 rounded-full bg-teal text-paper text-xs font-semibold flex items-center justify-center flex-none">
                        {c.profiles?.display_name?.[0]?.toUpperCase() ?? '?'}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-ink truncate">{c.profiles?.display_name ?? 'Someone'}</span>
                        <span className="block text-[11px] text-sub">
                          {new Date(c.created_at).toLocaleTimeString('en-MY', {
                            hour: 'numeric',
                            minute: '2-digit',
                            timeZone: 'Asia/Kuala_Lumpur',
                          })}{' '}
                          · {c.method === 'qr' ? 'QR code' : 'Location'}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}

function Sparkline({ checkins, event }: { checkins: AttendeeRow[]; event: RawEvent }) {
  const BUCKETS = 20;
  const start = new Date(event.starts_at).getTime() - 30 * 60_000;
  const end = (event.ends_at ? new Date(event.ends_at).getTime() : new Date(event.starts_at).getTime() + 3 * 3600_000) + 30 * 60_000;
  const span = Math.max(1, end - start);

  const counts = new Array(BUCKETS).fill(0);
  for (const c of checkins) {
    const t = new Date(c.created_at).getTime();
    const idx = Math.min(BUCKETS - 1, Math.max(0, Math.floor(((t - start) / span) * BUCKETS)));
    counts[idx]++;
  }
  const max = Math.max(1, ...counts);
  const w = 300;
  const h = 56;
  const bw = w / BUCKETS;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-14" preserveAspectRatio="none">
      {counts.map((c, i) => {
        const bh = (c / max) * (h - 4);
        return <rect key={i} x={i * bw + 1} y={h - bh} width={Math.max(1, bw - 2)} height={bh} rx={1} fill="#0F6E56" />;
      })}
    </svg>
  );
}
