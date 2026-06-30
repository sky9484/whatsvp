import { unzipSync, strFromU8 } from 'fflate';
import { distanceMetres } from './utils';

/**
 * GTFS engine for KL rapid rail (Prasarana). The data.gov.my feed is
 * FREQUENCY-BASED (headway windows per trip) and has NO realtime feed for
 * rapid-rail-kl, so "next departure" is computed from the static schedule.
 *
 * Source: https://api.data.gov.my/gtfs-static/prasarana?category=rapid-rail-kl
 *
 * Pure functions (parseGtfs, computeNextDeparture) are separated from the
 * network/cache layer (loadGtfs) so the algorithm can be unit-tested against a
 * fixed timestamp + the real static files.
 */

const STATIC_URL =
  'https://api.data.gov.my/gtfs-static/prasarana?category=rapid-rail-kl';

// Malaysia is UTC+8 year-round (no DST) — a fixed offset is correct & deterministic.
const KL_OFFSET_SECONDS = 8 * 3600;

export interface GtfsStop {
  stop_id: string;
  stop_name: string;
  lat: number;
  lon: number;
  route_id: string;
}

export interface GtfsRoute {
  route_id: string;
  short_name: string;
  long_name: string;
  color: string;     // hex without '#'
  category: string;
}

export interface GtfsTrip {
  route_id: string;
  service_id: string;
  trip_id: string;
}

export interface GtfsStopTime {
  trip_id: string;
  stop_id: string;
  departure_seconds: number;
  stop_sequence: number;
}

export interface GtfsFrequency {
  trip_id: string;
  start_seconds: number;
  end_seconds: number;
  headway_secs: number;
}

export interface GtfsCalendar {
  service_id: string;
  days: boolean[]; // [mon..sun]
  start_date: number;
  end_date: number;
}

export interface GtfsData {
  stops: GtfsStop[];
  routes: Map<string, GtfsRoute>;
  trips: Map<string, GtfsTrip>;            // trip_id -> trip
  stopTimesByStop: Map<string, GtfsStopTime[]>; // stop_id -> times
  tripFirstDeparture: Map<string, number>; // trip_id -> earliest departure_seconds
  frequenciesByTrip: Map<string, GtfsFrequency[]>;
  calendar: GtfsCalendar[];
}

export interface DepartureResult {
  station_name: string;
  line_short: string;
  line_long: string;
  line_color: string;      // includes '#'
  distance_m: number;
  next_departure_minutes: number | null;
  headway_minutes: number | null;
}

// ── CSV parsing ───────────────────────────────────────────────────────────────

/** Minimal RFC-4180-ish line splitter (handles double-quoted fields). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      out.push(cur); cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < header.length; j++) row[header[j]] = (cells[j] ?? '').trim();
    rows.push(row);
  }
  return rows;
}

/** "6:00:00" / "26:30:00" -> seconds since midnight (can exceed 86400). */
function gtfsTimeToSeconds(t: string): number {
  const parts = t.split(':');
  if (parts.length !== 3) return NaN;
  return (+parts[0]) * 3600 + (+parts[1]) * 60 + (+parts[2]);
}

// ── Parse the full feed into indexed structures ───────────────────────────────

