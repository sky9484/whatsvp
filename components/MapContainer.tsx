'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

import Header from './Header';
import TabBar from './TabBar';
import HeroOverlay from './HeroOverlay';
import SearchBar from './SearchBar';
import TimeScrubber from './TimeScrubber';
import EventPopup from './EventPopup';
import EventSheet from './EventSheet';
import OrganizeDrawer from './OrganizeDrawer';
import SettingsDrawer from './SettingsDrawer';
import ChatDrawer from './ChatDrawer';
import GuildsDrawer from './GuildsDrawer';
import type { Guild } from '@/lib/types';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { withStatus, filterEvents, segmentCounts, getEventStatus, formatEventTime } from '@/lib/utils';
import type { Event, EventFilter, RawEvent } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { resolveLandmark } from '@/lib/buildings';
import { getDemoEvents } from '@/lib/demoEvents';
import type { BuildingFocus } from './Map';

// MapLibre requires browser APIs — must be loaded client-only
const Map = dynamic(() => import('./Map'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 bg-paper flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-hairline border-t-teal rounded-full animate-spin" />
    </div>
  ),
});

type DrawerKey = 'organize' | 'settings' | 'chat' | 'guilds' | null;

export default function MapContainer() {
  const [allEvents, setAllEvents] = useState<Event[]>([]);
  const [filter, setFilter] = useState<EventFilter>('week');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  // Single source of truth for which drawer is open — at most one at a time.
  // (Four independent booleans previously let drawers stack with undefined dismiss behavior.)
  const [activeDrawer, setActiveDrawer] = useState<DrawerKey>(null);
  const [guildFilter, setGuildFilter] = useState<Guild | null>(null);
  const [geolocateTrigger, setGeolocateTrigger] = useState(0);
  const [buildingFocus, setBuildingFocus] = useState<BuildingFocus | null>(null);
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);

  const { address, login } = useAuth();
  const router = useRouter();

  // Honor ?open=guilds|chat from a cross-page nav (the Passport page's tab bar
  // links back here since guilds/chat are drawers-over-the-map, not routes),
  // then clean the URL. Read via window.location rather than useSearchParams
  // so this stays a plain one-shot effect with no Suspense boundary required.
  useEffect(() => {
    const open = new URLSearchParams(window.location.search).get('open');
    if (open === 'guilds' || open === 'chat') {
      setActiveDrawer(open);
      window.history.replaceState(null, '', '/');
    }
  }, []);

  // Initial events fetch
  useEffect(() => {
    const supabase = createClient();

    // No Supabase configured — fall back to built-in demo events so the map,
    // popups, transit and isometric buildings are all interactive with zero setup.
    if (!supabase) {
      setAllEvents(withStatus(getDemoEvents()));
      setDemoMode(true);
      setLoading(false);
      return;
    }

    async function fetchEvents(db: SupabaseClient) {
      setLoading(true);
      try {
        // Keep events whose start is no more than 8h in the past (covers in-progress
        // events) OR that are still upcoming. Events with a null ends_at are kept via
        // the starts_at floor. Final live/past status is derived client-side.
        const floor = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString();
        // Explicit column list (not '*'): checkin_secret is REVOKEd from the
        // anon/authenticated roles this client runs as (it's an HMAC key, must
        // never reach a browser), and a wildcard select would fail outright
        // the moment any selected column isn't readable by the calling role.
        const { data, error } = await db
          .from('events')
          .select(
            'id, source, luma_url, title, description, venue_name, lat, lng, starts_at, ends_at, cover_url, host_id, created_at, building_key, building_image_url, guild_id, checkin_methods'
          )
          .gte('starts_at', floor)
          .order('starts_at', { ascending: true });

        if (error) {
          console.error('[MapContainer] Supabase fetch error:', error);
          return;
        }
        setAllEvents(withStatus(data as RawEvent[]));
      } finally {
        setLoading(false);
      }
    }

    fetchEvents(supabase);

    // Refresh every 2 minutes so live/upcoming status stays current
    const interval = setInterval(() => fetchEvents(supabase), 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const visibleEvents = useMemo(() => {
    // When a guild is selected, show ALL of its events (the guild API already
    // time-bounds them) — bypass the status/search filters so none are dropped.
    if (guildFilter) return allEvents.filter((e) => e.guild_id === guildFilter.id);
    return filterEvents(allEvents, filter, searchQuery);
  }, [allEvents, filter, searchQuery, guildFilter]);

  // Merge a guild's events into the map (they may not be in the main feed) and focus on them.
  const handleShowGuildEvents = useCallback((guild: Guild, guildEvents: Event[]) => {
    setAllEvents((prev) => {
      const ids = new Set(guildEvents.map((e) => e.id));
      return [...prev.filter((e) => !ids.has(e.id)), ...guildEvents];
    });
    setGuildFilter(guild);
  }, []);

  const timeCounts = useMemo(() => segmentCounts(allEvents), [allEvents]);
  const liveCount = timeCounts.live;

  const handleEventSelect = useCallback((event: Event) => {
    setSelectedEvent(event);
  }, []);

  // Honor ?event=<id> from a share-page "Open in WhatsVP" link — selects the
  // event once it's loaded, then cleans the URL. One-shot via a ref so it
  // doesn't re-fire on later event-list refreshes.
  const pendingEventId = useRef<string | null>(null);
  useEffect(() => {
    pendingEventId.current = new URLSearchParams(window.location.search).get('event');
  }, []);
  useEffect(() => {
    if (!pendingEventId.current || allEvents.length === 0) return;
    const match = allEvents.find((e) => e.id === pendingEventId.current);
    if (match) {
      handleEventSelect(match);
      window.history.replaceState(null, '', '/');
    }
    pendingEventId.current = null;
  }, [allEvents, handleEventSelect]);

  const handleEventAdded = useCallback(
    (event: RawEvent & { status: ReturnType<typeof getEventStatus> }) => {
      setAllEvents((prev) => {
        // Replace if same id, otherwise prepend
        const exists = prev.findIndex((e) => e.id === event.id);
        if (exists >= 0) {
          const next = [...prev];
          next[exists] = event;
          return next;
        }
        return [event, ...prev];
      });
    },
    []
  );

  // Organize, chat and passport are gated behind login — prompt sign-in if logged out.
  const handleOrganize = useCallback(() => {
    if (address) setActiveDrawer('organize');
    else login();
  }, [address, login]);

  const handleChat = useCallback(() => {
    if (!address) {
      login();
      return;
    }
    setActiveDrawer('chat');
  }, [address, login]);

  const handlePassport = useCallback(() => {
    if (!address) {
      login();
      return;
    }
    setActiveDrawer('settings');
  }, [address, login]);

  // The TabBar's Passport tab navigates to the real /passport page (a
  // shareable, page-like collection view) rather than opening a drawer.
  const handleViewPassport = useCallback(() => {
    if (!address) {
      login();
      return;
    }
    router.push('/passport');
  }, [address, login, router]);

  const closeDrawer = useCallback(() => setActiveDrawer(null), []);

  // Shared by EventPopup (desktop) and EventSheet (mobile) — both act on
  // whichever event is currently selected/focused.
  const handleViewBuilding = useCallback((event: Event) => {
    setBuildingFocus({
      lat: event.lat,
      lng: event.lng,
      title: event.title,
      status: event.status,
      meta: event.venue_name ?? formatEventTime(event),
      design: resolveLandmark(event),
      imageUrl: event.building_image_url ?? null,
    });
  }, []);

  const handleBuildingImage = useCallback((event: Event, url: string) => {
    setAllEvents((prev) =>
      prev.map((e) => (e.id === event.id ? { ...e, building_image_url: url } : e))
    );
    setSelectedEvent((prev) => (prev && prev.id === event.id ? { ...prev, building_image_url: url } : prev));
    handleViewBuilding({ ...event, building_image_url: url });
  }, [handleViewBuilding]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-paper">
      {/* Full-bleed map */}
      <Map
        events={visibleEvents}
        onEventSelect={handleEventSelect}
        geolocateTrigger={geolocateTrigger}
        buildingFocus={buildingFocus}
      />

      {/* Top header */}
      <Header
        onGuilds={() => setActiveDrawer('guilds')}
        onOrganize={handleOrganize}
        onChat={handleChat}
        onOpenSettings={handlePassport}
      />

      {/* Bottom tab bar — mobile only; desktop uses the header's top nav.
          'organize' has no tab (it's the floating +), so it maps back to 'map'. */}
      <TabBar
        active={activeDrawer === 'guilds' ? 'guilds' : activeDrawer === 'chat' ? 'chat' : 'map'}
        onMap={closeDrawer}
        onGuilds={() => setActiveDrawer('guilds')}
        onChat={handleChat}
        onPassport={handleViewPassport}
      />

      {/* Floating "+" — mobile-only entry point for Organize (desktop uses the header nav) */}
      <button
        onClick={handleOrganize}
        aria-label="Organize an event"
        className="md:hidden fixed right-4 bottom-20 z-30 w-14 h-14 rounded-full bg-teal text-white
                   shadow-lg flex items-center justify-center text-2xl font-light active:scale-95 transition-transform"
      >
        +
      </button>

      {/* Logged-out landing overlay — the map behind it IS the product */}
      {!address && <HeroOverlay liveCount={timeCounts.live} weekCount={timeCounts.week} />}

      {/* Active guild filter chip */}
      {guildFilter && (
        <div className="absolute top-[72px] left-1/2 -translate-x-1/2 z-30 sm:left-auto sm:right-4 sm:translate-x-0">
          <button
            onClick={() => setGuildFilter(null)}
            className="inline-flex items-center gap-2 bg-paper/95 backdrop-blur-md rounded-full pl-2 pr-3 py-1.5 border shadow-lg text-sm"
            style={{ borderColor: guildFilter.color ?? '#1D9E75' }}
          >
            <span className="w-5 h-5 rounded-md flex items-center justify-center text-white text-[10px] font-bold" style={{ backgroundColor: guildFilter.color ?? '#1D9E75' }}>
              {guildFilter.name[0]?.toUpperCase()}
            </span>
            <span className="font-medium text-ink">{guildFilter.name}</span>
            <span className="text-ink/40">×</span>
          </button>
        </div>
      )}

      {/* Search + time scrubber card */}
      <div className="absolute top-[72px] left-1/2 -translate-x-1/2 z-30 w-full max-w-md px-3 pointer-events-none">
        <div className="bg-paper/95 backdrop-blur-md rounded-2xl shadow-lg border border-hairline p-3 pointer-events-auto space-y-2">
          <SearchBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onNearMe={() => setGeolocateTrigger((n) => n + 1)}
          />
          <TimeScrubber active={filter} onChange={setFilter} counts={timeCounts} />
        </div>
      </div>

      {/* Live-presence indicator — sits above the mobile tab bar */}
      {liveCount > 0 && (
        <div className="absolute bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <span className="inline-flex items-center gap-2 bg-paper/90 backdrop-blur-md rounded-full pl-2.5 pr-3.5 py-1.5 border border-hairline shadow-lg">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-live opacity-70 animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-live" />
            </span>
            <span className="text-[13px] font-medium text-ink">
              {liveCount} {liveCount === 1 ? 'spot' : 'spots'} live now
            </span>
          </span>
        </div>
      )}

      {/* Demo-data badge (shown until Supabase is configured) — sits above the mobile tab bar */}
      {demoMode && (
        <div className="absolute bottom-20 md:bottom-4 left-4 z-20 pointer-events-none">
          <span className="inline-flex items-center gap-1.5 bg-paper/90 backdrop-blur-md rounded-full px-3 py-1 border border-hairline text-[11px] font-medium text-ink/55 shadow">
            <span className="w-1.5 h-1.5 rounded-full bg-upcoming" />
            Demo data · connect Supabase for live events
          </span>
        </div>
      )}

      {/* Empty state */}
      {!loading && visibleEvents.length === 0 && (
        <div className="absolute bottom-36 md:bottom-24 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <div className="bg-paper/90 backdrop-blur-md rounded-xl px-5 py-3 border border-hairline text-sm text-ink/60 text-center shadow">
            {searchQuery
              ? `No events matching "${searchQuery}"`
              : {
                  live: 'No live events right now',
                  today: 'Nothing on today — see this week',
                  tomorrow: 'Nothing tomorrow yet',
                  week: 'No events this week — check back soon',
                  past10: 'No events in the past 10 days',
                }[filter]}
          </div>
        </div>
      )}

      {/* Event popup — desktop only (hidden md:block internally) */}
      {selectedEvent && (
        <EventPopup
          event={selectedEvent}
          onClose={() => {
            setSelectedEvent(null);
            setBuildingFocus(null); // reset the tilted camera
          }}
          onViewBuilding={() => handleViewBuilding(selectedEvent)}
          onBuildingImage={(url) => handleBuildingImage(selectedEvent, url)}
        />
      )}

      {/* Event sheet — mobile only (md:hidden internally), draggable peek/half/full + carousel */}
      <EventSheet
        events={visibleEvents}
        selectedEvent={selectedEvent}
        onEventSelect={handleEventSelect}
        onClose={() => {
          setSelectedEvent(null);
          setBuildingFocus(null);
        }}
        onViewBuilding={handleViewBuilding}
        onBuildingImage={handleBuildingImage}
      />

      {/* Organize drawer */}
      <OrganizeDrawer
        isOpen={activeDrawer === 'organize'}
        onClose={closeDrawer}
        onEventAdded={handleEventAdded}
      />

      {/* Settings drawer (account + balance + Passport + top-up) */}
      <SettingsDrawer
        isOpen={activeDrawer === 'settings'}
        onClose={closeDrawer}
      />

      {/* Chat drawer (groups + topics + realtime messages) */}
      <ChatDrawer
        isOpen={activeDrawer === 'chat'}
        onClose={closeDrawer}
      />

      {/* Guilds drawer (directory + guild home + create) */}
      <GuildsDrawer
        isOpen={activeDrawer === 'guilds'}
        onClose={closeDrawer}
        onShowGuildEvents={handleShowGuildEvents}
      />
    </div>
  );
}
