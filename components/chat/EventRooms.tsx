'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useAuth } from '@/lib/auth';
import { formatEventTime } from '@/lib/utils';
import { useUnreadRooms } from '@/lib/useUnread';
import type { RoomRef } from '@/lib/useRoom';
import type { EventRoom, EventPhoto, RawEvent } from '@/lib/types';
import RoomView from './RoomView';
import SceneCapture from '../SceneCapture';

interface EventRoomsProps {
  supabase: SupabaseClient | null;
  /** True when rendered stacked inside Community.tsx's "Happening now"
   * section (not full-height, no own scroll container) — false when this
   * component owns the whole chat panel (a room is open). */
  embedded?: boolean;
  /** Fires whenever a room opens/closes, so a parent stacking this alongside
   * GuildChannels (Community.tsx) knows to give it the full panel. */
  onOpenChange?: (open: boolean) => void;
}

type Phase = 'soon' | 'live' | 'read-only' | 'archived';
type RoomWithEvent = EventRoom & { events: Pick<RawEvent, 'id' | 'title' | 'starts_at' | 'ends_at' | 'venue_name'> };

function roomPhase(startsAt: string, endsAt: string | null | undefined): Phase {
  const now = Date.now();
  const start = new Date(startsAt).getTime();
  const end = endsAt ? new Date(endsAt).getTime() : start + 3 * 3600_000;
  if (now < start - 24 * 3600_000) return 'soon';
  if (now <= end) return 'live';
  if (now <= end + 48 * 3600_000) return 'read-only';
  return 'archived';
}

const PHASE_LABEL: Record<Phase, string> = {
  soon: 'Opens 24h before',
  live: '● Live',
  'read-only': 'Read-only',
  archived: 'Archived',
};

