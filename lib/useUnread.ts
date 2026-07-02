'use client';

import { useState, useEffect } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { type RoomRef, roomKey } from './useRoom';

function roomColumn(type: RoomRef['type']): 'topic_id' | 'event_room_id' | 'dm_thread_id' {
  return type === 'topic' ? 'topic_id' : type === 'event' ? 'event_room_id' : 'dm_thread_id';
}

/**
 * Which of the given rooms have a message newer than my last read — a simple
 * has-unread flag (not a precise count), refreshed whenever the room list
 * changes (e.g. the drawer opens). Not live-pushed, same deliberate
 * simplification as reactions in lib/useRoom.ts.
 */
export function useUnreadRooms(rooms: RoomRef[], supabase: SupabaseClient | null, profileId: string | null) {
  const [unread, setUnread] = useState<Set<string>>(new Set());
  const roomsKey = JSON.stringify(rooms);

  useEffect(() => {
    if (!supabase || !profileId || rooms.length === 0) {
      setUnread(new Set());
      return;
    }
    let cancelled = false;

    (async () => {
      const byType: Record<RoomRef['type'], string[]> = { topic: [], event: [], dm: [] };
      for (const r of rooms) byType[r.type].push(r.id);

      const types: RoomRef['type'][] = ['topic', 'event', 'dm'];
      const [{ data: reads }, ...msgResults] = await Promise.all([
        supabase.from('room_reads').select('room_key, last_read_at').eq('profile_id', profileId),
        ...types.map((type) =>
          byType[type].length
            ? supabase.from('messages').select(`${roomColumn(type)}, created_at`).in(roomColumn(type), byType[type])
            : Promise.resolve({ data: [] as Record<string, string>[] })
        ),
      ]);
      if (cancelled) return;

      const lastRead = new Map((reads ?? []).map((r) => [r.room_key, r.last_read_at]));
      const latest = new Map<string, string>();

      types.forEach((type, i) => {
        const col = roomColumn(type);
        const rows = (msgResults[i]?.data ?? []) as Record<string, string>[];
        for (const row of rows) {
          const id = row[col];
          if (!id) continue;
          const key = `${type}:${id}`;
          const cur = latest.get(key);
          if (!cur || row.created_at > cur) latest.set(key, row.created_at);
        }
      });

      const next = new Set<string>();
      for (const r of rooms) {
        const key = roomKey(r);
        const lastMsg = latest.get(key);
        if (!lastMsg) continue;
        const read = lastRead.get(key);
        if (!read || lastMsg > read) next.add(key);
      }
      setUnread(next);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, profileId, roomsKey]);

  return unread;
}
