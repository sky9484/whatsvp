import { NextRequest } from 'next/server';
import { after } from 'next/server';
import crypto from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/apiAuth';
import { verifyCheckinCode } from '@/lib/checkinCode';
import { mintStampServerSide } from '@/lib/sui-admin';
import { distanceMetres, isCheckinWindowOpen } from '@/lib/utils';

const GEOFENCE_RADIUS_M = 300;

// Best-effort, per-warm-instance-only rate limit. Not a durable/shared store —
// the real defense against duplicate check-ins is the DB UNIQUE constraint;
// this just guards against a runaway client retry loop.
const attempts = new Map<string, number[]>();
function tooManyAttempts(profileId: string): boolean {
  const now = Date.now();
  const recent = (attempts.get(profileId) ?? []).filter((t) => now - t < 5 * 60_000);
  recent.push(now);
  attempts.set(profileId, recent);
  return recent.length > 10;
}

/**
 * POST /api/checkin — verify real-world attendance and record it.
 * Body: { event_id, method: 'geofence'|'qr', code? (qr), lat?/lng? (geofence) }
 *
 * On success, fire-and-forgets a Stamp mint via the backend-held AdminCap
 * (lib/sui-admin.ts) — the check-in row is what matters and is already
 * committed by the time we respond; a mint failure never undoes it.
 */
export async function POST(request: NextRequest) {
  let supabase;
  try {
    supabase = createServiceClient();
  } catch {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const me = await requireProfile(request, supabase);
  if (!me) return Response.json({ error: 'Log in to check in.' }, { status: 401 });

  if (tooManyAttempts(me.profileId)) {
    return Response.json({ error: 'Too many attempts — wait a few minutes and try again.' }, { status: 429 });
  }

  let body: { event_id?: string; method?: 'geofence' | 'qr'; code?: string; lat?: number; lng?: number };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { event_id, method } = body;
  if (!event_id || (method !== 'geofence' && method !== 'qr')) {
    return Response.json({ error: 'event_id and a valid method are required' }, { status: 400 });
  }

  const { data: event } = await supabase
    .from('events')
    .select('id, title, lat, lng, starts_at, ends_at, checkin_secret, checkin_methods')
    .eq('id', event_id)
    .maybeSingle();
  if (!event) return Response.json({ error: 'Event not found' }, { status: 404 });

  if (!event.checkin_methods?.includes(method)) {
    return Response.json({ error: 'This check-in method is not enabled for this event.' }, { status: 400 });
  }

  const now = Date.now();
  if (!isCheckinWindowOpen(event, now)) {
    return Response.json({ error: "Check-in isn't open for this event right now." }, { status: 409 });
  }

  let coordsHash: string | null = null;

  if (method === 'qr') {
    if (!body.code || !verifyCheckinCode(event.checkin_secret, event.id, body.code, now)) {
      return Response.json({ error: 'That code has expired — ask the organizer to refresh it.' }, { status: 400 });
    }
  } else {
    if (typeof body.lat !== 'number' || typeof body.lng !== 'number') {
      return Response.json({ error: 'Location is required for this check-in method.' }, { status: 400 });
    }
    const distance = distanceMetres(body.lat, body.lng, event.lat, event.lng);
    if (distance > GEOFENCE_RADIUS_M) {
      return Response.json({ error: "You're not close enough to this event to check in." }, { status: 409 });
    }
    // Never store raw coordinates — only a coarse, one-way hash (~110m grid).
    const rounded = `${body.lat.toFixed(3)},${body.lng.toFixed(3)}`;
    coordsHash = crypto.createHash('sha256').update(rounded).digest('hex');
  }

  const { data: checkin, error } = await supabase
    .from('checkins')
    .insert({ event_id: event.id, profile_id: me.profileId, method, coords_hash: coordsHash })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return Response.json({ error: "You're already checked in.", already: true }, { status: 409 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  after(async () => {
    const attempt = async () => mintStampServerSide(me.address, event.id, event.title);
    let result = await attempt();
    if (!result.minted && result.reason !== 'not_configured') {
      await new Promise((r) => setTimeout(r, 2000));
      result = await attempt(); // one retry — best-effort, not a durable queue
    }
    if (result.minted) {
      await supabase
        .from('checkins')
        .update({ stamp_minted_at: new Date().toISOString(), stamp_tx_digest: result.digest })
        .eq('id', checkin.id);
    } else if (result.reason !== 'not_configured') {
      console.warn('[checkin] stamp mint failed:', result.reason);
    }
  });

  return Response.json({ ok: true, checkin });
}
