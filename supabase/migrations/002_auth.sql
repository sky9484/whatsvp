-- WhatsVP Phase 2 — align RLS with the minted session JWT.
--
-- The session token from /api/auth/session carries `sub` = the user's Sui address
-- (the stable identifier available from the Enoki zkLogin wallet). 001 keyed its
-- auth policies on `oauth_sub`; this migration re-points them at `sui_address` via
-- a helper so RLS recognises authenticated users in later phases (RSVPs, chat).
--
-- Run AFTER 001_initial.sql.

-- ── helper: the calling user's profile id, from the JWT `sub` (= sui_address) ──
CREATE OR REPLACE FUNCTION current_profile_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM profiles WHERE sui_address = auth.jwt() ->> 'sub'
$$;

-- ── profiles ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "profiles_update_self" ON profiles;
CREATE POLICY "profiles_update_self"
  ON profiles FOR UPDATE
  USING (auth.jwt() ->> 'sub' = sui_address);

-- ── events ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "events_insert_service_or_host" ON events;
CREATE POLICY "events_insert_service_or_host"
  ON events FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR host_id = current_profile_id()
  );

DROP POLICY IF EXISTS "events_update_host_or_service" ON events;
CREATE POLICY "events_update_host_or_service"
  ON events FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR host_id = current_profile_id()
  );

-- ── groups ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "groups_insert_auth" ON groups;
CREATE POLICY "groups_insert_auth"
  ON groups FOR INSERT
  WITH CHECK (owner_id = current_profile_id());

-- ── group_members ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "group_members_select_members" ON group_members;
CREATE POLICY "group_members_select_members"
  ON group_members FOR SELECT
  USING (
    profile_id = current_profile_id()
    OR EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_members.group_id
        AND gm.profile_id = current_profile_id()
    )
  );

-- ── topics ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "topics_select_members" ON topics;
CREATE POLICY "topics_select_members"
  ON topics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_id = topics.group_id
        AND profile_id = current_profile_id()
    )
  );

-- ── messages ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "messages_select_members" ON messages;
CREATE POLICY "messages_select_members"
  ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_id = messages.group_id
        AND profile_id = current_profile_id()
    )
  );

DROP POLICY IF EXISTS "messages_insert_members" ON messages;
CREATE POLICY "messages_insert_members"
  ON messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_id = messages.group_id
        AND profile_id = current_profile_id()
    )
    AND profile_id = current_profile_id()
  );

-- ── event_rsvps ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "rsvps_insert_self" ON event_rsvps;
CREATE POLICY "rsvps_insert_self"
  ON event_rsvps FOR INSERT
  WITH CHECK (profile_id = current_profile_id());

DROP POLICY IF EXISTS "rsvps_delete_self" ON event_rsvps;
CREATE POLICY "rsvps_delete_self"
  ON event_rsvps FOR DELETE
  USING (profile_id = current_profile_id());
