'use client';

import { useState, useMemo } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useAuth } from '@/lib/auth';
import { createAuthedClient } from '@/lib/supabase/client';
import GuildChannels from './chat/GuildChannels';
import EventRooms from './chat/EventRooms';
import DirectMessages from './chat/DirectMessages';

interface ChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'guilds' | 'live' | 'dms';
const TABS: { key: Tab; label: string }[] = [
  { key: 'guilds', label: 'Guilds' },
  { key: 'live', label: 'Live' },
  { key: 'dms', label: 'DMs' },
];

/** Chat 2.0 shell: guild channels (existing groups/topics), ephemeral event rooms, and DMs between mutuals. */
export default function ChatDrawer({ isOpen, onClose }: ChatDrawerProps) {
  const { token, isAuthed } = useAuth();
  const [tab, setTab] = useState<Tab>('guilds');

  // One authed client per session token (also authorizes Realtime).
  const supabase = useMemo<SupabaseClient | null>(() => createAuthedClient(token), [token]);

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
          <div className="flex items-center gap-1 bg-ink/[0.05] rounded-full p-0.5">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  tab === t.key ? 'bg-paper text-ink shadow-sm' : 'text-ink/50 hover:text-ink'
                }`}
              >
                {t.label}
              </button>
            ))}
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

        {!supabase || !isAuthed ? (
          <div className="flex-1 flex items-center justify-center p-6 text-center text-sm text-ink/50">
            Chat needs Supabase configured and a signed-in session.
          </div>
        ) : (
          <>
            {tab === 'guilds' && <GuildChannels supabase={supabase} />}
            {tab === 'live' && <EventRooms supabase={supabase} />}
            {tab === 'dms' && <DirectMessages supabase={supabase} />}
          </>
        )}
      </div>
    </>
  );
}
