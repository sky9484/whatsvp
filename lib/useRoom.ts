'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import type { Message, Profile } from './types';

export type RoomRef = { type: 'topic'; id: string } | { type: 'event'; id: string } | { type: 'dm'; id: string };

function roomColumn(type: RoomRef['type']): 'topic_id' | 'event_room_id' | 'dm_thread_id' {
  return type === 'topic' ? 'topic_id' : type === 'event' ? 'event_room_id' : 'dm_thread_id';
}

export function roomKey(room: RoomRef): string {
  return `${room.type}:${room.id}`;
}

type ReactionMap = Record<string, { emoji: string; profile_id: string }[]>;
type PresenceProfile = { profile_id: string; display_name: string };

/**
 * Shared messaging engine for all three chat tiers (guild topics, event
 * rooms, DMs) — load history, Realtime new-message delivery, optimistic send,
 * reactions, presence, and read-marking, in exactly one place instead of
 * three near-identical copies.
 */
interface UseRoomOptions {
  /** DM rooms only: sent messages get expires_at = now + 24h. */
  disappearing?: boolean;
}

export function useRoom(room: RoomRef | null, supabase: SupabaseClient | null, profile: Profile | null, opts: UseRoomOptions = {}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [reactions, setReactions] = useState<ReactionMap>({});
  const [online, setOnline] = useState<PresenceProfile[]>([]);
  // Snapshot of my last-read time, captured when the room opens — drives the
  // "New" divider (v4 P6). Deliberately NOT updated as I read; it holds the
  // open-time value so the divider stays put while I scroll, and markRead
  // advances the DB row separately.
  const [lastReadAt, setLastReadAt] = useState<string | null>(null);
  const profileCache = useRef<Map<string, { display_name: string; avatar_url?: string | null }>>(new Map());

  const column = room ? roomColumn(room.type) : null;

  // Load history + snapshot last-read for the unread divider.
  useEffect(() => {
    if (!supabase || !room || !column) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setLastReadAt(null);
    void supabase
      .from('room_reads')
      .select('last_read_at')
      .eq('profile_id', profile?.id ?? '')
      .eq('room_key', roomKey(room))
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setLastReadAt(data?.last_read_at ?? null);
      });
    supabase
      .from('messages')
      .select('*, profiles(display_name, avatar_url, avatar_config)')
      .eq(column, room.id)
      .order('created_at', { ascending: true })
      .limit(150)
      .then(({ data }) => {
        if (cancelled) return;
        const msgs = (data ?? []) as Message[];
        for (const m of msgs) if (m.profiles) profileCache.current.set(m.profile_id, m.profiles);
        setMessages(msgs);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, room?.type, room?.id, column]);

  // Reactions for the currently-loaded messages (not live-pushed — refetched
  // whenever the message set changes; acceptable, cheap, avoids a second
  // always-on unfiltered Realtime subscription per open room).
  useEffect(() => {
    if (!supabase || messages.length === 0) {
      setReactions({});
      return;
    }
    let cancelled = false;
    supabase
      .from('message_reactions')
      .select('message_id, emoji, profile_id')
      .in(
        'message_id',
        messages.map((m) => m.id)
      )
      .then(({ data }) => {
        if (cancelled || !data) return;
        const grouped: ReactionMap = {};
        for (const r of data as { message_id: string; emoji: string; profile_id: string }[]) {
          (grouped[r.message_id] ??= []).push({ emoji: r.emoji, profile_id: r.profile_id });
        }
        setReactions(grouped);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, messages.length, room?.type, room?.id]);

  // Realtime: new messages + presence
  useEffect(() => {
    if (!supabase || !room || !column || !profile) return;

    let channel: RealtimeChannel;
    channel = supabase
      .channel(`room:${roomKey(room)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `${column}=eq.${room.id}` },
        (payload) => {
          const msg = payload.new as Message;
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
          if (!profileCache.current.has(msg.profile_id)) {
            void supabase
              .from('profiles')
              .select('display_name, avatar_url, avatar_config')
              .eq('id', msg.profile_id)
              .maybeSingle()
              .then(({ data }) => {
                if (data) {
                  profileCache.current.set(msg.profile_id, data);
                  setMessages((p) => [...p]);
                }
              });
          }
        }
      )
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceProfile>();
        const people = Object.values(state)
          .flat()
          .map((p) => ({ profile_id: p.profile_id, display_name: p.display_name }));
        setOnline(people);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ profile_id: profile.id, display_name: profile.display_name });
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, room?.type, room?.id, column, profile?.id]);

  const send = useCallback(
    async (body: string, replyToId?: string | null) => {
      if (!supabase || !room || !profile || !body.trim()) return;
      const expiresAt = room.type === 'dm' && opts.disappearing ? new Date(Date.now() + 24 * 3600_000).toISOString() : null;
      // All three room-FK columns are always present (two explicitly null) —
      // a discriminated union with different key sets per branch trips up
      // Supabase-js's insert() typing when there's no generated Database type.
      const payload = {
        profile_id: profile.id,
        body: body.trim(),
        reply_to_id: replyToId ?? null,
        expires_at: expiresAt,
        topic_id: room.type === 'topic' ? room.id : null,
        event_room_id: room.type === 'event' ? room.id : null,
        dm_thread_id: room.type === 'dm' ? room.id : null,
      };
      const { data, error } = await supabase
        .from('messages')
        .insert(payload)
        .select('*, profiles(display_name, avatar_url, avatar_config)')
        .single();
      if (error) throw new Error(error.message);
      const msg = data as Message;
      if (msg.profiles) profileCache.current.set(msg.profile_id, msg.profiles);
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      return msg;
    },
    [supabase, room, profile, opts.disappearing]
  );

  const react = useCallback(
    async (messageId: string, emoji: string) => {
      if (!supabase || !profile) return;
      const mine = reactions[messageId]?.some((r) => r.emoji === emoji && r.profile_id === profile.id);
      if (mine) {
        await supabase
          .from('message_reactions')
          .delete()
          .eq('message_id', messageId)
          .eq('profile_id', profile.id)
          .eq('emoji', emoji);
        setReactions((prev) => ({
          ...prev,
          [messageId]: (prev[messageId] ?? []).filter((r) => !(r.emoji === emoji && r.profile_id === profile.id)),
        }));
      } else {
        await supabase.from('message_reactions').insert({ message_id: messageId, profile_id: profile.id, emoji });
        setReactions((prev) => ({ ...prev, [messageId]: [...(prev[messageId] ?? []), { emoji, profile_id: profile.id }] }));
      }
    },
    [supabase, profile, reactions]
  );

  const markRead = useCallback(async () => {
    if (!supabase || !room || !profile) return;
    await supabase
      .from('room_reads')
      .upsert(
        { profile_id: profile.id, room_key: roomKey(room), last_read_at: new Date().toISOString() },
        { onConflict: 'profile_id,room_key' }
      );
  }, [supabase, room, profile]);

  const senderName = useCallback(
    (m: Message): string => {
      if (m.profile_id === profile?.id) return 'You';
      return m.profiles?.display_name ?? profileCache.current.get(m.profile_id)?.display_name ?? 'Someone';
    },
    [profile]
  );

  return { messages, reactions, online, lastReadAt, send, react, markRead, senderName };
}
