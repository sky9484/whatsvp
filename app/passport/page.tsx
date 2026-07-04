'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { formatEventTime } from '@/lib/utils';
import { PASSPORT_PAGE } from '@/lib/copy';
import type { Checkin } from '@/lib/types';
import Dock from '@/components/Dock';
import AvatarComposite from '@/components/AvatarComposite';

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
      <header className="glass sticky top-0 z-10 h-14 flex items-center px-4 gap-3">
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
              className="px-5 py-2.5 rounded-full bg-brand text-white text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              Log in
            </button>
          </div>
        ) : (
          <>
            {/* Identity hero — premium gradient panel with a glow avatar, a big
                stamp count, and a milestone progress bar (v5). */}
            <div className="relative rounded-[24px] overflow-hidden border border-hairline">
              <div className="absolute inset-0 grad-brand opacity-90" aria-hidden />
              <div className="relative p-6 text-white">
                <div className="flex items-center gap-4">
                  <span className="rounded-full ring-2 ring-white/70 glow-aqua">
                    <AvatarComposite
                      config={profile?.avatar_config}
                      externalUrl={profile?.pfp_verified_at && profile?.pfp_image_url ? profile.pfp_image_url : null}
                      plainUrl={profile?.avatar_url}
                      fallbackInitial={profile?.display_name?.[0] ?? '·'}
                      size={48}
                    />
                  </span>
                  <div className="min-w-0">
                    <p className="text-h3 font-bold truncate">{profile?.display_name ?? 'Signing in…'}</p>
                    {currentMilestone && (
                      <span className="inline-block mt-0.5 text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-white/20">
                        {currentMilestone.label}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-5 flex items-baseline gap-2">
                  <span className="text-display font-bold tabular-nums leading-none">{count}</span>
                  <span className="text-body font-medium text-white/70">{count === 1 ? 'stamp' : 'stamps'}</span>
                </div>

                {nextMilestone && (
                  <div className="mt-3">
                    <div className="h-1.5 rounded-full bg-white/20 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-white/90"
                        style={{ width: `${Math.min(100, (count / nextMilestone.count) * 100)}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-[12px] text-white/80">
                      {nextMilestone.count - count} more to {nextMilestone.label}
                    </p>
                  </div>
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
                  <div key={i} className="aspect-square rounded-full skeleton" />
                ))}
              </div>
            ) : count === 0 ? (
              <div className="text-center py-12 rounded-2xl border border-dashed border-hairline">
                <p className="text-sm text-ink/60">{PASSPORT_PAGE.emptyTitle}</p>
                <p className="text-xs text-sub mt-1">{PASSPORT_PAGE.emptyHint}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {stamps!.map((s, i) => (
                  <div key={s.id} className="text-center group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/stamp-image/${s.event_id}`}
                      alt={s.events?.title ?? 'Stamp'}
                      className={`w-full aspect-square rounded-full shadow-md transition-transform group-hover:scale-[1.03] ${i === 0 ? 'glow-aqua' : ''}`}
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

      {/* liveCount/hasUnreadChat are 0/false here — this page doesn't hold a
          live event feed or an authed chat client; those are real signals
          only on the map page (MapContainer), not faked placeholders. */}
      <Dock
        active="profile"
        liveCount={0}
        hasUnreadChat={false}
        onScenes={() => router.push('/?open=scenes')}
        onGuilds={() => router.push('/?open=guilds')}
        onMapOrb={() => router.push('/')}
        onChat={() => router.push('/?open=chat')}
        onProfile={() => router.push('/?open=settings')}
      />
    </div>
  );
}
