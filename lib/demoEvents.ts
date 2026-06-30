import type { RawEvent } from './types';

/**
 * Built-in demo events so the map is fully interactive with NO backend configured
 * (no Supabase, no Luma). Pins, popups, transit, and the isometric landmark
 * buildings all work out of the box. Replaced by live data once Supabase is set.
 *
 * Times are relative to load so some render "live" and some "upcoming".
 */
export function getDemoEvents(): RawEvent[] {
  const now = Date.now();
  const h = 3_600_000;
  const iso = (ms: number) => new Date(now + ms).toISOString();

  const base = (
    id: string,
    title: string,
    venue: string,
    lat: number,
    lng: number,
    startMs: number,
    endMs: number,
    extra: Partial<RawEvent> = {}
  ): RawEvent => ({
    id,
    source: 'manual',
    title,
    venue_name: venue,
    lat,
    lng,
    starts_at: iso(startMs),
    ends_at: iso(endMs),
    created_at: iso(-24 * h),
    description: null,
    cover_url: null,
    luma_url: `https://lu.ma/demo-${id}`,
    ...extra,
  });

  return [
    // Landmarks (hand-authored isometric designs)
    base('klcc', 'Founders Summit @ KLCC', 'Petronas Twin Towers, KLCC', 3.1579, 101.7115, 2 * h, 6 * h, { building_key: 'klcc' }),
    base('millerz', 'Builders Loft @ Millerz Square', 'Millerz Square, Old Klang Road', 3.1015, 101.6766, -0.3 * h, 2 * h, { building_key: 'millerz' }),
    base('mdec', 'Malaysia Digital Meetup @ MDEC', 'MDEC, Cyberjaya', 2.922, 101.655, 24 * h, 27 * h, { building_key: 'mdec' }),
    // Regular events around KL
    base('klcc-demo', 'KL Builders Demo Night', 'KLCC', 3.1587, 101.7137, -0.5 * h, 2 * h),
    base('apw', 'Founder Coffee @ APW Bangsar', 'APW Bangsar', 3.1209, 101.671, 24 * h, 26 * h),
    base('sentral', 'AI Builders Meetup', 'KL Sentral', 3.134, 101.6864, 3 * h, 6 * h),
    base('bb', 'TechStars KL Office Hours', 'Bukit Bintang', 3.1466, 101.7113, 48 * h, 52 * h),
    base('pj', 'Sui Devs PJ', 'Petaling Jaya', 3.1073, 101.6067, -1 * h, 1 * h),
    base('trx', 'Pitch Practice @ TRX', 'Tun Razak Exchange', 3.1421, 101.7242, 5 * h, 8 * h),
  ];
}
