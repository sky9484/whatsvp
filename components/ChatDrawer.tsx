'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useAuth } from '@/lib/auth';
import { createAuthedClient } from '@/lib/supabase/client';
import type { Group, Topic, Message } from '@/lib/types';

interface ChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ChatDrawer({ isOpen, onClose }: ChatDrawerProps) {
  const { token, profile, isAuthed } = useAuth();

  // One authed client per session token (also authorizes Realtime).
  const supabase = useMemo<SupabaseClient | null>(
    () => createAuthedClient(token),
    [token]
  );

  const [myGroups, setMyGroups] = useState<Group[]>([]);
  const [discover, setDiscover] = useState<Group[]>([]);
  const [activeGroup, setActiveGroup] = useState<Group | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [activeTopic, setActiveTopic] = useState<Topic | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [error, setError] = useState('');

  const profileCache = useRef<Map<string, { display_name: string; avatar_url?: string | null }>>(
    new Map()
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Loaders ─────────────────────────────────────────────────────────────────
  const loadGroups = useCallback(async () => {
    if (!supabase || !profile) return;
    const { data: memberships } = await supabase
      .from('group_members')
      .select('groups(*)')
      .eq('profile_id', profile.id);

    const mine = (memberships ?? [])
      .map((m: { groups: Group | Group[] | null }) =>
        Array.isArray(m.groups) ? m.groups[0] : m.groups
      )
      .filter(Boolean) as Group[];
    setMyGroups(mine);

    const { data: all } = await supabase
      .from('groups')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    const mineIds = new Set(mine.map((g) => g.id));
    setDiscover((all ?? []).filter((g: Group) => !mineIds.has(g.id)));
  }, [supabase, profile]);

  const openGroup = useCallback(
    async (group: Group) => {
      if (!supabase) return;
      setActiveGroup(group);
      setActiveTopic(null);
      setMessages([]);
      const { data } = await supabase
        .from('topics')
        .select('*')
        .eq('group_id', group.id)
        .order('created_at', { ascending: true });
      const list = (data ?? []) as Topic[];
      setTopics(list);
      if (list[0]) void openTopic(group, list[0]);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [supabase]
  );

  const openTopic = useCallback(
    async (group: Group, topic: Topic) => {
      if (!supabase) return;
      setActiveTopic(topic);
      const { data } = await supabase
        .from('messages')
        .select('*, profiles(display_name, avatar_url)')
        .eq('topic_id', topic.id)
        .order('created_at', { ascending: true })
        .limit(100);
      const msgs = (data ?? []) as Message[];
      for (const m of msgs) {
        if (m.profiles) profileCache.current.set(m.profile_id, m.profiles);
      }
      setMessages(msgs);
    },
    [supabase]
  );

  // ── Initial load when opened ────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen && isAuthed) void loadGroups();
  }, [isOpen, isAuthed, loadGroups]);

