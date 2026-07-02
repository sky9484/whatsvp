import type { RawEvent } from './types';

/**
 * Built-in demo events so the map is fully interactive with NO backend configured
 * (no Supabase, no Luma). Pins, popups, transit, and the isometric landmark
 * buildings all work out of the box. Replaced by live data once Supabase is set.
 *
 * Times are relative to load so some render "live" and some "upcoming".
 *
 * WhatsVP is horizontal community infrastructure — the seed set is deliberately
 * mixed (run club, photography, sport, food, student society, hobby, founders,
 * tech) so a first-time visitor never mistakes this for a crypto-only app. A
 * Web3 meetup is one community among many, not the default.
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
    // Landmarks (hand-authored isometric designs) — tech/founders community
    base('klcc', 'Founders Summit @ KLCC', 'Petronas Twin Towers, KLCC', 3.1579, 101.7115, 2 * h, 6 * h, { building_key: 'klcc' }),
    base('millerz', 'Builders Loft @ Millerz Square', 'Millerz Square, Old Klang Road', 3.1015, 101.6766, -0.3 * h, 2 * h, { building_key: 'millerz' }),
    base('mdec', 'Malaysia Digital Meetup @ MDEC', 'MDEC, Cyberjaya', 2.922, 101.655, 24 * h, 27 * h, { building_key: 'mdec' }),

    // Run club — Desa ParkCity
    base('run-morning', 'Morning Run Club', 'Desa ParkCity, Kuala Lumpur', 3.1691, 101.6297, -0.5 * h, 1.5 * h),
    base('run-sunset', 'Sunset 5K', 'Desa ParkCity, Kuala Lumpur', 3.1691, 101.6297, 30 * h, 31.5 * h),

    // Photography — Merdeka Square
    base('photo-heritage', 'Heritage Walk: Merdeka Square', 'Dataran Merdeka, Kuala Lumpur', 3.1478, 101.6953, 4 * h, 6 * h),
    base('photo-goldenhour', 'Golden Hour Shoot @ KLCC Park', 'KLCC Park, Kuala Lumpur', 3.1553, 101.7132, 27 * h, 29 * h),

    // Badminton — Setapak
    base('badminton-setapak', 'Badminton Night', 'Setapak Sports Complex, Kuala Lumpur', 3.1928, 101.718, 3 * h, 5 * h),

    // Startup coffee — Bangsar (founders community)
    base('coffee-bangsar', 'Founders Coffee', 'APW Bangsar, Kuala Lumpur', 3.1209, 101.671, -1 * h, 1 * h),

    // Food crawl — Petaling Street
    base('food-petaling', 'Petaling Street Food Crawl', 'Petaling Street, Kuala Lumpur', 3.1435, 101.6959, 6 * h, 8 * h),
    base('food-pasarmalam', 'Pasar Malam Trail', 'SS2 Pasar Malam, Petaling Jaya', 3.1177, 101.6234, 51 * h, 53 * h),

    // Student society — Universiti Malaya
    base('um-mixer', 'UM Students Society Mixer', 'Universiti Malaya, Kuala Lumpur', 3.1209, 101.6535, 29 * h, 31 * h),

    // Board games — SS15 Subang Jaya
    base('boardgames-ss15', 'Board Games Night', 'SS15 Courtyard, Subang Jaya', 3.0733, 101.586, 5 * h, 8 * h),

    // Tech/Web3 — one community among many
    base('web3-pj', 'Sui Devs PJ', 'Petaling Jaya', 3.1073, 101.6067, -0.75 * h, 1 * h),
    base('ai-sentral', 'AI Builders Meetup', 'KL Sentral', 3.134, 101.6864, 8 * h, 11 * h),
  ];
}