/** Tier 2 of Chat 2.0: ephemeral rooms auto-created per event, access = RSVP'd or checked in. */
export default function EventRooms({ supabase, embedded = false, onOpenChange }: EventRoomsProps) {
  const { token, profile } = useAuth();
  const [rooms, setRooms] = useState<RoomWithEvent[]>([]);
  const [active, setActive] = useState<RoomWithEvent | null>(null);
  const [photos, setPhotos] = useState<EventPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  // Scenes' camera icon (v4 P4) only appears in the composer when the
  // caller is actually checked in to this event — the room's own
  // live/read-only phase isn't the same gate.
  const [checkedIn, setCheckedIn] = useState(false);
  const [showSceneCapture, setShowSceneCapture] = useState(false);

  useEffect(() => {
    onOpenChange?.(Boolean(active));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from('event_rooms')
      .select('*, events(id, title, starts_at, ends_at, venue_name)')
      .order('created_at', { ascending: false });
    setRooms((data ?? []) as RoomWithEvent[]);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const roomRefs: RoomRef[] = rooms.map((r) => ({ type: 'event', id: r.id }));
  const unread = useUnreadRooms(roomRefs, supabase, profile?.id ?? null);

  const loadPhotos = useCallback(
    async (roomId: string) => {
      if (!supabase) return;
      const { data } = await supabase.from('event_photos').select('*').eq('event_room_id', roomId).order('created_at', { ascending: false });
      setPhotos((data ?? []) as EventPhoto[]);
    },
    [supabase]
  );

  const openRoom = (r: RoomWithEvent) => {
    setActive(r);
    void loadPhotos(r.id);
    if (supabase && profile) {
      supabase
        .from('checkins')
        .select('id')
        .eq('event_id', r.event_id)
        .eq('profile_id', profile.id)
        .maybeSingle()
        .then(({ data }) => setCheckedIn(Boolean(data)));
    } else {
      setCheckedIn(false);
    }
  };

  const uploadPhoto = async (file: File) => {
    if (!supabase || !active || !token || !profile) return;
    setUploading(true);
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${active.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('event-photos').upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw new Error(upErr.message);
      const { data: pub } = supabase.storage.from('event-photos').getPublicUrl(path);
      const { data, error } = await supabase
        .from('event_photos')
        .insert({ event_room_id: active.id, profile_id: profile.id, image_url: pub.publicUrl })
        .select()
        .single();
      if (error) throw new Error(error.message);
      setPhotos((prev) => [data as EventPhoto, ...prev]);
    } catch {
      // non-fatal — photo drops are a nice-to-have, not core to the room
    } finally {
      setUploading(false);
    }
  };

  if (active) {
    const phase = roomPhase(active.events.starts_at, active.events.ends_at);
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-hairline">
          <button onClick={() => setActive(null)} className="text-ink/50 hover:text-ink text-lg leading-none" aria-label="Back to rooms">
            ‹
          </button>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-ink truncate">{active.events.title}</h3>
            <span className="text-[11px] text-sub">{PHASE_LABEL[phase]}</span>
          </div>
        </div>

        {phase === 'archived' ? (
          <RecapStrip photos={photos} supabase={supabase} />
        ) : (
          <RoomView
            room={{ type: 'event', id: active.id }}
            supabase={supabase}
            profile={profile}
            placeholder="Message the room"
            disabled={phase !== 'live'}
            disabledHint={phase === 'soon' ? 'Opens 24h before the event' : 'Read-only now the event has ended'}
            photos={photos.slice(0, 12)}
            onUploadPhoto={phase === 'live' ? uploadPhoto : undefined}
            uploadingPhoto={uploading}
            onAddScene={checkedIn ? () => setShowSceneCapture(true) : undefined}
          />
        )}
        {showSceneCapture && (
          <SceneCapture eventId={active.event_id} onClose={() => setShowSceneCapture(false)} onCreated={() => setShowSceneCapture(false)} />
        )}
      </div>
    );
  }

  return (
    <div className={embedded ? 'p-3' : 'flex-1 overflow-y-auto p-3'}>
      {rooms.length === 0 ? (
        <p className="px-1 text-sm text-ink/40">No event rooms yet — RSVP or check in to an event to see its room here.</p>
      ) : (
        <ul className="space-y-1">
          {rooms.map((r) => {
            const phase = roomPhase(r.events.starts_at, r.events.ends_at);
            return (
              <li key={r.id}>
                <button onClick={() => openRoom(r)} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-ink/[0.05] transition-colors text-left">
                  <span
                    className={`w-2 h-2 rounded-full flex-none ${phase === 'live' ? 'bg-live' : phase === 'soon' ? 'bg-upcoming/50' : 'bg-ink/20'}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-ink truncate">{r.events.title}</span>
                      {unread.has(`event:${r.id}`) && <span className="w-1.5 h-1.5 rounded-full bg-live flex-none" />}
                    </span>
                    <span className="block text-xs text-ink/50 truncate">
                      {formatEventTime(r.events)} · {PHASE_LABEL[phase]}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function RecapStrip({ photos, supabase }: { photos: EventPhoto[]; supabase: SupabaseClient | null }) {
  const [sorted, setSorted] = useState<EventPhoto[]>(photos);

  useEffect(() => {
    if (!supabase || photos.length === 0) {
      setSorted(photos);
      return;
    }
    let cancelled = false;
    supabase
      .from('event_photo_reactions')
      .select('photo_id')
      .in('photo_id', photos.map((p) => p.id))
      .then(({ data }) => {
        if (cancelled) return;
        const counts = new Map<string, number>();
        for (const row of (data ?? []) as { photo_id: string }[]) counts.set(row.photo_id, (counts.get(row.photo_id) ?? 0) + 1);
        setSorted([...photos].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0)));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, photos]);

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <h4 className="text-xs font-semibold text-sub uppercase tracking-wide mb-3">Recap</h4>
      {sorted.length === 0 ? (
        <p className="text-sm text-ink/40 text-center py-10">No photos were dropped in this room.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {sorted.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={p.id} src={p.image_url} alt="" className="w-full aspect-square rounded-lg object-cover" />
          ))}
        </div>
      )}
    </div>
  );
}
