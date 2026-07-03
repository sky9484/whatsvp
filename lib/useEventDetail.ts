'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Event, TransitInfo, AvatarConfig } from './types';
import { useAuth } from './auth';
import { createClient, createAuthedClient } from './supabase/client';
import { resolveLandmark } from './buildings';
import { isCheckinWindowOpen } from './utils';

export interface HereNowAttendee {
  profile_id: string;
  display_name: string;
  avatar_url?: string | null;
  avatar_config?: AvatarConfig | null;
}

/**
 * Shared state + actions for an event's detail view — transit, share, check-in,
 * and the community building-photo upload. Registration (RSVP) moved to
 * lib/useRegistration.ts + RegisterModal.tsx (v4 P2) — used by both EventPopup
 * (desktop card) and EventSheet (mobile bottom sheet) so the underlying
 * data/logic lives in exactly one place.
 */
export function useEventDetail(event: Event, onBuildingImage?: (url: string) => void) {
  const { profile, token, address, login } = useAuth();
  const isLandmark = resolveLandmark(event) !== null;

  const [transit, setTransit] = useState<TransitInfo | null | 'loading'>('loading');
  const [shared, setShared] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState('');
  const [checkedIn, setCheckedIn] = useState(false);
  const [checkinBusy, setCheckinBusy] = useState(false);
  const [checkinError, setCheckinError] = useState('');
  // Event presence (v4 P3 Level 1) — auto-on at check-in, off at "Leave" or event end.
  const [presentNow, setPresentNow] = useState(false);
  const [leavingPresence, setLeavingPresence] = useState(false);
  const [hereNow, setHereNow] = useState<{ count: number; attendees: HereNowAttendee[] }>({ count: 0, attendees: [] });

  const anon = useMemo(() => createClient(), []);
  const authed = useMemo(() => createAuthedClient(token), [token]);

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

  // My check-in status for this event
  useEffect(() => {
    let cancelled = false;
    if (authed && profile) {
      authed
        .from('checkins')
        .select('id, left_at')
        .eq('event_id', event.id)
        .eq('profile_id', profile.id)
        .maybeSingle()
        .then(({ data }) => {
          if (cancelled) return;
          setCheckedIn(Boolean(data));
          setPresentNow(Boolean(data) && !data?.left_at);
        });
    } else {
      setCheckedIn(false);
      setPresentNow(false);
    }
    return () => {
      cancelled = true;
    };
  }, [event.id, authed, profile]);

  // Event presence ("here now") — anyone (even logged out) can see who's
  // currently checked in and hasn't left; RLS scopes this to left_at IS NULL
  // rows only (010_avatars_presence.sql), never full attendance history.
  useEffect(() => {
    let cancelled = false;
    const client = authed ?? anon;
    if (!client) return;
    client
      .from('checkins')
      .select('profile_id, profiles(display_name, avatar_url, avatar_config)')
      .eq('event_id', event.id)
      .is('left_at', null)
      .then(({ data }) => {
        if (cancelled) return;
        const attendees: HereNowAttendee[] = (data ?? []).map((r) => {
          const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
          return {
            profile_id: r.profile_id,
            display_name: p?.display_name ?? 'Someone',
            avatar_url: p?.avatar_url,
            avatar_config: p?.avatar_config,
          };
        });
        setHereNow({ count: attendees.length, attendees });
      });
    return () => {
      cancelled = true;
    };
    // Re-fetch whenever my own presence changes (just checked in / just left).
  }, [event.id, authed, anon, presentNow]);

  const leavePresence = async () => {
    if (!authed || !profile) return;
    setLeavingPresence(true);
    try {
      const { error: err } = await authed
        .from('checkins')
        .update({ left_at: new Date().toISOString() })
        .eq('event_id', event.id)
        .eq('profile_id', profile.id);
      if (!err) setPresentNow(false);
    } finally {
      setLeavingPresence(false);
    }
  };

  const checkinOpen = isCheckinWindowOpen(event) && (event.checkin_methods?.includes('geofence') ?? true);

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

  const checkIn = async () => {
    if (!address) return login();
    if (!authed || !token) {
      setCheckinError('Sign-in session required.');
      return;
    }
    setCheckinError('');
    setCheckinBusy(true);
    try {
      if (!navigator.geolocation) throw new Error('Location is not available on this device.');
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10_000 })
      ).catch((err: GeolocationPositionError) => {
        throw new Error(
          err.code === 1 ? 'Location permission is off — turn it on to check in.' : 'Could not get your location — try again.'
        );
      });

      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          event_id: event.id,
          method: 'geofence',
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }),
      });
      const data = await res.json();
      if (!res.ok && !data.already) throw new Error(data.error ?? 'Check-in failed');
      setCheckedIn(true);
      setPresentNow(true);
    } catch (e) {
      setCheckinError(e instanceof Error ? e.message : 'Check-in failed');
    } finally {
      setCheckinBusy(false);
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

  return {
    address,
    isLandmark,
    transit,
    shared,
    uploading,
    uploadErr,
    checkedIn,
    checkinBusy,
    checkinError,
    checkinOpen,
    presentNow,
    leavingPresence,
    hereNow,
    leavePresence,
    googleMapsUrl,
    wazeUrl,
    calendarUrl,
    uploadBuilding,
    checkIn,
    share,
  };
}

/** Google Calendar "add event" template link. */
export function buildCalendarUrl(event: Event): string {
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
