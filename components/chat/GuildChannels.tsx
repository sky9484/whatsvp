'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useAuth } from '@/lib/auth';
import { useUnreadRooms } from '@/lib/useUnread';
import type { RoomRef } from '@/lib/useRoom';
import type { Group, Topic } from '@/lib/types';
import RoomView from './RoomView';

interface GuildChannelsProps {
  supabase: SupabaseClient | null;
  /** True when rendered stacked inside Community.tsx (not full-height). */
  embedded?: boolean;
  /** Fires whenever a group opens/closes — lets Community.tsx give this the
   * full panel while a channel is open. */
  onOpenChange?: (open: boolean) => void;
}

/** Tier 1 of Chat 2.0: existing groups -> topics -> messages (unchanged behavior, now on the shared RoomView engine). */
export default function GuildChannels({ supabase, embedded = false, onOpenChange }: GuildChannelsProps) {
  const { token, profile } = useAuth();
  const [myGroups, setMyGroups] = useState<Group[]>([]);
  const [discover, setDiscover] = useState<Group[]>([]);
  const [activeGroup, setActiveGroup] = useState<Group | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [activeTopic, setActiveTopic] = useState<Topic | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    onOpenChange?.(Boolean(activeGroup));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroup]);

  const loadGroups = useCallback(async () => {
    if (!supabase || !profile) return;
    const { data: memberships } = await supabase.from('group_members').select('groups(*)').eq('profile_id', profile.id);
    const mine = (memberships ?? [])
      .map((m: { groups: Group | Group[] | null }) => (Array.isArray(m.groups) ? m.groups[0] : m.groups))
      .filter(Boolean) as Group[];
    setMyGroups(mine);

    const { data: all } = await supabase.from('groups').select('*').order('created_at', { ascending: false }).limit(50);
    const mineIds = new Set(mine.map((g) => g.id));
    setDiscover((all ?? []).filter((g: Group) => !mineIds.has(g.id)));
  }, [supabase, profile]);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  const topicRooms: RoomRef[] = topics.map((t) => ({ type: 'topic', id: t.id }));
  const unread = useUnreadRooms(topicRooms, supabase, profile?.id ?? null);

  const openGroup = async (group: Group) => {
    if (!supabase) return;
    setActiveGroup(group);
    setActiveTopic(null);
    const { data } = await supabase.from('topics').select('*').eq('group_id', group.id).order('created_at', { ascending: true });
    const list = (data ?? []) as Topic[];
    setTopics(list);
    if (list[0]) setActiveTopic(list[0]);
  };

  const createGroup = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    setError('');
    const res = await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? 'Could not create group');
      return;
    }
    setNewGroupName('');
    setCreatingGroup(false);
    await loadGroups();
    void openGroup(data.group);
  };

  const joinGroup = async (group: Group) => {
    const res = await fetch('/api/groups/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ group_id: group.id }),
    });
    if (res.ok) {
      await loadGroups();
      void openGroup(group);
    }
  };

  const addTopic = async () => {
    if (!activeGroup) return;
    const name = window.prompt('New topic name')?.trim();
    if (!name) return;
    const res = await fetch('/api/topics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ group_id: activeGroup.id, name }),
    });
    const data = await res.json();
    if (res.ok) {
      setTopics((prev) => [...prev, data.topic]);
      setActiveTopic(data.topic);
    } else {
      setError(data.error ?? 'Could not add topic');
    }
  };

  if (activeGroup) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-hairline">
          <button onClick={() => setActiveGroup(null)} className="text-ink/50 hover:text-ink text-lg leading-none" aria-label="Back to groups">
            ‹
          </button>
          <h3 className="text-sm font-semibold text-ink">{activeGroup.name}</h3>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-hairline overflow-x-auto no-scrollbar">
          {topics.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTopic(t)}
              className={`relative px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors
                ${activeTopic?.id === t.id ? 'bg-ink text-paper' : 'bg-ink/[0.06] text-ink hover:bg-ink/10'}`}
            >
              #{t.name}
              {unread.has(`topic:${t.id}`) && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-live" />}
            </button>
          ))}
          <button onClick={addTopic} className="px-2 py-1 rounded-full text-xs text-teal hover:text-teal/70 font-medium whitespace-nowrap">
            + topic
          </button>
        </div>
        {error && <p className="px-4 py-1.5 text-xs text-live bg-live/5">{error}</p>}
        {activeTopic && <RoomView room={{ type: 'topic', id: activeTopic.id }} supabase={supabase} profile={profile} placeholder={`Message #${activeTopic.name}`} />}
      </div>
    );
  }

  return (
    <div className={embedded ? 'p-3 space-y-4' : 'flex-1 overflow-y-auto p-3 space-y-4'}>
      <section>
        <div className="flex items-center justify-between px-1 mb-1.5">
          <h3 className="text-xs font-semibold text-ink/50 uppercase tracking-wide">Your groups</h3>
          <button onClick={() => setCreatingGroup((v) => !v)} className="text-xs text-teal hover:text-teal/70 font-medium">
            {creatingGroup ? 'Cancel' : '+ New'}
          </button>
        </div>

        {creatingGroup && (
          <div className="flex gap-2 mb-2 px-1">
            <input
              autoFocus
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createGroup()}
              placeholder="Group name"
              className="flex-1 px-3 py-1.5 rounded-lg border border-hairline bg-ink/[0.04] text-sm focus:outline-none focus:ring-2 focus:ring-teal/30"
            />
            <button onClick={createGroup} className="px-3 py-1.5 rounded-lg bg-teal text-white text-sm font-medium">
              Create
            </button>
          </div>
        )}

        {myGroups.length === 0 ? (
          <p className="px-1 text-sm text-ink/40">No groups yet — create one or join below.</p>
        ) : (
          <ul className="space-y-1">
            {myGroups.map((g) => (
              <li key={g.id}>
                <button onClick={() => openGroup(g)} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-ink/[0.05] transition-colors text-left">
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-semibold flex-none" style={{ backgroundColor: g.color ?? '#1D9E75' }}>
                    {g.name[0]?.toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink truncate">{g.name}</span>
                    {g.description && <span className="block text-xs text-ink/50 truncate">{g.description}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {discover.length > 0 && (
        <section>
          <h3 className="px-1 mb-1.5 text-xs font-semibold text-ink/50 uppercase tracking-wide">Discover</h3>
          <ul className="space-y-1">
            {discover.map((g) => (
              <li key={g.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl">
                <span className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-semibold flex-none" style={{ backgroundColor: g.color ?? '#1D9E75' }}>
                  {g.name[0]?.toUpperCase()}
                </span>
                <span className="flex-1 min-w-0 text-sm font-medium text-ink truncate">{g.name}</span>
                <button onClick={() => joinGroup(g)} className="px-3 py-1 rounded-full bg-ink/[0.06] text-ink text-xs font-medium hover:bg-ink/10">
                  Join
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
