'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useCallback, useMemo } from 'react';

import Header from './Header';
import FilterCard from './FilterCard';
import EventPopup from './EventPopup';
import OrganizeDrawer from './OrganizeDrawer';
import SettingsDrawer from './SettingsDrawer';
import ChatDrawer from './ChatDrawer';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { withStatus, filterEvents, getEventStatus, formatEventTime } from '@/lib/utils';
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

export default function MapContainer() {
  const [allEvents, setAllEvents] = useState<Event[]>([]);
  const [filter, setFilter] = useState<EventFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [geolocateTrigger, setGeolocateTrigger] = useState(0);
  const [buildingFocus, setBuildingFocus] = useState<BuildingFocus | null>(null);
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);

  const { address, login } = useAuth();

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
        const { data, error } = await db
          .from('events')
          .select('*')
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

  const visibleEvents = useMemo(
    () => filterEvents(allEvents, filter, searchQuery),
    [allEvents, filter, searchQuery]
  );

  const eventCounts = useMemo(() => ({
    all:      allEvents.filter((e) => e.status !== 'past').length,
    live:     allEvents.filter((e) => e.status === 'live').length,
    upcoming: allEvents.filter((e) => e.status === 'upcoming').length,
  }), [allEvents]);

  const handleEventSelect = useCallback((event: Event) => {
    setSelectedEvent(event);
  }, []);

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

  // Organize and chat are gated behind login — prompt sign-in if logged out.
  const handleOrganize = useCallback(() => {
    if (address) setOrganizeOpen(true);
    else login();
  }, [address, login]);

  const handleChat = useCallback(() => {
    if (!address) {
      login();
      return;
    }
    setChatOpen(true);
  }, [address, login]);

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
        onOrganize={handleOrganize}
        onChat={handleChat}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* Filter / search card */}
      <FilterCard
        filter={filter}
        onFilterChange={setFilter}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onNearMe={() => setGeolocateTrigger((n) => n + 1)}
        eventCounts={eventCounts}
      />

      {/* Demo-data badge (shown until Supabase is configured) */}
      {demoMode && (
        <div className="absolute bottom-4 left-4 z-20 pointer-events-none">
          <span className="inline-flex items-center gap-1.5 bg-paper/90 backdrop-blur-md rounded-full px-3 py-1 border border-hairline text-[11px] font-medium text-ink/55 shadow">
            <span className="w-1.5 h-1.5 rounded-full bg-upcoming" />
            Demo data · connect Supabase for live events
          </span>
        </div>
      )}

      {/* Empty state */}
      {!loading && visibleEvents.length === 0 && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <div className="bg-paper/90 backdrop-blur-md rounded-xl px-5 py-3 border border-hairline text-sm text-ink/60 text-center shadow">
            {searchQuery
              ? `No events matching "${searchQuery}"`
              : filter === 'live'
              ? 'No live events right now'
              : 'No upcoming events — check back soon'}
          </div>
        </div>
      )}

      {/* Event popup */}
      {selectedEvent && (
        <EventPopup
          event={selectedEvent}
          onClose={() => {
            setSelectedEvent(null);
            setBuildingFocus(null); // reset the tilted camera
          }}
          onViewBuilding={() =>
            setBuildingFocus({
              lat: selectedEvent.lat,
              lng: selectedEvent.lng,
              title: selectedEvent.title,
              status: selectedEvent.status,
              meta: selectedEvent.venue_name ?? formatEventTime(selectedEvent),
              design: resolveLandmark(selectedEvent),
              imageUrl: selectedEvent.building_image_url ?? null,
            })
          }
          onBuildingImage={(url) => {
            setAllEvents((prev) =>
              prev.map((e) => (e.id === selectedEvent.id ? { ...e, building_image_url: url } : e))
            );
            setSelectedEvent((prev) => (prev ? { ...prev, building_image_url: url } : prev));
            // Reveal it immediately on the map
            setBuildingFocus({
              lat: selectedEvent.lat,
              lng: selectedEvent.lng,
              title: selectedEvent.title,
              status: selectedEvent.status,
              meta: selectedEvent.venue_name ?? formatEventTime(selectedEvent),
              design: null,
              imageUrl: url,
            });
          }}
        />
      )}

      {/* Organize drawer */}
      <OrganizeDrawer
        isOpen={organizeOpen}
        onClose={() => setOrganizeOpen(false)}
        onEventAdded={handleEventAdded}
      />

      {/* Settings drawer (wallet + balance + top-up) */}
      <SettingsDrawer
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

      {/* Chat drawer (groups + topics + realtime messages) */}
      <ChatDrawer
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
      />
    </div>
  );
}
