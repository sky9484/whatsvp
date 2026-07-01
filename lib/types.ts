export type EventStatus = 'live' | 'upcoming' | 'past';
export type EventFilter = 'all' | 'live' | 'upcoming';

export interface RawEvent {
  id: string;
  source: 'luma' | 'manual';
  luma_url?: string | null;
  title: string;
  description?: string | null;
  venue_name?: string | null;
  lat: number;
  lng: number;
  starts_at: string;
  ends_at?: string | null;
  cover_url?: string | null;
  host_id?: string | null;
  created_at: string;
  /** Landmark design key (klcc | millerz | mdec) for known buildings. */
  building_key?: string | null;
  /** Community-uploaded building photo → isometric card. */
  building_image_url?: string | null;
  /** Guild this event belongs to, if any. */
  guild_id?: string | null;
}

export interface Event extends RawEvent {
  status: EventStatus;
}

export interface Profile {
  id: string;
  sui_address: string;
  oauth_sub?: string | null;
  display_name: string;
  avatar_url?: string | null;
  created_at: string;
  /** Opt-in, read-only-verified external NFT PFP (v2 Upgrade 4). Never required to onboard. */
  pfp_chain?: string | null;
  pfp_contract?: string | null;
  pfp_token_id?: string | null;
  pfp_image_url?: string | null;
  pfp_verified_at?: string | null;
}

export interface TransitInfo {
  station_name: string;
  line_name: string;        // short name, e.g. "KJL"
  line_long?: string;       // e.g. "LRT Kelana Jaya Line"
  line_color: string;       // includes '#'
  next_departure_minutes: number | null;
  headway_minutes?: number | null; // "a train every N min" (frequency-based)
  distance_m: number;
  realtime?: boolean;       // true if a live feed confirmed it (rapid-rail-kl has none)
}

export interface Guild {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  logo_url?: string | null;
  banner_url?: string | null;
  color?: string | null;
  owner_id?: string | null;
  badge_type?: string | null;
  is_verified?: boolean;
  created_at: string;
  // Optionally joined:
  member_count?: number;
}

export interface GuildMember {
  guild_id: string;
  profile_id: string;
  role: 'owner' | 'admin' | 'member';
  joined_at: string;
  profiles?: { display_name: string; avatar_url?: string | null } | null;
}

export interface Group {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  owner_id?: string | null;
  guild_id?: string | null;
  created_at: string;
}

export interface Topic {
  id: string;
  group_id: string;
  name: string;
  created_at?: string;
}

export interface Message {
  id: string;
  group_id: string;
  topic_id: string;
  profile_id: string;
  body: string;
  created_at: string;
  // Joined for display (optional)
  profiles?: { display_name: string; avatar_url?: string | null } | null;
}

export interface LumaEventData {
  title: string;
  description?: string | null;
  starts_at: string | null;
  ends_at?: string | null;
  venue_name?: string | null;
  lat?: number | null;
  lng?: number | null;
  cover_url?: string | null;
  luma_url: string;
}
