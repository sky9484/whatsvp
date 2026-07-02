'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useAuth } from '@/lib/auth';
import { useUnreadRooms } from '@/lib/useUnread';
import type { RoomRef } from '@/lib/useRoom';
import type { Friendship, DmThread } from '@/lib/types';
import RoomView from './RoomView';

interface DirectMessagesProps {
  supabase: SupabaseClient | null;
}

type FriendRow = Friendship & { other: { id: string; display_name: string; avatar_url?: string | null } | null };
type ThreadRow = DmThread & { other: { id: string; display_name: string; avatar_url?: string | null } | null };

/** Tier 3 of Chat 2.0: friend requests + DMs between mutuals, with an optional disappearing mode. */
export default function DirectMessages({ supabase }: DirectMessagesProps) {
  const { token, profile } = useAuth();
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [active, setActive] = useState<ThreadRow | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!supabase || !profile) return;
    const { data: fRows } = await supabase
      .from('friendships')
      .select('*, requester:profiles!requester_id(id, display_name, avatar_url), addressee:profiles!addressee_id(id, display_name, avatar_url)')
      .or(`requester_id.eq.${profile.id},addressee_id.eq.${profile.id}`);
    const mapped: FriendRow[] = (fRows ?? []).map((f: Friendship & { requester: FriendRow['other']; addressee: FriendRow['other'] }) => ({
      ...f,
      other: f.requester_id === profile.id ? f.addressee : f.requester,
    }));
    setFriends(mapped);

    const { data: tRows } = await supabase
      .from('dm_threads')
      .select('*')
      .or(`profile_a_id.eq.${profile.id},profile_b_id.eq.${profile.id}`)
      .order('created_at', { ascending: false });
    const otherIds = (tRows ?? []).map((t) => (t.profile_a_id === profile.id ? t.profile_b_id : t.profile_a_id));
    const { data: others } = otherIds.length
      ? await supabase.from('profiles').select('id, display_name, avatar_url').in('id', otherIds)
      : { data: [] };
    const otherMap = new Map((others ?? []).map((p) => [p.id, p]));
    setThreads(
      (tRows ?? []).map((t) => ({
        ...(t as DmThread),
        other: otherMap.get(t.profile_a_id === profile.id ? t.profile_b_id : t.profile_a_id) ?? null,
      }))
    );
  }, [supabase, profile]);

  useEffect(() => {
    void load();
  }, [load]);

  const threadRooms: RoomRef[] = threads.map((t) => ({ type: 'dm', id: t.id }));
  const unread = useUnreadRooms(threadRooms, supabase, profile?.id ?? null);

  const respond = async (f: FriendRow, status: 'accepted' | 'blocked') => {
    if (!supabase) return;
    await supabase
      .from('friendships')
      .update({ status, responded_at: new Date().toISOString() })
      .eq('requester_id', f.requester_id)
      .eq('addressee_id', f.addressee_id);
    await load();
  };

  const startThread = async (friendProfileId: string) => {
    setError('');
    const res = await fetch('/api/dm/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ friend_profile_id: friendProfileId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? 'Could not start conversation');
      return;
    }
    await load();
    const other = friends.find((f) => f.other?.id === friendProfileId)?.other ?? null;
    setActive({ ...(data.thread as DmThread), other });
  };

  const toggleDisappearing = async () => {
    if (!supabase || !active) return;
    const next = !active.disappearing;
    await supabase.from('dm_threads').update({ disappearing: next }).eq('id', active.id);
    setActive({ ...active, disappearing: next });
  };

  if (active) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-hairline">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={() => setActive(null)} className="text-ink/50 hover:text-ink text-lg leading-none" aria-label="Back to messages">
              ‹
            </button>
            <h3 className="text-sm font-semibold text-ink truncate">{active.other?.display_name ?? 'Someone'}</h3>
          </div>
          <button
            onClick={toggleDisappearing}
            className={`text-[11px] px-2 py-1 rounded-full font-medium transition-colors ${active.disappearing ? 'bg-teal/15 text-teal' : 'bg-ink/[0.06] text-ink/50'}`}
            title="Messages disappear 24h after being sent"
          >
            {active.disappearing ? '⏱ Disappearing on' : '⏱ Disappearing off'}
          </button>
        </div>
        <RoomView
          room={{ type: 'dm', id: active.id }}
          supabase={supabase}
          profile={profile}
          placeholder={`Message ${active.other?.display_name ?? ''}`}
          disappearing={active.disappearing}
          onSent={(body) => {
            // Best-effort — a closed tab before this fires just means no push,
            // the message itself is already saved either way.
            if (!active.other) return;
            void fetch('/api/push/notify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                recipient_profile_id: active.other.id,
                title: profile?.display_name ?? 'New message',
                body: body.slice(0, 120),
                url: '/',
              }),
            }).catch(() => {});
          }}
        />
      </div>
    );
  }

  const pendingIncoming = friends.filter((f) => f.status === 'pending' && f.addressee_id === profile?.id);
  const mutuals = friends.filter((f) => f.status === 'accepted');

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-4">
      {error && <p className="text-xs text-live px-1">{error}</p>}

      {pendingIncoming.length > 0 && (
        <section>
          <h3 className="px-1 mb-1.5 text-xs font-semibold text-ink/50 uppercase tracking-wide">Requests</h3>
          <ul className="space-y-1">
            {pendingIncoming.map((f) => (
              <li key={`${f.requester_id}:${f.addressee_id}`} className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-ink/[0.03]">
                <span className="w-8 h-8 rounded-full bg-teal text-paper text-sm font-semibold flex items-center justify-center flex-none">
                  {f.other?.display_name?.[0]?.toUpperCase() ?? '?'}
                </span>
                <span className="flex-1 min-w-0 text-sm font-medium text-ink truncate">{f.other?.display_name ?? 'Someone'}</span>
                <button onClick={() => respond(f, 'accepted')} className="px-2.5 py-1 rounded-full bg-teal text-white text-xs font-medium">
                  Accept
                </button>
                <button onClick={() => respond(f, 'blocked')} className="px-2 py-1 rounded-full text-ink/40 text-xs">
                  Decline
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="px-1 mb-1.5 text-xs font-semibold text-ink/50 uppercase tracking-wide">Messages</h3>
        {threads.length === 0 ? (
          <p className="px-1 text-sm text-ink/40">No conversations yet.</p>
        ) : (
          <ul className="space-y-1">
            {threads.map((t) => (
              <li key={t.id}>
                <button onClick={() => setActive(t)} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-ink/[0.05] transition-colors text-left">
                  <span className="w-9 h-9 rounded-full bg-teal text-paper text-sm font-semibold flex items-center justify-center flex-none">
                    {t.other?.display_name?.[0]?.toUpperCase() ?? '?'}
                  </span>
                  <span className="flex-1 min-w-0 flex items-center gap-1.5">
                    <span className="text-sm font-medium text-ink truncate">{t.other?.display_name ?? 'Someone'}</span>
                    {unread.has(`dm:${t.id}`) && <span className="w-1.5 h-1.5 rounded-full bg-live flex-none" />}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {mutuals.filter((f) => !threads.some((t) => t.other?.id === f.other?.id)).length > 0 && (
        <section>
          <h3 className="px-1 mb-1.5 text-xs font-semibold text-ink/50 uppercase tracking-wide">Mutuals</h3>
          <ul className="space-y-1">
            {mutuals
              .filter((f) => !threads.some((t) => t.other?.id === f.other?.id))
              .map((f) => (
                <li key={`${f.requester_id}:${f.addressee_id}`}>
                  <button
                    onClick={() => f.other && startThread(f.other.id)}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-ink/[0.05] transition-colors text-left"
                  >
                    <span className="w-8 h-8 rounded-full bg-ink/10 text-ink text-sm font-semibold flex items-center justify-center flex-none">
                      {f.other?.display_name?.[0]?.toUpperCase() ?? '?'}
                    </span>
                    <span className="flex-1 min-w-0 text-sm font-medium text-ink truncate">{f.other?.display_name ?? 'Someone'}</span>
                    <span className="text-xs text-teal">Message</span>
                  </button>
                </li>
              ))}
          </ul>
        </section>
      )}

      {friends.length === 0 && (
        <p className="px-1 text-xs text-ink/40">
          Add friends from a guild roster or an event&apos;s attendee list to start messaging mutuals here.
        </p>
      )}
    </div>
  );
}
