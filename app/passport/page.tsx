'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { formatEventTime } from '@/lib/utils';
import { PASSPORT_PAGE } from '@/lib/copy';
import type { Checkin } from '@/lib/types';
import TabBar from '@/components/TabBar';

export default function PassportPage() {
  const { token, profile, address, login } = useAuth();
  const router = useRouter();
  const [stamps, setStamps] = useState<Checkin[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch('/api/passport', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setStamps(d.stamps ?? []))
      .catch(() => setStamps([]))
      .finally(() => setLoading(false));
  }, [token]);

  const count = stamps?.length ?? 0;
  const nextMilestone = PASSPORT_PAGE.milestones.find((m) => m.count > count);
  const currentMilestone = [...PASSPORT_PAGE.milestones].reverse().find((m) => m.count <= count);

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-10 h-14 bg-paper/90 backdrop-blur-md border-b border-hairline flex items-center px-4 gap-3">
        <Link href="/" className="text-ink/60 hover:text-ink text-lg leading-none" aria-label="Back to map">
          ‹
        </Link>
        <h1 className="text-[17px] font-semibold text-ink">{PASSPORT_PAGE.title}</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 pb-24">
        {!address ? (
          <div className="text-center py-16">
            <p className="text-ink/60 mb-4">{PASSPORT_PAGE.loginPrompt}</p>
            <button
              onClick={login}
              className="px-4 py-2 rounded-full bg-teal text-white text-sm font-medium hover:bg-teal/90"
            >
              Log in
            </button>
          </div>
        ) : (
          <>
            {/* Identity card */}
            <div className="rounded-2xl border border-hairline bg-surface p-5 flex items-center gap-4">
              <span className="w-14 h-14 rounded-full bg-teal text-paper text-xl font-bold flex items-center justify-center flex-none overflow-hidden">
                {profile?.pfp_verified_at && profile?.pfp_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.pfp_image_url} alt="" className="w-full h-full object-cover" />
                ) : profile?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  profile?.display_name?.[0]?.toUpperCase() ?? '·'
                )}
              </span>
              <div className="min-w-0">
                <p className="text-[17px] font-semibold text-ink truncate">{profile?.display_name ?? 'Signing in…'}</p>
                <p className="text-sm text-sub">
                  {count} {count === 1 ? 'stamp' : 'stamps'}
                  {currentMilestone && <span className="text-teal"> · {currentMilestone.label}</span>}
                </p>
                {nextMilestone && (
                  <p className="text-xs text-sub/80 mt-0.5">
                    {nextMilestone.count - count} more to {nextMilestone.label}
                  </p>
                )}
              </div>
            </div>

            {/* Stamps grid */}
            <h2 className="mt-8 mb-3 text-xs font-semibold text-sub uppercase tracking-wide">
              {PASSPORT_PAGE.stampsHeading}
            </h2>
            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="aspect-square rounded-full bg-ink/5 animate-pulse" />
                ))}
              </div>
            ) : count === 0 ? (
              <div className="text-center py-12 rounded-2xl border border-dashed border-hairline">
                <p className="text-sm text-ink/60">{PASSPORT_PAGE.emptyTitle}</p>
                <p className="text-xs text-sub mt-1">{PASSPORT_PAGE.emptyHint}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {stamps!.map((s) => (
                  <div key={s.id} className="text-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/stamp-image/${s.event_id}`}
                      alt={s.events?.title ?? 'Stamp'}
                      className="w-full aspect-square rounded-full shadow-md"
                    />
                    <p className="mt-2 text-[13px] font-medium text-ink truncate">{s.events?.title}</p>
                    <p className="text-[11px] text-sub">{s.events ? formatEventTime(s.events) : ''}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <TabBar
        active="passport"
        onMap={() => router.push('/')}
        onGuilds={() => router.push('/?open=guilds')}
        onChat={() => router.push('/?open=chat')}
        onPassport={() => {}}
      />
    </div>
  );
}