  // ── Realtime subscription for the active topic ──────────────────────────────
  useEffect(() => {
    if (!supabase || !activeTopic) return;

    const channel = supabase
      .channel(`room:${activeTopic.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `topic_id=eq.${activeTopic.id}`,
        },
        (payload) => {
          const msg = payload.new as Message;
          setMessages((prev) =>
            prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]
          );
          // Resolve unknown sender names for live messages
          if (!profileCache.current.has(msg.profile_id)) {
            void supabase
              .from('profiles')
              .select('display_name, avatar_url')
              .eq('id', msg.profile_id)
              .maybeSingle()
              .then(({ data }) => {
                if (data) {
                  profileCache.current.set(msg.profile_id, data);
                  setMessages((prev) => [...prev]); // re-render with resolved name
                }
              });
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, activeTopic]);

  // Auto-scroll to newest message
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // ── Actions ─────────────────────────────────────────────────────────────────
  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !supabase || !activeGroup || !activeTopic || !profile) return;
    setDraft('');
    const { data, error: insErr } = await supabase
      .from('messages')
      .insert({
        group_id: activeGroup.id,
        topic_id: activeTopic.id,
        profile_id: profile.id,
        body,
      })
      .select('*, profiles(display_name, avatar_url)')
      .single();
    if (insErr) {
      setError(insErr.message);
      setDraft(body); // restore on failure
      return;
    }
    // Optimistic append (Realtime dedupes by id)
    const msg = data as Message;
    if (msg.profiles) profileCache.current.set(msg.profile_id, msg.profiles);
    setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
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
      void openTopic(activeGroup, data.topic);
    } else {
      setError(data.error ?? 'Could not add topic');
    }
  };

  const senderName = (m: Message): string => {
    if (m.profile_id === profile?.id) return 'You';
    return (
      m.profiles?.display_name ??
      profileCache.current.get(m.profile_id)?.display_name ??
      'Member'
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────────
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
        aria-label="Chat"
        aria-modal="true"
        className={`fixed z-50 bg-paper shadow-2xl border-hairline flex flex-col transition-transform duration-[280ms]
                    [transition-timing-function:cubic-bezier(0.32,0.72,0,1)]
                    bottom-0 left-0 right-0 h-[85vh] rounded-t-2xl border-t
                    sm:top-0 sm:bottom-0 sm:left-auto sm:right-0 sm:h-auto sm:w-[440px] sm:rounded-none sm:border-l sm:border-t-0
                    ${isOpen ? 'translate-y-0 sm:translate-x-0' : 'translate-y-[110%] sm:translate-y-0 sm:translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-hairline">
          <div className="flex items-center gap-2">
            {activeGroup && (
              <button
                onClick={() => setActiveGroup(null)}
                className="text-ink/50 hover:text-ink text-lg leading-none"
                aria-label="Back to groups"
              >
                ‹
              </button>
            )}
            <h2 className="text-lg font-semibold text-ink">
              {activeGroup ? activeGroup.name : 'Chat'}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 rounded-full bg-ink/10 flex items-center justify-center
                       text-ink/60 hover:bg-ink/20 transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        {error && (
          <p className="px-4 py-2 text-xs text-live bg-live/5">{error}</p>
        )}

        {!supabase ? (
          <div className="flex-1 flex items-center justify-center p-6 text-center text-sm text-ink/50">
            Chat needs Supabase configured and a signed-in session.
          </div>
        ) : !activeGroup ? (
          // ── Group list view ──
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            <section>
              <div className="flex items-center justify-between px-1 mb-1.5">
                <h3 className="text-xs font-semibold text-ink/50 uppercase tracking-wide">
                  Your groups
                </h3>
                <button
                  onClick={() => setCreatingGroup((v) => !v)}
                  className="text-xs text-teal hover:text-teal/70 font-medium"
                >
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
                    className="flex-1 px-3 py-1.5 rounded-lg border border-hairline bg-ink/[0.04]
                               text-sm focus:outline-none focus:ring-2 focus:ring-teal/30"
                  />
                  <button
                    onClick={createGroup}
                    className="px-3 py-1.5 rounded-lg bg-teal text-white text-sm font-medium"
                  >
                    Create
                  </button>
                </div>
              )}

              {myGroups.length === 0 ? (
                <p className="px-1 text-sm text-ink/40">
                  No groups yet — create one or join below.
                </p>
              ) : (
                <ul className="space-y-1">
                  {myGroups.map((g) => (
                    <li key={g.id}>
                      <button
                        onClick={() => openGroup(g)}
                        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl
                                   hover:bg-ink/[0.05] transition-colors text-left"
                      >
                        <span
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-semibold"
                          style={{ backgroundColor: g.color ?? '#1D9E75' }}
                        >
                          {g.name[0]?.toUpperCase()}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-ink truncate">
                            {g.name}
                          </span>
                          {g.description && (
                            <span className="block text-xs text-ink/50 truncate">
                              {g.description}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {discover.length > 0 && (
              <section>
                <h3 className="px-1 mb-1.5 text-xs font-semibold text-ink/50 uppercase tracking-wide">
                  Discover
                </h3>
                <ul className="space-y-1">
                  {discover.map((g) => (
                    <li
                      key={g.id}
                      className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl"
                    >
                      <span
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-semibold"
                        style={{ backgroundColor: g.color ?? '#1D9E75' }}
                      >
                        {g.name[0]?.toUpperCase()}
                      </span>
                      <span className="flex-1 min-w-0 text-sm font-medium text-ink truncate">
                        {g.name}
                      </span>
                      <button
                        onClick={() => joinGroup(g)}
                        className="px-3 py-1 rounded-full bg-ink/[0.06] text-ink text-xs font-medium hover:bg-ink/10"
                      >
                        Join
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        ) : (
          // ── Room view ──
          <div className="flex-1 flex flex-col min-h-0">
            {/* Topic tabs */}
            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-hairline overflow-x-auto">
              {topics.map((t) => (
                <button
                  key={t.id}
                  onClick={() => openTopic(activeGroup, t)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors
                    ${activeTopic?.id === t.id ? 'bg-ink text-paper' : 'bg-ink/[0.06] text-ink hover:bg-ink/10'}`}
                >
                  #{t.name}
                </button>
              ))}
              <button
                onClick={addTopic}
                className="px-2 py-1 rounded-full text-xs text-teal hover:text-teal/70 font-medium whitespace-nowrap"
              >
                + topic
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
              {messages.length === 0 ? (
                <p className="text-center text-sm text-ink/40 mt-8">
                  No messages yet — say hello 👋
                </p>
              ) : (
                messages.map((m) => {
                  const mine = m.profile_id === profile?.id;
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}
                    >
                      <span className="text-[11px] text-ink/40 px-1">
                        {senderName(m)}
                      </span>
                      <div
                        className={`max-w-[80%] px-3 py-1.5 rounded-2xl text-sm
                          ${mine ? 'bg-teal text-white rounded-br-sm' : 'bg-ink/[0.07] text-ink rounded-bl-sm'}`}
                      >
                        {m.body}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Composer */}
            <form onSubmit={sendMessage} className="flex items-center gap-2 p-3 border-t border-hairline">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={activeTopic ? `Message #${activeTopic.name}` : 'Select a topic'}
                disabled={!activeTopic}
                className="flex-1 px-3.5 py-2 rounded-full border border-hairline bg-ink/[0.04]
                           text-sm focus:outline-none focus:ring-2 focus:ring-teal/30 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!draft.trim() || !activeTopic}
                className="px-4 py-2 rounded-full bg-teal text-white text-sm font-medium
                           hover:bg-teal/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Send
              </button>
            </form>
          </div>
        )}
      </div>
    </>
  );
}
