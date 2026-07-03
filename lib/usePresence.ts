'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from './auth';
import { createAuthedClient } from './supabase/client';
import { encodeGeohash } from './geohash';
import type { AvatarConfig } from './types';

export interface NearbyMutual {
  profile_id: string;
  display_name: string;
  avatar_url?: string | null;
  avatar_config?: AvatarConfig | null;
}

/**
 * Area presence (v4 P3 Level 2) — opt-in, ghost by default, mutuals-only,
 * geohash-6 only (~±0.6 km, never a precise point). Toggling off deletes the
 * row entirely (ghost mode = no row, not a hidden/stale one). Heartbeats on
 * mount and on tab foreground while enabled — never continuous background
 * tracking, per the brief's explicit "never" list.
 *
 * "Nearby mutuals" here means an EXACT geohash-6 cell match, not neighboring
 * cells — a deliberate MVP simplification (real neighbor-cell lookup needs a
 * small geohash-neighbor algorithm this pass didn't need to build yet).
 */
export function useAreaPresence() {
  const { profile, token } = useAuth();
  const authed = useMemo(() => createAuthedClient(token), [token]);

  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nearby, setNearby] = useState<NearbyMutual[]>([]);

  // Determine current on/off state from whether a presence row exists.
  useEffect(() => {
    if (!authed || !profile) {
      setLoaded(true);
      return;
    }
    authed
      .from('presence')
      .select('profile_id')
      .eq('profile_id', profile.id)
      .maybeSingle()
      .then(({ data }) => {
        setEnabled(Boolean(data));
        setLoaded(true);
      });
  }, [authed, profile]);

  const postHeartbeat = useCallback(async () => {
    if (!authed || !profile || typeof navigator === 'undefined' || !navigator.geolocation) return;
    const pos = await new Promise<GeolocationPosition | null>((resolve) =>
      navigator.geolocation.getCurrentPosition((p) => resolve(p), () => resolve(null), { timeout: 8000 })
    );
    if (!pos) return;
    const geohash6 = encodeGeohash(pos.coords.latitude, pos.coords.longitude, 6);
    await authed.from('presence').upsert({ profile_id: profile.id, geohash6, updated_at: new Date().toISOString() });
  }, [authed, profile]);

  const toggle = async (on: boolean) => {
    if (!authed || !profile) return;
    setBusy(true);
    try {
      if (on) {
        await postHeartbeat();
        setEnabled(true);
      } else {
        // Ghost mode = the row is gone, not just hidden.
        await authed.from('presence').delete().eq('profile_id', profile.id);
        setEnabled(false);
        setNearby([]);
      }
    } finally {
      setBusy(false);
    }
  };

  // Heartbeat on enable + whenever the tab comes back to the foreground —
  // never a continuous background watch.
  useEffect(() => {
    if (!enabled) return;
    void postHeartbeat();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void postHeartbeat();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [enabled, postHeartbeat]);

  // Mutuals sharing the exact same geohash-6 cell, within the 60-minute TTL.
  useEffect(() => {
    if (!enabled || !authed || !profile) {
      setNearby([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: mine } = await authed.from('presence').select('geohash6').eq('profile_id', profile.id).maybeSingle();
      if (cancelled || !mine?.geohash6) return;
      const cutoff = new Date(Date.now() - 60 * 60_000).toISOString();
      const { data } = await authed
        .from('presence')
        .select('profile_id, updated_at, profiles(display_name, avatar_url, avatar_config)')
        .eq('geohash6', mine.geohash6)
        .gt('updated_at', cutoff)
        .neq('profile_id', profile.id);
      if (cancelled) return;
      setNearby(
        (data ?? []).map((r) => {
          const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
          return { profile_id: r.profile_id, display_name: p?.display_name ?? 'Someone', avatar_url: p?.avatar_url, avatar_config: p?.avatar_config };
        })
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, authed, profile]);

  return { enabled: loaded && enabled, loaded, busy, toggle, nearby };
}
