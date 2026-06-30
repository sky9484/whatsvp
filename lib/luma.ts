import type { LumaEventData } from './types';

const LUMA_API_BASE = 'https://api.lu.ma/public/v1';

/** Convert a raw Luma API entry to a Supabase events table row (returns null if no coords). */
export function lumaEntryToInsertRow(entry: LumaEntry): {
  source: 'luma';
  luma_url: string;
  title: string;
  description: string | null;
  venue_name: string | null;
  lat: number | null;
  lng: number | null;
  starts_at: string;
  ends_at: string | null;
  cover_url: string | null;
} | null {
  const { event } = entry;
  const geo = event.geo_address_info;
  const geoJson = event.geo_address_json;

  const lat = geo?.latitude ? parseFloat(geo.latitude) : (geoJson?.lat ?? null);
  const lng = geo?.longitude ? parseFloat(geo.longitude) : (geoJson?.lon ?? null);

  return {
    source: 'luma',
    luma_url: event.url,
    title: event.name,
    description: event.description ?? null,
    venue_name: geo?.full_address ?? geoJson?.address ?? null,
    lat: lat !== null && isFinite(lat) ? lat : null,
    lng: lng !== null && isFinite(lng) ? lng : null,
    starts_at: event.start_at,
    ends_at: event.end_at ?? null,
    cover_url: event.cover_url ?? null,
  };
}

export interface LumaEntry {
  event: {
    api_id: string;
    name: string;
    description?: string;
    start_at: string;
    end_at?: string;
    cover_url?: string;
    url: string;
    geo_address_info?: {
      full_address?: string;
      latitude?: string;
      longitude?: string;
    };
    geo_address_json?: {
      address?: string;
      lat?: number;
      lon?: number;
    };
  };
}

export async function fetchCalendarEvents(
  calendarId: string,
  apiKey: string
): Promise<LumaEntry[]> {
  const res = await fetch(
    `${LUMA_API_BASE}/calendar/list-events?calendar_api_id=${calendarId}&pagination_limit=100`,
    {
      headers: {
        'x-luma-api-key': apiKey,
        accept: 'application/json',
      },
      // Always fetch fresh for the cron ingestion
      cache: 'no-store',
    }
  );

  if (!res.ok) {
    throw new Error(`Luma API error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  return data.entries ?? [];
}

/** Fetch a single event via the Luma API (needs api_id, not URL slug). */
async function fetchEventById(
  apiId: string,
  apiKey: string
): Promise<LumaEventData | null> {
  const res = await fetch(`${LUMA_API_BASE}/event/get?api_id=${apiId}`, {
    headers: { 'x-luma-api-key': apiKey, accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const { event } = await res.json();
  return lumaEntryToEventData({ event });
}

/** Server-side scrape of a public Luma event page (CORS-safe). */
export async function scrapeLumaPage(url: string): Promise<LumaEventData> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; WhatsVP/1.0; +https://whatsvp.com)',
      Accept: 'text/html',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch Luma page (${res.status}): ${url}`);
  }

  const html = await res.text();
  return parseEventFromHtml(html, url);
}

/** Main entry: try API first (if we have a key), fall back to page scrape. */
export async function resolveLumaEvent(
  url: string,
  apiKey?: string
): Promise<LumaEventData> {
  const slug = extractSlug(url);

  if (apiKey && slug) {
    // Try direct API lookup — works if the slug happens to be the api_id
    const fromApi = await fetchEventById(slug, apiKey).catch(() => null);
    if (fromApi) return fromApi;
  }

  return scrapeLumaPage(url);
}

// ── Parsers ───────────────────────────────────────────────────────────────────

function lumaEntryToEventData(entry: LumaEntry): LumaEventData {
  const { event } = entry;
  const geo = event.geo_address_info;
  const geoJson = event.geo_address_json;

  const lat = geo?.latitude
    ? parseFloat(geo.latitude)
    : geoJson?.lat ?? null;
  const lng = geo?.longitude
    ? parseFloat(geo.longitude)
    : geoJson?.lon ?? null;

  return {
    title: event.name,
    description: event.description ?? null,
    starts_at: event.start_at,
    ends_at: event.end_at ?? null,
    venue_name: geo?.full_address ?? geoJson?.address ?? null,
    lat: isFinite(lat as number) ? (lat as number) : null,
    lng: isFinite(lng as number) ? (lng as number) : null,
    cover_url: event.cover_url ?? null,
    luma_url: event.url,
  };
}

function parseEventFromHtml(html: string, url: string): LumaEventData {
  // 1. Try JSON-LD (schema.org/Event)
  const jsonLdMatches = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  for (const match of jsonLdMatches) {
    try {
      const ld = JSON.parse(match[1]);
      const events = Array.isArray(ld) ? ld : [ld];
      const ev = events.find((e: { '@type'?: string }) => e['@type'] === 'Event');
      if (ev) {
        const geo = ev.location?.geo;
        return {
          title: ev.name ?? 'Untitled Event',
          description: ev.description ?? null,
          starts_at: ev.startDate ?? null,
          ends_at: ev.endDate ?? null,
          venue_name: ev.location?.name ?? ev.location?.address ?? null,
          lat: geo?.latitude ? parseFloat(geo.latitude) : null,
          lng: geo?.longitude ? parseFloat(geo.longitude) : null,
          cover_url: getOgTag(html, 'og:image'),
          luma_url: url,
        };
      }
    } catch {
      // continue to next strategy
    }
  }

  // 2. Try Luma's __NEXT_DATA__ (they use Next.js)
  const nextDataMatch = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
  );
  if (nextDataMatch) {
    try {
      const nd = JSON.parse(nextDataMatch[1]);
      const ev = nd?.props?.pageProps?.event ?? nd?.props?.pageProps?.initialData?.event;
      if (ev) {
        const geo = ev.geo_address_info;
        const geoJson = ev.geo_address_json;
        return {
          title: ev.name ?? 'Untitled Event',
          description: ev.description ?? null,
          starts_at: ev.start_at ?? null,
          ends_at: ev.end_at ?? null,
          venue_name: geo?.full_address ?? geoJson?.address ?? null,
          lat: geo?.latitude ? parseFloat(geo.latitude) : (geoJson?.lat ?? null),
          lng: geo?.longitude ? parseFloat(geo.longitude) : (geoJson?.lon ?? null),
          cover_url: ev.cover_url ?? getOgTag(html, 'og:image'),
          luma_url: url,
        };
      }
    } catch {
      // fall through
    }
  }

  // 3. OG tags only (minimal data)
  return {
    title: getOgTag(html, 'og:title') ?? 'Untitled Event',
    description: getOgTag(html, 'og:description'),
    starts_at: null,
    ends_at: null,
    venue_name: null,
    lat: null,
    lng: null,
    cover_url: getOgTag(html, 'og:image'),
    luma_url: url,
  };
}

function getOgTag(html: string, property: string): string | null {
  const m = html.match(new RegExp(`<meta[^>]+property="${property}"[^>]+content="([^"]+)"`, 'i'))
    ?? html.match(new RegExp(`<meta[^>]+content="([^"]+)"[^>]+property="${property}"`, 'i'));
  return m?.[1] ?? null;
}

function extractSlug(url: string): string | null {
  try {
    const u = new URL(url);
    return u.pathname.replace(/^\//, '').split('/')[0] || null;
  } catch {
    return null;
  }
}
