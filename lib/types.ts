export type EventStatus = 'live' | 'upcoming' | 'past';
/** Time-scrubber segments (v3 Map 2.0) — Live now / Today / Tomorrow / This week / Past 10 days. */
export type EventFilter = 'live' | 'today' | 'tomorrow' | 'week' | 'past10';

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
  /** Which check-in methods are enabled (v3 P3) — never includes checkin_secret. */
  checkin_methods?: string[] | null;
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
  group_id?: string | null;
  topic_id?: string | null;
  event_room_id?: string | null;
  dm_thread_id?: string | null;
  reply_to_id?: string | null;
  expires_at?: string | null;
  profile_id: string;
  body: string;
  created_at: string;
  // Joined for display (optional)
  profiles?: { display_name: string; avatar_url?: string | null } | null;
}

/** One reaction on a message (v3 P4). */
export interface MessageReaction {
  message_id: string;
  profile_id: string;
  emoji: string;
}

/** A per-event ephemeral chat room (v3 P4) — auto-created, access = RSVP'd or checked-in. */
export interface EventRoom {
  id: string;
  event_id: string;
  created_at: string;
}

/** A friend request/connection (v3 P4). "Mutuals" = status === 'accepted'. */
export interface Friendship {
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'blocked';
  created_at: string;
  responded_at?: string | null;
  // Joined for display (optional)
  requester?: { display_name: string; avatar_url?: string | null } | null;
  addressee?: { display_name: string; avatar_url?: string | null } | null;
}

/** A DM thread between two profiles (v3 P4). */
export interface DmThread {
  id: string;
  profile_a_id: string;
  profile_b_id: string;
  disappearing: boolean;
  created_at: string;
}

/** A photo dropped in an event room (v3 P4) — 7-day app-level expiry. */
export interface EventPhoto {
  id: string;
  event_room_id: string;
  profile_id: string;
  image_url: string;
  created_at: string;
  expires_at: string;
  reaction_count?: number;
}

/** A verified check-in (v3 P3) — the source of truth behind a Stamp. */
export interface Checkin {
  id: string;
  event_id: string;
  profile_id: string;
  method: 'geofence' | 'qr';
  created_at: string;
  stamp_minted_at?: string | null;
  stamp_tx_digest?: string | null;
  // Optionally joined for display:
  events?: Pick<RawEvent, 'id' | 'title' | 'venue_name' | 'starts_at' | 'ends_at' | 'cover_url'> | null;
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