export function parseGtfs(files: Record<string, string>): GtfsData {
  const stops: GtfsStop[] = parseCsv(files['stops.txt'] ?? '')
    .map((r) => ({
      stop_id: r.stop_id,
      stop_name: r.stop_name,
      lat: parseFloat(r.stop_lat),
      lon: parseFloat(r.stop_lon),
      route_id: r.route_id,
    }))
    .filter((s) => isFinite(s.lat) && isFinite(s.lon));

  const routes = new Map<string, GtfsRoute>();
  for (const r of parseCsv(files['routes.txt'] ?? '')) {
    routes.set(r.route_id, {
      route_id: r.route_id,
      short_name: r.route_short_name || r.route_id,
      long_name: r.route_long_name || '',
      color: r.route_color || '888888',
      category: r.category || '',
    });
    // stop_times.txt references the route by short_name, so index that too.
    if (r.route_short_name && r.route_short_name !== r.route_id) {
      routes.set(r.route_short_name, {
        route_id: r.route_id,
        short_name: r.route_short_name,
        long_name: r.route_long_name || '',
        color: r.route_color || '888888',
        category: r.category || '',
      });
    }
  }

  const trips = new Map<string, GtfsTrip>();
  for (const r of parseCsv(files['trips.txt'] ?? '')) {
    trips.set(r.trip_id, {
      route_id: r.route_id,
      service_id: r.service_id,
      trip_id: r.trip_id,
    });
  }

  const stopTimesByStop = new Map<string, GtfsStopTime[]>();
  const tripFirstDeparture = new Map<string, number>();
  for (const r of parseCsv(files['stop_times.txt'] ?? '')) {
    const dep = gtfsTimeToSeconds(r.departure_time);
    if (!isFinite(dep)) continue;
    const st: GtfsStopTime = {
      trip_id: r.trip_id,
      stop_id: r.stop_id,
      departure_seconds: dep,
      stop_sequence: parseInt(r.stop_sequence, 10) || 0,
    };
    if (!stopTimesByStop.has(r.stop_id)) stopTimesByStop.set(r.stop_id, []);
    stopTimesByStop.get(r.stop_id)!.push(st);

    const prev = tripFirstDeparture.get(r.trip_id);
    if (prev === undefined || dep < prev) tripFirstDeparture.set(r.trip_id, dep);
  }

  const frequenciesByTrip = new Map<string, GtfsFrequency[]>();
  for (const r of parseCsv(files['frequencies.txt'] ?? '')) {
    const f: GtfsFrequency = {
      trip_id: r.trip_id,
      start_seconds: gtfsTimeToSeconds(r.start_time),
      end_seconds: gtfsTimeToSeconds(r.end_time),
      headway_secs: parseInt(r.headway_secs, 10) || 0,
    };
    if (f.headway_secs <= 0) continue;
    if (!frequenciesByTrip.has(r.trip_id)) frequenciesByTrip.set(r.trip_id, []);
    frequenciesByTrip.get(r.trip_id)!.push(f);
  }

  const calendar: GtfsCalendar[] = parseCsv(files['calendar.txt'] ?? '').map((r) => ({
    service_id: r.service_id,
    days: [r.monday, r.tuesday, r.wednesday, r.thursday, r.friday, r.saturday, r.sunday].map(
      (d) => d === '1'
    ),
    start_date: parseInt(r.start_date, 10) || 0,
    end_date: parseInt(r.end_date, 10) || 99999999,
  }));

  return {
    stops,
    routes,
    trips,
    stopTimesByStop,
    tripFirstDeparture,
    frequenciesByTrip,
    calendar,
  };
}

// ── KL local time helpers ─────────────────────────────────────────────────────

interface KlNow {
  secondsSinceMidnight: number;
  dayIndex: number; // 0 = Monday … 6 = Sunday
  yyyymmdd: number;
}

export function klNow(nowMs: number): KlNow {
  const kl = new Date(nowMs + KL_OFFSET_SECONDS * 1000);
  // Use UTC getters on the shifted date to read KL wall-clock.
  const secondsSinceMidnight =
    kl.getUTCHours() * 3600 + kl.getUTCMinutes() * 60 + kl.getUTCSeconds();
  // getUTCDay: 0 = Sunday … 6 = Saturday → convert to 0 = Monday … 6 = Sunday
  const jsDay = kl.getUTCDay();
  const dayIndex = (jsDay + 6) % 7;
  const yyyymmdd =
    kl.getUTCFullYear() * 10000 + (kl.getUTCMonth() + 1) * 100 + kl.getUTCDate();
  return { secondsSinceMidnight, dayIndex, yyyymmdd };
}

function activeServiceIds(gtfs: GtfsData, now: KlNow): Set<string> {
  const active = new Set<string>();
  for (const c of gtfs.calendar) {
    if (now.yyyymmdd < c.start_date || now.yyyymmdd > c.end_date) continue;
    if (c.days[now.dayIndex]) active.add(c.service_id);
  }
  return active;
}

// ── Core: next departure for a venue ──────────────────────────────────────────

