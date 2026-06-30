-- WhatsVP initial schema
-- Run via: supabase db push  (or paste into the Supabase SQL editor)

-- ── profiles ──────────────────────────────────────────────────────────────────
-- One row per zkLogin user. Created on first login.
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sui_address   TEXT UNIQUE NOT NULL,
  oauth_sub     TEXT UNIQUE,
  display_name  TEXT NOT NULL,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Anyone can read profiles (display names, avatars)
CREATE POLICY "profiles_select_all"
  ON profiles FOR SELECT USING (true);

-- Only the owning user (matched via oauth_sub stored in JWT claim) can update
CREATE POLICY "profiles_update_self"
  ON profiles FOR UPDATE
  USING (auth.jwt() ->> 'sub' = oauth_sub);

-- Service role handles inserts on first login
CREATE POLICY "profiles_insert_service"
  ON profiles FOR INSERT
  WITH CHECK (auth.role() = 'service_role');


-- ── events ────────────────────────────────────────────────────────────────────
-- Map pins. Source is 'luma' (ingested by cron) or 'manual' (via organize flow).
-- Status is derived from timestamps in application code (avoids non-deterministic
-- generated columns which Postgres forbids with now()).
CREATE TABLE IF NOT EXISTS events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source      TEXT NOT NULL CHECK (source IN ('luma', 'manual')),
  luma_url    TEXT UNIQUE,               -- deduplicate Luma imports
  title       TEXT NOT NULL,
  description TEXT,
  venue_name  TEXT,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  starts_at   TIMESTAMPTZ NOT NULL,
  ends_at     TIMESTAMPTZ,
  cover_url   TEXT,
  host_id     UUID REFERENCES profiles (id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_starts_at_idx ON events (starts_at);
-- Spatial index on coordinates for nearby queries
CREATE INDEX IF NOT EXISTS events_location_idx ON events USING btree (lat, lng);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- World-readable map pins
CREATE POLICY "events_select_all"
  ON events FOR SELECT USING (true);

-- Only the host or service role can insert/update
CREATE POLICY "events_insert_service_or_host"
  ON events FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR host_id = (
      SELECT id FROM profiles WHERE oauth_sub = auth.jwt() ->> 'sub'
    )
  );

CREATE POLICY "events_update_host_or_service"
  ON events FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR host_id = (
      SELECT id FROM profiles WHERE oauth_sub = auth.jwt() ->> 'sub'
    )
  );


-- ── groups ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  color       TEXT DEFAULT '#1D9E75',
  owner_id    UUID REFERENCES profiles (id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "groups_select_all" ON groups FOR SELECT USING (true);

CREATE POLICY "groups_insert_auth"
  ON groups FOR INSERT
  WITH CHECK (
    owner_id = (
      SELECT id FROM profiles WHERE oauth_sub = auth.jwt() ->> 'sub'
    )
  );


-- ── group_members ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS group_members (
  group_id    UUID REFERENCES groups (id) ON DELETE CASCADE,
  profile_id  UUID REFERENCES profiles (id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, profile_id)
);

ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "group_members_select_members"
  ON group_members FOR SELECT
  USING (
    profile_id = (
      SELECT id FROM profiles WHERE oauth_sub = auth.jwt() ->> 'sub'
    )
    OR EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_members.group_id
        AND gm.profile_id = (
          SELECT id FROM profiles WHERE oauth_sub = auth.jwt() ->> 'sub'
        )
    )
  );


-- ── topics ────────────────────────────────────────────────────────────────────
-- Communities inside a group (Telegram-style channels)
CREATE TABLE IF NOT EXISTS topics (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID REFERENCES groups (id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "topics_select_members"
  ON topics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_id = topics.group_id
        AND profile_id = (
          SELECT id FROM profiles WHERE oauth_sub = auth.jwt() ->> 'sub'
        )
    )
  );


-- ── messages ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID REFERENCES groups (id) ON DELETE CASCADE,
  topic_id    UUID REFERENCES topics (id) ON DELETE CASCADE,
  profile_id  UUID REFERENCES profiles (id),
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_group_topic_idx ON messages (group_id, topic_id, created_at);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages_select_members"
  ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_id = messages.group_id
        AND profile_id = (
          SELECT id FROM profiles WHERE oauth_sub = auth.jwt() ->> 'sub'
        )
    )
  );

CREATE POLICY "messages_insert_members"
  ON messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_id = messages.group_id
        AND profile_id = (
          SELECT id FROM profiles WHERE oauth_sub = auth.jwt() ->> 'sub'
        )
    )
    AND profile_id = (
      SELECT id FROM profiles WHERE oauth_sub = auth.jwt() ->> 'sub'
    )
  );


-- ── event_rsvps ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_rsvps (
  event_id    UUID REFERENCES events (id) ON DELETE CASCADE,
  profile_id  UUID REFERENCES profiles (id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, profile_id)
);

ALTER TABLE event_rsvps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rsvps_select_all" ON event_rsvps FOR SELECT USING (true);

CREATE POLICY "rsvps_insert_self"
  ON event_rsvps FOR INSERT
  WITH CHECK (
    profile_id = (
      SELECT id FROM profiles WHERE oauth_sub = auth.jwt() ->> 'sub'
    )
  );

CREATE POLICY "rsvps_delete_self"
  ON event_rsvps FOR DELETE
  USING (
    profile_id = (
      SELECT id FROM profiles WHERE oauth_sub = auth.jwt() ->> 'sub'
    )
  );


-- ── Realtime ──────────────────────────────────────────────────────────────────
-- Enable Realtime on messages for Phase 5 chat
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
