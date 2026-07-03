'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { createAuthedClient } from '@/lib/supabase/client';
import AvatarComposite from './AvatarComposite';
import { SCENES } from '@/lib/copy';
import type { Scene } from '@/lib/types';

const PHOTO_DURATION_MS = 5000;
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮'];

interface SceneViewerProps {
  scenes: Scene[];
  startIndex?: number;
  onClose: () => void;
  onFlyToVenue?: (lat: number, lng: number) => void;
  onRemoved?: (sceneId: string) => void;
}

/**
 * Full-screen Scenes viewer (v4 P4) — progress bars, tap-advance (left/right
 * half), hold-to-pause, reactions, a tappable place-chip that flies the map
 * to the venue, mute-by-default video. Rule zero (camera only unlocks at a
 * check-in) is enforced upstream in ScenesDrawer/SceneCapture — this
 * component only ever renders scenes that already exist.
 */
export default function SceneViewer({ scenes, startIndex = 0, onClose, onFlyToVenue, onRemoved }: SceneViewerProps) {
  const { token, profile } = useAuth();
  const [index, setIndex] = useState(startIndex);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [muted, setMuted] = useState(true);
  const [reported, setReported] = useState<Set<string>>(new Set());
  const videoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const elapsedRef = useRef(0);

  const scene = scenes[index];
  const authed = createAuthedClient(token);

  const advance = (dir: 1 | -1) => {
    const next = index + dir;
    if (next < 0) return;
    if (next >= scenes.length) {
      onClose();
      return;
    }
    setIndex(next);
    setProgress(0);
    elapsedRef.current = 0;
  };

  // Auto-advance timer — photos use a fixed duration, videos advance on 'ended'.
  useEffect(() => {
    if (!scene || paused) return;
    if (scene.kind === 'video') return; // driven by the <video> element's own events instead
    startedAtRef.current = performance.now() - elapsedRef.current;
    const tick = () => {
      const elapsed = performance.now() - startedAtRef.current;
      elapsedRef.current = elapsed;
      setProgress(Math.min(1, elapsed / PHOTO_DURATION_MS));
      if (elapsed >= PHOTO_DURATION_MS) {
        advance(1);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, paused, scene?.kind]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || scene?.kind !== 'video') return;
    if (paused) video.pause();
    else video.play().catch(() => {});
  }, [paused, scene?.kind, index]);

  if (!scene) return null;

  const react = async (emoji: string) => {
    if (!authed || !profile) return;
    await authed.from('scene_reactions').upsert({ scene_id: scene.id, profile_id: profile.id, emoji });
  };

  const report = async () => {
    if (!token || reported.has(scene.id)) return;
    setReported((r) => new Set(r).add(scene.id));
    await fetch('/api/scenes/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ scene_id: scene.id }),
    });
  };

  const isHost = Boolean(profile && scene.events?.host_id === profile.id);
  const removeScene = async () => {
    if (!token) return;
    await fetch('/api/scenes/moderate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ scene_id: scene.id }),
    });
    onRemoved?.(scene.id);
    advance(1);
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black flex flex-col select-none">
      {/* Progress bars */}
      <div className="flex gap-1 p-2 pt-3">
        {scenes.map((s, i) => (
          <div key={s.id} className="flex-1 h-0.5 rounded-full bg-white/25 overflow-hidden">
            <div
              className="h-full bg-white"
              style={{ width: i < index ? '100%' : i === index ? `${progress * 100}%` : '0%' }}
            />
          </div>
        ))}
      </div>

      {/* Header: who + when + close */}
      <div className="flex items-center gap-2 px-3 pb-2">
        <AvatarComposite config={scene.profiles?.avatar_config} size={24} fallbackInitial={scene.profiles?.display_name?.[0] ?? '?'} />
        <span className="text-white text-xs font-medium">{scene.profiles?.display_name ?? 'Someone'}</span>
        <span className="text-white/50 text-xs">{relativeTime(scene.created_at)}</span>
        <button onClick={onClose} aria-label="Close" className="ml-auto text-white text-2xl leading-none">
          ×
        </button>
      </div>

      {/* Media + tap zones */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {scene.kind === 'video' ? (
          <video
            ref={videoRef}
            src={scene.url}
            autoPlay
            playsInline
            muted={muted}
            onEnded={() => advance(1)}
            onClick={() => setMuted((m) => !m)}
            className="w-full h-full object-contain"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={scene.url} alt="" className="w-full h-full object-contain" />
        )}

        <button
          aria-label="Previous"
          className="absolute left-0 top-0 bottom-0 w-1/3"
          onClick={() => advance(-1)}
          onPointerDown={() => setPaused(true)}
          onPointerUp={() => setPaused(false)}
        />
        <button
          aria-label="Next"
          className="absolute right-0 top-0 bottom-0 w-1/3"
          onClick={() => advance(1)}
          onPointerDown={() => setPaused(true)}
          onPointerUp={() => setPaused(false)}
        />
      </div>

      {/* Place-chip → flies the map to the venue */}
      {scene.events?.venue_name && (
        <button
          onClick={() => scene.events && onFlyToVenue?.(scene.events.lat, scene.events.lng)}
          className="mx-3 mb-2 inline-flex items-center gap-1.5 self-start bg-white/15 backdrop-blur px-2.5 py-1 rounded-full text-white text-[11px]"
        >
          📍 {scene.events.venue_name}
        </button>
      )}

      {/* Reactions + report + host remove */}
      <div className="flex items-center gap-3 px-3 pb-4">
        <div className="flex gap-2">
          {QUICK_REACTIONS.map((e) => (
            <button key={e} onClick={() => react(e)} className="text-xl active:scale-125 transition-transform">
              {e}
            </button>
          ))}
        </div>
        <span className="ml-auto flex items-center gap-3">
          {isHost && (
            <button onClick={removeScene} className="text-white/70 text-xs font-medium hover:text-white">
              Remove
            </button>
          )}
          <button onClick={report} disabled={reported.has(scene.id)} className="text-white/50 text-xs font-medium hover:text-white disabled:opacity-40">
            {reported.has(scene.id) ? '✓ ' + SCENES.reportedToast : SCENES.reportCta}
          </button>
        </span>
      </div>
    </div>
  );
}

function relativeTime(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
