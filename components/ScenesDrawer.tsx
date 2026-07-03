'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import SceneViewer from './SceneViewer';
import type { Scene } from '@/lib/types';
import { SCENES } from '@/lib/copy';

interface FeedRow {
  event_id: string;
  event: { id: string; title: string; guild_id: string | null };
  latest: string;
  count: number;
}

interface ScenesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onFlyToVenue?: (lat: number, lng: number) => void;
}

const SEEN_KEY = 'whatsvp-scenes-seen';

/**
 * The Dock's Scenes destination (v4 P4) — rows of recent events with Scenes
 * (mine-guilds-first, then most-recent), unseen ring tracked client-side via
 * localStorage (a small, honest simplification — no server-side read-marker
 * table for this pass, unlike room_reads for chat).
 */
export default function ScenesDrawer({ isOpen, onClose, onFlyToVenue }: ScenesDrawerProps) {
  const { token, isAuthed } = useAuth();
  const [feed, setFeed] = useState<FeedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewerScenes, setViewerScenes] = useState<Scene[] | null>(null);
  const [seen, setSeen] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    fetch('/api/scenes', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setFeed(d.feed ?? []))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  useEffect(() => {
    try {
      setSeen(JSON.parse(localStorage.getItem(SEEN_KEY) || '{}'));
    } catch {
      setSeen({});
    }
  }, [isOpen]);

  const openEvent = async (eventId: string) => {
    if (!token) return;
    const res = await fetch(`/api/scenes?event_id=${eventId}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    setViewerScenes(data.scenes ?? []);
    const next = { ...seen, [eventId]: new Date().toISOString() };
    setSeen(next);
    localStorage.setItem(SEEN_KEY, JSON.stringify(next));
  };

  const isUnseen = (row: FeedRow) => !seen[row.event_id] || seen[row.event_id] < row.latest;

  return (
    <>
      <div
        className={`fixed inset-0 z-50 transition-opacity duration-200
          ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
        aria-hidden
        style={{ background: 'rgba(27, 27, 24, 0.35)', backdropFilter: 'blur(2px)' }}
      />
      <div
        role="dialog"
        aria-label="Scenes"
        aria-modal="true"
        className={`fixed z-50 bg-paper shadow-2xl border-hairline flex flex-col transition-transform duration-[280ms]
                    [transition-timing-function:cubic-bezier(0.32,0.72,0,1)]
                    bottom-0 left-0 right-0 h-[70vh] rounded-t-2xl border-t
                    sm:top-0 sm:bottom-0 sm:left-auto sm:right-0 sm:h-auto sm:w-[380px] sm:rounded-none sm:border-l sm:border-t-0
                    ${isOpen ? 'translate-y-0 sm:translate-x-0' : 'translate-y-[110%] sm:translate-y-0 sm:translate-x-full'}`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-hairline">
          <h2 className="text-sm font-semibold text-ink">Scenes</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 rounded-full bg-ink/10 flex items-center justify-center text-ink/60 hover:bg-ink/20 transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        {!isAuthed ? (
          <div className="flex-1 flex items-center justify-center p-6 text-center text-sm text-ink/50">Log in to see Scenes.</div>
        ) : loading ? (
          <p className="p-4 text-sm text-ink/40 text-center">Loading…</p>
        ) : feed.length === 0 ? (
          <p className="flex-1 flex items-center justify-center p-6 text-center text-sm text-ink/40">{SCENES.emptyTab}</p>
        ) : (
          <div className="flex-1 overflow-y-auto p-3 grid grid-cols-3 gap-3">
            {feed.map((row) => (
              <button key={row.event_id} onClick={() => openEvent(row.event_id)} className="flex flex-col items-center gap-1">
                <span
                  className={`w-14 h-14 rounded-full flex items-center justify-center text-lg font-semibold text-white bg-teal ${
                    isUnseen(row) ? 'ring-2 ring-teal ring-offset-2 ring-offset-paper' : 'ring-1 ring-hairline'
                  }`}
                >
                  {row.event.title[0]?.toUpperCase()}
                </span>
                <span className="text-[11px] text-ink truncate w-full text-center">{row.event.title}</span>
                <span className="text-[10px] text-ink/40">{row.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {viewerScenes && (
        <SceneViewer
          scenes={viewerScenes}
          onClose={() => setViewerScenes(null)}
          onFlyToVenue={onFlyToVenue}
          onRemoved={(id) => setViewerScenes((s) => s?.filter((x) => x.id !== id) ?? null)}
        />
      )}
    </>
  );
}