export function computeNextDeparture(
  gtfs: GtfsData,
  lat: number,
  lng: number,
  nowMs: number,
  maxStationDistanceM = 2000
): DepartureResult | null {
  if (gtfs.stops.length === 0) return null;

  // 1. Nearest stop
  let nearest: GtfsStop | null = null;
  let minDist = Infinity;
  for (const s of gtfs.stops) {
    const d = distanceMetres(lat, lng, s.lat, s.lon);
    if (d < minDist) { minDist = d; nearest = s; }
  }
  if (!nearest || minDist > maxStationDistanceM) return null;

  const rawStationName = nearest.stop_name;
  // Strip upstream data artifacts like " - REDONE" / " - OLD" from the feed.
  const stationName = rawStationName.replace(/\s*-\s*(REDONE|OLD|NEW|BARU)\s*$/i, '').trim();
  const now = klNow(nowMs);
  const active = activeServiceIds(gtfs, now);
  const nowSec = now.secondsSinceMidnight;

  // 2. All platforms at this station (interchanges share a stop_name).
  //    Match on the RAW feed name; `stationName` is the cleaned display version.
  const platforms = gtfs.stops.filter((s) => s.stop_name === rawStationName);

  // 3. For each platform, find the soonest next departure across active trips
  let best: {
    minutes: number;
    headwayMin: number;
    route: GtfsRoute | undefined;
  } | null = null;

  for (const platform of platforms) {
    const stopTimes = gtfs.stopTimesByStop.get(platform.stop_id) ?? [];
    for (const st of stopTimes) {
      const trip = gtfs.trips.get(st.trip_id);
      if (!trip || !active.has(trip.service_id)) continue;

      const tripStart = gtfs.tripFirstDeparture.get(st.trip_id);
      if (tripStart === undefined) continue;
      const offset = st.departure_seconds - tripStart; // travel time origin → this stop

      const freqs = gtfs.frequenciesByTrip.get(st.trip_id) ?? [];
      for (const f of freqs) {
        // Trains dispatch from origin at f.start + k*headway (while < f.end),
        // reaching this stop at f.start + offset + k*headway.
        // Find smallest such time >= nowSec.
        const firstAtStop = f.start_seconds + offset;
        let candidate: number;
        if (nowSec <= firstAtStop) {
          candidate = firstAtStop;
        } else {
          const k = Math.ceil((nowSec - firstAtStop) / f.headway_secs);
          candidate = firstAtStop + k * f.headway_secs;
        }
        // The dispatching train must leave origin before the window ends.
        const dispatchTime = candidate - offset;
        if (dispatchTime >= f.end_seconds) continue;

        const minutes = Math.round((candidate - nowSec) / 60);
        if (minutes < 0) continue;

        const route =
          gtfs.routes.get(platform.route_id) ?? gtfs.routes.get(trip.route_id);

        if (!best || minutes < best.minutes) {
          best = { minutes, headwayMin: Math.round(f.headway_secs / 60), route };
        }
      }
    }
  }

  // Fall back to the nearest stop's line info if no active departure found
  const fallbackRoute = gtfs.routes.get(nearest.route_id);
  const route = best?.route ?? fallbackRoute;

  return {
    station_name: stationName,
    line_short: route?.short_name ?? '',
    line_long: route?.long_name ?? '',
    line_color: route?.color ? `#${route.color}` : '#0F6E56',
    distance_m: Math.round(minDist),
    next_departure_minutes: best ? best.minutes : null,
    headway_minutes: best ? best.headwayMin : null,
  };
}

// ── Network + cache layer ─────────────────────────────────────────────────────

let cachedGtfs: { data: GtfsData; ts: number } | null = null;
const GTFS_TTL_MS = 12 * 60 * 60 * 1000; // 12h — static schedules rarely change

export async function loadGtfs(): Promise<GtfsData> {
  if (cachedGtfs && Date.now() - cachedGtfs.ts < GTFS_TTL_MS) {
    return cachedGtfs.data;
  }

  const res = await fetch(STATIC_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`GTFS static fetch failed: ${res.status}`);

  const zipBuf = new Uint8Array(await res.arrayBuffer());
  const unzipped = unzipSync(zipBuf);

  const files: Record<string, string> = {};
  for (const [name, bytes] of Object.entries(unzipped)) {
    // Skip macOS metadata + directories
    if (name.startsWith('__MACOSX') || name.endsWith('/')) continue;
    const base = name.split('/').pop()!;
    if (base.endsWith('.txt')) files[base] = strFromU8(bytes);
  }

  const data = parseGtfs(files);
  cachedGtfs = { data, ts: Date.now() };
  return data;
}
