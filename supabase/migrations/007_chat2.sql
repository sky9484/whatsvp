-- WhatsVP v3 P4 — Chat 2.0: guild channels (existing) + ephemeral event rooms +
-- DMs between mutuals, plus reactions/reply-to/unread/photo-drops and push
-- subscriptions for PWA notifications.
-- Run AFTER 006_checkins.sql. Reuses current_profile_id() from 002_auth.sql.

-- ── helpers ──────────────────────────────────────────────────────────────────

-- Whether the caller may see/participate in an event's room: RSVP'd or
-- checked in. Evaluated live (not a snapshot) — matches how the rest of the
-- app treats RSVP/check-in status as the current source of truth.
CREATE OR REPLACE FUNCTION can_access_event_room(p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM event_rsvps WHERE event_id = p_event_id AND profile_id = current_profile_id())
      OR EXISTS (SELECT 1 FROM checkins WHERE event_id = p_event_id AND profile_id = current_profile_id())
$$;

-- The room is writable from 24h before start through the event's end
-- (default 3h duration if ends_at is unset, matching getEventStatus's own
-- fallback in lib/utils.ts). Read-only after that; never dropped.
CREATE OR REPLACE FUNCTION event_room_is_open_for_writes(p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT now() >= e.starts_at - INTERVAL '24 hours'
     AND now() <= COALESCE(e.ends_at, e.starts_at + INTERVAL '3 hours')
  FROM events e WHERE e.id = p_event_id
$$;

-- Whether the caller may see a given message, transitively via its room.
CREATE OR REPLACE FUNCTION can_access_message(p_message_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM messages m
    WHERE m.id = p_message_id
      AND (
        (m.topic_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM topics t
          JOIN group_members gm ON gm.group_id = t.group_id
          WHERE t.id = m.topic_id AND gm.profile_id = current_profile_id()
        ))
        OR (m.event_room_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM event_rooms er WHERE er.id = m.event_room_id AND can_access_event_room(er.event_id)
        ))
        OR (m.dm_thread_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM dm_threads dt WHERE dt.id = m.dm_thread_id
            AND (dt.profile_a_id = current_profile_id() OR dt.profile_b_id = current_profile_id())
        ))
      )
  )
$$;


