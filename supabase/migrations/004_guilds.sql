-- WhatsVP v2 — Guilds: a community's branded home on the map.
-- Run AFTER 003_buildings.sql. Reuses current_profile_id() from 002_auth.sql.

-- ── guilds ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guilds (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT,
  logo_url     TEXT,
  banner_url   TEXT,
  color        TEXT DEFAULT '#1D9E75',
  owner_id     UUID REFERENCES profiles (id),
  badge_type   TEXT,                 -- Move object type of this guild's GuildBadge (Upgrade 3)
  is_verified  BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guilds_slug_idx ON guilds (slug);

ALTER TABLE guilds ENABLE ROW LEVEL SECURITY;

-- Guilds are world-readable (public communities, discoverable on the map)
CREATE POLICY "guilds_select_all" ON guilds FOR SELECT USING (true);

-- Only the creator may create their guild (owner_id must be them).
-- is_verified must start false — verification is a service-role-only action.
CREATE POLICY "guilds_insert_owner"
  ON guilds FOR INSERT
  WITH CHECK (owner_id = current_profile_id() AND is_verified IS NOT TRUE);

-- Only the owner may edit branding (Postgres reuses USING as the WITH CHECK here)
CREATE POLICY "guilds_update_owner"
  ON guilds FOR UPDATE
  USING (owner_id = current_profile_id());

-- Trust / on-chain columns are never client-writable — only the service role
-- (cron, seed, admin) may set the verified badge or the on-chain badge type.
-- Prevents a user forging the ✓ Verified mark via a direct authenticated insert/update.
REVOKE INSERT (is_verified, badge_type), UPDATE (is_verified, badge_type)
  ON guilds FROM anon, authenticated;


-- ── guild_members ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guild_members (
  guild_id    UUID REFERENCES guilds (id) ON DELETE CASCADE,
  profile_id  UUID REFERENCES profiles (id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, profile_id)
);

ALTER TABLE guild_members ENABLE ROW LEVEL SECURITY;

-- Public roster (member counts / lists are visible to all)
CREATE POLICY "guild_members_select_all" ON guild_members FOR SELECT USING (true);

-- A user may add only their OWN membership and only as a plain 'member'.
-- Elevated roles ('owner'/'admin') are assigned by the service role
-- (create route sets 'owner'), so a direct client insert can't forge them.
CREATE POLICY "guild_members_insert_self"
  ON guild_members FOR INSERT
  WITH CHECK (profile_id = current_profile_id() AND role = 'member');

-- Members can't self-promote: block client role changes (owner mgmt is service-role).
CREATE POLICY "guild_members_update_self_member"
  ON guild_members FOR UPDATE
  USING (profile_id = current_profile_id())
  WITH CHECK (profile_id = current_profile_id() AND role = 'member');

CREATE POLICY "guild_members_delete_self"
  ON guild_members FOR DELETE
  USING (profile_id = current_profile_id());


-- ── attach existing entities to a guild ───────────────────────────────────────
ALTER TABLE groups ADD COLUMN IF NOT EXISTS guild_id UUID REFERENCES guilds (id) ON DELETE SET NULL;
ALTER TABLE events ADD COLUMN IF NOT EXISTS guild_id UUID REFERENCES guilds (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS events_guild_idx ON events (guild_id);
CREATE INDEX IF NOT EXISTS groups_guild_idx ON groups (guild_id);
