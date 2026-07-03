-- WhatsVP v4 P4 — Scenes: check-in-gated proof-of-presence media.
-- Numbered 011 (the brief's draft proposed 010, which collides with the real
-- 010_avatars_presence.sql — same renumbering discipline every phase has
-- needed). Run AFTER 010_avatars_presence.sql.

-- ── scenes ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scenes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  profile_id    UUID NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('photo', 'video')),
  storage_path  TEXT NOT NULL,
  duration_s    INT,
  hidden        BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scenes_event_idx ON scenes (event_id, created_at);
CREATE INDEX IF NOT EXISTS scenes_profile_event_idx ON scenes (profile_id, event_id);

ALTER TABLE scenes ENABLE ROW LEVEL SECURITY;

-- Read = logged-in users (never fully public — matches the private 'scenes'
-- Storage bucket below). Hidden scenes are simply excluded here.
CREATE POLICY "scenes_select_logged_in"
  ON scenes FOR SELECT
  USING (auth.jwt() ->> 'sub' IS NOT NULL AND hidden = false);
-- An organizer can also see their own event's hidden scenes (for moderation review).
CREATE POLICY "scenes_select_host_incl_hidden"
  ON scenes FOR SELECT
  USING (EXISTS (SELECT 1 FROM events WHERE events.id = scenes.event_id AND events.host_id = current_profile_id()));

-- No client INSERT — the 10-scenes-per-user-per-event cap and duration/kind
-- validation are real invariants, so creation goes through /api/scenes
-- (service role), same reasoning as registration's capacity check.
-- No client UPDATE/DELETE either — hiding happens via reports/moderation
-- (server-side), never a self-edit.


-- ── scene_reactions ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scene_reactions (
  scene_id    UUID NOT NULL REFERENCES scenes (id) ON DELETE CASCADE,
  profile_id  UUID NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  emoji       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (scene_id, profile_id, emoji)
);

ALTER TABLE scene_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scene_reactions_select_logged_in" ON scene_reactions FOR SELECT USING (auth.jwt() ->> 'sub' IS NOT NULL);
-- Reacting has no invariant beyond "you own this reaction" — direct client write, like message_reactions.
CREATE POLICY "scene_reactions_insert_self" ON scene_reactions FOR INSERT WITH CHECK (profile_id = current_profile_id());
CREATE POLICY "scene_reactions_delete_self" ON scene_reactions FOR DELETE USING (profile_id = current_profile_id());


-- ── scene_reports ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scene_reports (
  scene_id    UUID NOT NULL REFERENCES scenes (id) ON DELETE CASCADE,
  profile_id  UUID NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (scene_id, profile_id)
);

ALTER TABLE scene_reports ENABLE ROW LEVEL SECURITY;
-- No client SELECT — reports are moderation data, not something to browse.
-- No client INSERT — auto-hide-at-3 is a real invariant, so reporting goes
-- through /api/scenes/report (service role).


-- ── moderation_actions: audit log ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS moderation_actions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_profile_id  UUID REFERENCES profiles (id),
  action            TEXT NOT NULL, -- 'auto_hide_reports' | 'host_remove' | 'block'
  target_type       TEXT NOT NULL, -- 'scene' | 'profile'
  target_id         TEXT NOT NULL,
  reason            TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE moderation_actions ENABLE ROW LEVEL SECURITY;
-- Service-role only, full stop — this is an internal audit trail.


-- ── profile_blocks: per-user block (Scenes moderation) ───────────────────────
CREATE TABLE IF NOT EXISTS profile_blocks (
  blocker_id  UUID NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  blocked_id  UUID NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

ALTER TABLE profile_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profile_blocks_select_self" ON profile_blocks FOR SELECT USING (blocker_id = current_profile_id());
CREATE POLICY "profile_blocks_insert_self" ON profile_blocks FOR INSERT WITH CHECK (blocker_id = current_profile_id());
CREATE POLICY "profile_blocks_delete_self" ON profile_blocks FOR DELETE USING (blocker_id = current_profile_id());


-- ── Storage bucket 'scenes' — PRIVATE (read = logged-in users, not public) ───
INSERT INTO storage.buckets (id, name, public)
VALUES ('scenes', 'scenes', false)
ON CONFLICT (id) DO NOTHING;

-- Path convention: scenes/<event_id>/<uuid>.<ext> — write gated on the
-- uploader actually being checked in to THAT event, enforced at the storage
-- layer itself (defense in depth on top of the /api/scenes metadata check).
DROP POLICY IF EXISTS "scenes_storage_insert_checked_in" ON storage.objects;
CREATE POLICY "scenes_storage_insert_checked_in"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'scenes'
    AND EXISTS (
      SELECT 1 FROM checkins
      WHERE checkins.profile_id = current_profile_id()
        AND checkins.event_id::text = (storage.foldername(name))[1]
    )
  );

-- Reads happen via server-issued signed URLs (/api/scenes GET), not direct
-- public URLs — this policy just lets the service role (which bypasses RLS
-- anyway) and a logged-in user's own signed-URL redemption work correctly.
DROP POLICY IF EXISTS "scenes_storage_select_logged_in" ON storage.objects;
CREATE POLICY "scenes_storage_select_logged_in"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'scenes' AND auth.jwt() ->> 'sub' IS NOT NULL);