-- ── event_rooms ──────────────────────────────────────────────────────────────
-- One per event, auto-created by the trigger below — never client-inserted.
CREATE TABLE IF NOT EXISTS event_rooms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL UNIQUE REFERENCES events (id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE event_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_rooms_select_if_accessible"
  ON event_rooms FOR SELECT
  USING (can_access_event_room(event_id));

CREATE OR REPLACE FUNCTION create_event_room()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO event_rooms (event_id) VALUES (NEW.id) ON CONFLICT (event_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_create_room ON events;
CREATE TRIGGER events_create_room
  AFTER INSERT ON events
  FOR EACH ROW EXECUTE FUNCTION create_event_room();

-- Backfill rooms for events that already existed before this migration.
INSERT INTO event_rooms (event_id)
SELECT id FROM events
ON CONFLICT (event_id) DO NOTHING;


-- ── friendships ("mutuals") ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS friendships (
  requester_id  UUID NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  addressee_id  UUID NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at  TIMESTAMPTZ,
  PRIMARY KEY (requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);

ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "friendships_select_involved"
  ON friendships FOR SELECT
  USING (requester_id = current_profile_id() OR addressee_id = current_profile_id());

CREATE POLICY "friendships_insert_self_as_requester"
  ON friendships FOR INSERT
  WITH CHECK (requester_id = current_profile_id() AND status = 'pending');

-- Only the addressee can respond; a requester can't self-accept their own request.
CREATE POLICY "friendships_update_addressee_responds"
  ON friendships FOR UPDATE
  USING (addressee_id = current_profile_id())
  WITH CHECK (addressee_id = current_profile_id() AND status IN ('accepted', 'blocked'));

CREATE POLICY "friendships_delete_involved"
  ON friendships FOR DELETE
  USING (requester_id = current_profile_id() OR addressee_id = current_profile_id());


-- ── dm_threads ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dm_threads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_a_id  UUID NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  profile_b_id  UUID NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  disappearing  BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (profile_a_id < profile_b_id),
  UNIQUE (profile_a_id, profile_b_id)
);

ALTER TABLE dm_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dm_threads_select_participant"
  ON dm_threads FOR SELECT
  USING (profile_a_id = current_profile_id() OR profile_b_id = current_profile_id());

-- Participants may toggle disappearing mode on their own thread.
CREATE POLICY "dm_threads_update_participant"
  ON dm_threads FOR UPDATE
  USING (profile_a_id = current_profile_id() OR profile_b_id = current_profile_id())
  WITH CHECK (profile_a_id = current_profile_id() OR profile_b_id = current_profile_id());

-- No client INSERT policy: creating a thread requires a mutual-friendship
-- check across two rows, cleaner to enforce once in /api/dm/start (service
-- role) than to duplicate as an RLS WITH CHECK.


-- ── messages: extend for event rooms + DMs + reply-to + disappearing ─────────
ALTER TABLE messages ADD COLUMN IF NOT EXISTS event_room_id UUID REFERENCES event_rooms (id) ON DELETE CASCADE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS dm_thread_id UUID REFERENCES dm_threads (id) ON DELETE CASCADE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES messages (id) ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS messages_event_room_idx ON messages (event_room_id, created_at);
CREATE INDEX IF NOT EXISTS messages_dm_thread_idx ON messages (dm_thread_id, created_at);

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_exactly_one_room;
ALTER TABLE messages ADD CONSTRAINT messages_exactly_one_room CHECK (
  (CASE WHEN topic_id IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN event_room_id IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN dm_thread_id IS NOT NULL THEN 1 ELSE 0 END) = 1
);

DROP POLICY IF EXISTS "messages_select_members" ON messages;
CREATE POLICY "messages_select_members"
  ON messages FOR SELECT
  USING (
    (topic_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM topics t
      JOIN group_members gm ON gm.group_id = t.group_id
      WHERE t.id = messages.topic_id AND gm.profile_id = current_profile_id()
    ))
    OR (event_room_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM event_rooms er WHERE er.id = messages.event_room_id AND can_access_event_room(er.event_id)
    ))
    OR (dm_thread_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM dm_threads dt WHERE dt.id = messages.dm_thread_id
        AND (dt.profile_a_id = current_profile_id() OR dt.profile_b_id = current_profile_id())
    ))
  );

DROP POLICY IF EXISTS "messages_insert_members" ON messages;
CREATE POLICY "messages_insert_members"
  ON messages FOR INSERT
  WITH CHECK (
    profile_id = current_profile_id()
    AND (
      (topic_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM topics t
        JOIN group_members gm ON gm.group_id = t.group_id
        WHERE t.id = messages.topic_id AND gm.profile_id = current_profile_id()
      ))
      OR (event_room_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM event_rooms er WHERE er.id = messages.event_room_id
          AND can_access_event_room(er.event_id) AND event_room_is_open_for_writes(er.event_id)
      ))
      OR (dm_thread_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM dm_threads dt WHERE dt.id = messages.dm_thread_id
          AND (dt.profile_a_id = current_profile_id() OR dt.profile_b_id = current_profile_id())
      ))
    )
  );

-- Realtime already covers `messages` (enabled in 001_initial.sql).


-- ── message_reactions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS message_reactions (
  message_id  UUID NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
  profile_id  UUID NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  emoji       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, profile_id, emoji)
);

ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reactions_select_if_message_accessible"
  ON message_reactions FOR SELECT
  USING (can_access_message(message_id));

CREATE POLICY "reactions_insert_self"
  ON message_reactions FOR INSERT
  WITH CHECK (profile_id = current_profile_id() AND can_access_message(message_id));

CREATE POLICY "reactions_delete_self"
  ON message_reactions FOR DELETE
  USING (profile_id = current_profile_id());

ALTER PUBLICATION supabase_realtime ADD TABLE message_reactions;


-- ── room_reads (unread counts) ────────────────────────────────────────────────
-- room_key is a synthetic id: 'topic:<uuid>' | 'event:<uuid>' | 'dm:<uuid>' —
-- simpler than mirroring messages' three-nullable-FK shape for a table that's
-- just a per-user read marker with no referential-integrity stakes.
CREATE TABLE IF NOT EXISTS room_reads (
  profile_id    UUID NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  room_key      TEXT NOT NULL,
  last_read_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, room_key)
);

