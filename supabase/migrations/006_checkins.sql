-- WhatsVP v3 P3 — Check-in -> Stamp -> Passport core loop.
-- Run AFTER 005_external_pfp.sql. Reuses current_profile_id() from 002_auth.sql.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── events: check-in configuration ──────────────────────────────────────────
-- checkin_secret is the HMAC key behind the rotating QR code (lib/checkinCode.ts).
-- It must never be readable by any client — only server routes that generate
-- or verify codes may read it, so it's revoked from both client DB roles below.
ALTER TABLE events ADD COLUMN IF NOT EXISTS checkin_secret TEXT NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex');
ALTER TABLE events ADD COLUMN IF NOT EXISTS checkin_methods TEXT[] NOT NULL DEFAULT ARRAY['geofence', 'qr'];

REVOKE SELECT (checkin_secret) ON events FROM anon, authenticated;


-- ── checkins ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS checkins (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  profile_id      UUID NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  method          TEXT NOT NULL CHECK (method IN ('geofence', 'qr')),
  coords_hash     TEXT,                    -- sha256 of coarse-rounded coordinates; never raw lat/lng
  stamp_minted_at TIMESTAMPTZ,
  stamp_tx_digest TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, profile_id)
);

CREATE INDEX IF NOT EXISTS checkins_event_idx ON checkins (event_id, created_at);
CREATE INDEX IF NOT EXISTS checkins_profile_idx ON checkins (profile_id, created_at);

ALTER TABLE checkins ENABLE ROW LEVEL SECURITY;

-- A user can read their own check-ins (Passport page).
CREATE POLICY "checkins_select_self"
  ON checkins FOR SELECT
  USING (profile_id = current_profile_id());

-- An event's host can read all check-ins for their own event (organizer analytics).
CREATE POLICY "checkins_select_host"
  ON checkins FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = checkins.event_id AND events.host_id = current_profile_id()
    )
  );

-- Deliberately NO client INSERT/UPDATE/DELETE policy: a check-in requires
-- server-side verification (QR HMAC or geofence distance + time window), so
-- every write goes through /api/checkin using the service role. Letting a
-- client self-insert a row here would defeat the entire point of a "stamp" —
-- this is the same lesson the guild.move audit taught about ungated mints,
-- applied to the off-chain side of the same feature.
