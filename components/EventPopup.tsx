'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Event, TransitInfo } from '@/lib/types';
import { formatEventTime } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { createClient, createAuthedClient } from '@/lib/supabase/client';
import { resolveLandmark } from '@/lib/buildings';

interface EventPopupProps {
  event: Event;
  onClose: () => void;
  onViewBuilding?: () => void;
  onBuildingImage?: (url: string) => void;
}

export default function EventPopup({ event, onClose, onViewBuilding, onBuildingImage }: EventPopupProps) {
  const { profile, token, address, login } = useAuth();
  const isLandmark = resolveLandmark(event) !== null;
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState('');
  const [transit, setTransit] = useState<TransitInfo | null | 'loading'>('loading');

  const anon = useMemo<SupabaseClient | null>(() => createClient(), []);
  const authed = useMemo<SupabaseClient | null>(() => createAuthedClient(token), [token]);

  const [rsvpCount, setRsvpCount] = useState<number | null>(null);
  const [going, setGoing] = useState(false);
  const [rsvpBusy, setRsvpBusy] = useState(false);
  const [shared, setShared] = useState(false);

  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${event.lat},${event.lng}&travelmode=transit`;
  const wazeUrl = `https://www.waze.com/ul?ll=${event.lat},${event.lng}&navigate=yes`;
  const calendarUrl = buildCalendarUrl(event);

  // Transit
  useEffect(() => {
    setTransit('loading');
    fetch(`/api/transit?lat=${event.lat}&lng=${event.lng}`)
      .then((r) => r.json())
      .then((d) => setTransit(d.transit ?? null))
      .catch(() => setTransit(null));
  }, [event.lat, event.lng]);

  // RSVP count + my status
  useEffect(() => {
    let cancelled = false;
    if (anon) {
      anon
        .from('event_rsvps')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', event.id)
        .then(({ count }) => {
          if (!cancelled) setRsvpCount(count ?? 0);
        });
    }
    if (authed && profile) {
      authed
        .from('event_rsvps')
        .select('event_id')
        .eq('event_id', event.id)
        .eq('profile_id', profile.id)
        .maybeSingle()
        .then(({ data }) => {
          if (!cancelled) setGoing(Boolean(data));
        });
    } else {
      setGoing(false);
    }
    return () => {
      cancelled = true;
    };
  }, [event.id, anon, authed, profile]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const toggleRsvp = async () => {
    if (!address) return login(); // gate behind login
    if (!authed || !profile) return;
    setRsvpBusy(true);
    const next = !going;
    // optimistic
    setGoing(next);
    setRsvpCount((c) => (c ?? 0) + (next ? 1 : -1));
    const q = next
      ? authed.from('event_rsvps').insert({ event_id: event.id, profile_id: profile.id })
      : authed.from('event_rsvps').delete().eq('event_id', event.id).eq('profile_id', profile.id);
    const { error } = await q;
    if (error) {
      // revert
      setGoing(!next);
      setRsvpCount((c) => (c ?? 0) + (next ? -1 : 1));
    }
    setRsvpBusy(false);
  };

  const uploadBuilding = async (file: File) => {
    if (!address) return login();
    if (!authed || !token) {
      setUploadErr('Sign-in session required.');
      return;
    }
    setUploadErr('');
    setUploading(true);
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${event.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await authed.storage
        .from('buildings')
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw new Error(upErr.message);

      const { data: pub } = authed.storage.from('buildings').getPublicUrl(path);
      const res = await fetch('/api/building', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ event_id: event.id, image_url: pub.publicUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Upload failed');
      onBuildingImage?.(pub.publicUrl);
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const share = async () => {
    const url = event.luma_url || window.location.href;
    const text = `${event.title} — on WhatsVP`;
    try {
      if (navigator.share) {
        await navigator.share({ title: event.title, text, url });
      } else {
        await navigator.clipboard.writeText(url);
        setShared(true);
        setTimeout(() => setShared(false), 1500);
      }
    } catch {
      /* user dismissed share sheet */
    }
  };

  const badge =
    event.status === 'live'
      ? { cls: 'bg-live text-white', text: '● LIVE NOW' }
      : event.status === 'upcoming'
      ? { cls: 'bg-upcoming text-white', text: 'UPCOMING' }
      : { cls: 'bg-ink/20 text-ink', text: 'PAST' };

  const headerTint =
    event.status === 'live' ? '#D85A30' : event.status === 'upcoming' ? '#1D9E75' : '#9CA3AF';

  return (
    <>
      <div className="fixed inset-0 z-20" onClick={onClose} aria-hidden />

      <div
        className="fixed bottom-0 left-0 right-0 z-30 max-h-[88vh] overflow-y-auto
                   sm:absolute sm:bottom-6 sm:left-6 sm:right-auto sm:w-[360px] sm:max-h-[calc(100vh-7rem)]
                   rounded-t-2xl sm:rounded-2xl shadow-2xl border border-hairline bg-paper"
        role="dialog"
        aria-label={event.title}
      >
        {/* Hero */}
        {event.cover_url ? (
          <div className="relative h-44 overflow-hidden rounded-t-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={event.cover_url} alt={event.title} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-black/15" />
            <span
              className={`absolute top-3 left-3 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold tracking-wide ${badge.cls}`}
            >
              {badge.text}
            </span>
            <h2 className="absolute bottom-3 left-4 right-4 text-white text-[19px] font-semibold leading-snug drop-shadow">
              {event.title}
            </h2>
          </div>
        ) : (
          <div
            className="relative h-20 rounded-t-2xl flex items-end p-4"
            style={{ background: `linear-gradient(135deg, ${headerTint}22, ${headerTint}0a)` }}
          >
            <span
              className={`absolute top-3 left-3 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold tracking-wide ${badge.cls}`}
            >
              {badge.text}
            </span>
          </div>
        )}

        <div className="p-4">
          {!event.cover_url && (
            <h2 className="text-[18px] font-semibold text-ink leading-snug mb-2">{event.title}</h2>
          )}

          {/* Time + venue */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm text-ink/70">
              <CalendarIcon />
              <span>{formatEventTime(event)}</span>
            </div>
            {event.venue_name && (
              <div className="flex items-center gap-2 text-sm text-ink/60">
                <PinIcon />
                <span className="truncate">{event.venue_name}</span>
              </div>
            )}
          </div>

          {/* Transit */}
          <div className="mt-3 pt-3 border-t border-hairline">
            {transit === 'loading' ? (
              <div className="h-4 w-44 bg-ink/10 rounded animate-pulse" />
            ) : transit ? (
              <div className="flex items-start gap-2 text-sm">
                <span className="text-base leading-none mt-0.5">🚇</span>
                <div className="text-ink/70 min-w-0">
                  <div className="flex items-center flex-wrap gap-x-1">
                    <span className="font-medium text-ink">{transit.station_name}</span>
                    <span className="text-ink/30">·</span>
                    <span className="font-medium" style={{ color: transit.line_color }}>
                      {transit.line_name}
                    </span>
                    {transit.distance_m > 0 && (
                      <>
                        <span className="text-ink/30">·</span>
                        <span className="text-ink/50">{formatDist(transit.distance_m)}</span>
                      </>
                    )}
                  </div>
                  <div className="text-xs text-ink/50 mt-0.5">
                    {transit.next_departure_minutes !== null ? (
                      <>
                        <span className="text-teal font-medium">
                          {transit.next_departure_minutes === 0
                            ? 'departing now'
                            : `next train ~${transit.next_departure_minutes} min`}
                        </span>
                        {transit.headway_minutes ? <span> · every {transit.headway_minutes} min</span> : null}
                        {!transit.realtime && <span className="text-ink/40"> · scheduled</span>}
                      </>
                    ) : (
                      <span className="text-ink/40">
                        {transit.headway_minutes ? `every ${transit.headway_minutes} min` : 'outside service hours'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink/40">No rail station within 2 km</p>
            )}
          </div>

          {/* Primary actions: RSVP + share */}
          <div className="mt-4 flex gap-2">
            <button
              onClick={toggleRsvp}
              disabled={rsvpBusy}
              className={`flex-1 py-2.5 px-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60
                ${going ? 'bg-teal/15 text-teal border border-teal/30' : 'bg-teal text-white hover:bg-teal/90'}`}
            >
              {going ? '✓ Going' : 'RSVP'}
              {rsvpCount !== null && rsvpCount > 0 && (
                <span className={going ? 'text-teal/70' : 'text-white/80'}> · {rsvpCount}</span>
              )}
            </button>
            <a
              href={calendarUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Add to calendar"
              title="Add to Google Calendar"
              className="px-3 flex items-center rounded-xl border border-hairline text-ink hover:bg-ink/5 transition-colors"
            >
              <CalendarPlusIcon />
            </a>
            <button
              onClick={share}
              aria-label="Share"
              className="px-3 rounded-xl border border-hairline text-ink hover:bg-ink/5 transition-colors text-sm font-medium"
            >
              {shared ? 'Copied' : <ShareIcon />}
            </button>
          </div>

          {/* Secondary: directions */}
          <div className="mt-2 flex gap-2">
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-2 px-3 text-[13px] font-medium text-center rounded-xl border border-hairline text-ink hover:bg-ink/5 transition-colors"
            >
              Google Maps
            </a>
            <a
              href={wazeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-2 px-3 text-[13px] font-medium text-center rounded-xl border border-hairline text-ink hover:bg-ink/5 transition-colors"
            >
              Waze
            </a>
          </div>

          {/* Iso building reveal */}
          {onViewBuilding && (isLandmark || event.building_image_url) && (
            <button
              onClick={onViewBuilding}
              className="mt-2 w-full py-2 text-[13px] font-medium text-teal hover:text-teal/70 transition-colors text-center"
            >
              View building in 3D →
            </button>
          )}

          {/* Community building generator — upload a photo to create the iso design */}
          {!isLandmark && !event.building_image_url && (
            <label
              className={`mt-2 flex flex-col items-center justify-center gap-1 w-full py-3 rounded-xl border border-dashed border-hairline
                          text-center cursor-pointer hover:bg-ink/[0.03] transition-colors ${uploading ? 'opacity-60 pointer-events-none' : ''}`}
            >
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadBuilding(f);
                  e.target.value = '';
                }}
              />
              <span className="text-[13px] font-medium text-ink">
                {uploading ? 'Generating isometric design…' : '📷 Add this building'}
              </span>
              <span className="text-[11px] text-ink/45">
                {address
                  ? 'Upload a photo → we render its isometric design for the community'
                  : 'Log in to add this building for everyone'}
              </span>
            </label>
          )}
          {uploadErr && <p className="mt-1 text-xs text-live text-center">{uploadErr}</p>}
        </div>

        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 w-7 h-7 rounded-full bg-black/25 backdrop-blur
                     flex items-center justify-center text-white hover:bg-black/40 transition-colors text-lg leading-none"
        >
          ×
        </button>
      </div>
    </>
  );
}

function formatDist(m: number): string {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;
}

/** Google Calendar "add event" template link. */
function buildCalendarUrl(event: Event): string {
  const toGcal = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const start = toGcal(event.starts_at);
  const end = toGcal(event.ends_at ?? new Date(new Date(event.starts_at).getTime() + 3 * 3600_000).toISOString());
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${start}/${end}`,
    location: event.venue_name ?? '',
    details: `${event.description ?? ''}\n\nvia WhatsVP${event.luma_url ? `\n${event.luma_url}` : ''}`.trim(),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function CalendarIcon() {
  return (
    <svg className="w-4 h-4 text-ink/40 flex-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path strokeLinecap="round" d="M3 9h18M8 2.5v4M16 2.5v4" />
    </svg>
  );
}
function PinIcon() {
  return (
    <svg className="w-4 h-4 text-ink/40 flex-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}
function ShareIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v13" />
    </svg>
  );
}
function CalendarPlusIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path strokeLinecap="round" d="M3 9h18M8 2.5v4M16 2.5v4M12 13v4M10 15h4" />
    </svg>
  );
}