ALTER TABLE room_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "room_reads_self"
  ON room_reads FOR ALL
  USING (profile_id = current_profile_id())
  WITH CHECK (profile_id = current_profile_id());


-- ── event_photos (photo drops, 7-day app-level expiry) ────────────────────────
-- Supabase Storage has no built-in TTL/lifecycle rules, so "expiry" here is an
-- application-level contract: expires_at gates visibility immediately, and a
-- periodic cron (/api/cron/cleanup-expired) deletes the Storage object + row
-- once it's passed. Never silently pretended as a Storage-native feature.
CREATE TABLE IF NOT EXISTS event_photos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_room_id  UUID NOT NULL REFERENCES event_rooms (id) ON DELETE CASCADE,
  profile_id     UUID NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  image_url      TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days')
);

CREATE INDEX IF NOT EXISTS event_photos_room_idx ON event_photos (event_room_id, created_at);

ALTER TABLE event_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_photos_select_if_accessible"
  ON event_photos FOR SELECT
  USING (
    expires_at > now()
    AND EXISTS (SELECT 1 FROM event_rooms er WHERE er.id = event_photos.event_room_id AND can_access_event_room(er.event_id))
  );

CREATE POLICY "event_photos_insert_if_room_open"
  ON event_photos FOR INSERT
  WITH CHECK (
    profile_id = current_profile_id()
    AND EXISTS (
      SELECT 1 FROM event_rooms er WHERE er.id = event_photos.event_room_id
        AND can_access_event_room(er.event_id) AND event_room_is_open_for_writes(er.event_id)
    )
  );

CREATE TABLE IF NOT EXISTS event_photo_reactions (
  photo_id    UUID NOT NULL REFERENCES event_photos (id) ON DELETE CASCADE,
  profile_id  UUID NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (photo_id, profile_id)
);

ALTER TABLE event_photo_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "photo_reactions_select_if_photo_accessible"
  ON event_photo_reactions FOR SELECT
  USING (EXISTS (SELECT 1 FROM event_photos p WHERE p.id = photo_id AND p.expires_at > now()));

CREATE POLICY "photo_reactions_insert_self"
  ON event_photo_reactions FOR INSERT
  WITH CHECK (profile_id = current_profile_id());

CREATE POLICY "photo_reactions_delete_self"
  ON event_photo_reactions FOR DELETE
  USING (profile_id = current_profile_id());


-- ── Storage bucket for event photo drops ──────────────────────────────────────
-- Public bucket (same pattern as 003_buildings.sql's 'buildings' bucket) —
-- real access control lives on the event_photos TABLE row (RSVP'd/checked-in,
-- room open for writes), not on the storage object itself.
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-photos', 'event-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "event_photos_storage_read" ON storage.objects;
CREATE POLICY "event_photos_storage_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'event-photos');

DROP POLICY IF EXISTS "event_photos_storage_insert_authed" ON storage.objects;
CREATE POLICY "event_photos_storage_insert_authed"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'event-photos' AND auth.jwt() ->> 'sub' IS NOT NULL);


-- ── push_subscriptions (PWA web-push) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_profile_idx ON push_subscriptions (profile_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- No client SELECT/INSERT/UPDATE/DELETE policy: an endpoint+keys triple is
-- effectively a bearer credential for sending that person push notifications,
-- so it's managed exclusively via /api/push/subscribe|unsubscribe (service
-- role) — never readable or writable directly by any client role.


-- ── event_reminders_sent (cron dedup) ─────────────────────────────────────────
-- Tracks who has already been sent an "event starting soon" push, so
-- /api/cron/event-reminders (which may run every few minutes) never double-sends.
CREATE TABLE IF NOT EXISTS event_reminders_sent (
  event_id    UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  profile_id  UUID NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, profile_id)
);

ALTER TABLE event_reminders_sent ENABLE ROW LEVEL SECURITY;
-- No client policy at all — written only by the cron route (service role).
