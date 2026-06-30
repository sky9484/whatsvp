import { NextRequest } from 'next/server';
import { loadGtfs, computeNextDeparture } from '@/lib/gtfs';
import type { TransitInfo } from '@/lib/types';

/**
 * GET /api/transit?lat=3.1478&lng=101.6953
 *
 * Returns the nearest KL rapid-rail station + next departure estimate, computed
 * from the data.gov.my GTFS-Static feed (frequency-based: headway windows).
 *
 * ── On realtime ───────────────────────────────────────────────────────────────
 * data.gov.my exposes NO realtime feed for `rapid-rail-kl` (the vehicle-position
 * and trip-updates endpoints 404 for this category — verified). So departures are
 * schedule-derived and `realtime` is false. The static schedule is the source of
 * truth here, exactly as the build brief anticipated. If a feed appears later,
 * overlay it in computeNextDeparture without changing this contract.
 *
 * Per-coordinate result cached 60s; the parsed GTFS is cached 12h in lib/gtfs.
 */

const cache = new Map<string, { data: TransitInfo | null; ts: number }>();
const CACHE_TTL_MS = 60_000;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get('lat') ?? '');
  const lng = parseFloat(searchParams.get('lng') ?? '');

  if (!isFinite(lat) || !isFinite(lng)) {
    return Response.json(
      { error: 'lat and lng are required numeric parameters' },
      { status: 400 }
    );
  }

  const cacheKey = `${lat.toFixed(4)}_${lng.toFixed(4)}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return Response.json({ transit: cached.data });
  }

  try {
    const gtfs = await loadGtfs();
    const result = computeNextDeparture(gtfs, lat, lng, Date.now());

    const transit: TransitInfo | null = result
      ? {
          station_name: result.station_name,
          line_name: result.line_short,
          line_long: result.line_long,
          line_color: result.line_color,
          next_departure_minutes: result.next_departure_minutes,
          headway_minutes: result.headway_minutes,
          distance_m: result.distance_m,
          realtime: false,
        }
      : null;

    cache.set(cacheKey, { data: transit, ts: Date.now() });
    return Response.json({ transit });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[transit] GTFS error:', msg);
    // Don't cache failures — let the next request retry the feed.
    return Response.json({ transit: null, error: 'transit_unavailable' });
  }
}
