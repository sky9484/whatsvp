'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Event, TransitInfo } from './types';
import { useAuth } from './auth';
import { createAuthedClient } from './supabase/client';
import { resolveLandmark } from './buildings';
import { isCheckinWindowOpen } from './utils';

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
        .select('id')
        .eq('event_id', event.id)
        .eq('profile_id', profile.id)
        .maybeSingle()
        .then(({ data }) => {
          if (!cancelled) setCheckedIn(Boolean(data));
        });
    } else {
      setCheckedIn(false);
    }
    return () => {
      cancelled = true;
    };
  }, [event.id, authed, profile]);

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
