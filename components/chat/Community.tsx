'use client';

import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import EventRooms from './EventRooms';
import GuildChannels from './GuildChannels';

interface CommunityProps {
  supabase: SupabaseClient | null;
}

/**
 * "Community" side of the v4 P1 chat restructure (DMs | Community) — two
 * stacked sections, "Happening now" (event rooms) above guild channels.
 * Both EventRooms and GuildChannels stay mounted at all times (never
 * unmount/remount across the stacked <-> full-panel transition) so their
 * internal open-room/open-group state survives — only their layout classes
 * change via the `embedded` prop and CSS, driven by each one's own
 * onOpenChange callback.
 */
export default function Community({ supabase }: CommunityProps) {
  const [liveOpen, setLiveOpen] = useState(false);
  const [guildsOpen, setGuildsOpen] = useState(false);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <div className={liveOpen ? 'flex-1 flex flex-col min-h-0' : guildsOpen ? 'hidden' : 'border-b border-hairline'}>
        {!liveOpen && !guildsOpen && (
          <h3 className="px-4 pt-3 pb-1 text-xs font-semibold text-sub uppercase tracking-wide">Happening now</h3>
        )}
        <EventRooms supabase={supabase} embedded={!liveOpen} onOpenChange={setLiveOpen} />
      </div>

      <div className={guildsOpen ? 'flex-1 flex flex-col min-h-0' : liveOpen ? 'hidden' : ''}>
        {!liveOpen && !guildsOpen && (
          <h3 className="px-4 pt-3 pb-1 text-xs font-semibold text-sub uppercase tracking-wide">Guild channels</h3>
        )}
        <GuildChannels supabase={supabase} embedded={!guildsOpen} onOpenChange={setGuildsOpen} />
      </div>
    </div>
  );
}
