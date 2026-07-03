-- WhatsVP v4 P3 — Avatars (layered, free-first) + Presence (privacy-first).
-- Run AFTER 009_registration.sql. Reuses current_profile_id() from 002_auth.sql.

-- ── avatar_items: the free/premium catalog ──────────────────────────────────
-- World-readable, curated (service-role writes only) — this is the game's
-- asset catalog, not user content.
CREATE TABLE IF NOT EXISTS avatar_items (
  id          TEXT PRIMARY KEY,
  slot        TEXT NOT NULL CHECK (slot IN ('base', 'skin', 'hair', 'top', 'accessory', 'bg')),
  name        TEXT NOT NULL,
  svg_path    TEXT NOT NULL,
  premium     BOOLEAN NOT NULL DEFAULT false,
  -- A real on-chain Move type string for a future per-item Kiosk collection.
  -- Left NULL for every seeded item today — cosmetics.move's Avatar struct is
  -- one generic type, not per-catalog-item variants, so there is no real
  -- per-item type to check yet. The equip route's on-chain-ownership branch
  -- is real and wired for when that Move design exists; today's premium
  -- items unlock only via `granted_items` (milestone rewards) instead.
  kiosk_type  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE avatar_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "avatar_items_select_all" ON avatar_items FOR SELECT USING (true);
-- No client INSERT/UPDATE/DELETE — the catalog is seeded/curated, not user-generated.


-- ── profiles: avatar_config ──────────────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_config JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Every equip (free or premium) goes through /api/avatars/equip, never a
-- direct client write — a direct write could otherwise set any item_id into
-- any slot, including a premium one the caller doesn't own, and RLS has no
-- clean way to express "this JSONB value must reference a non-premium item
-- OR you must own it" without a trigger. Simpler and just as fast in
-- practice: one small POST either way.
REVOKE UPDATE (avatar_config) ON profiles FROM anon, authenticated;


-- ── granted_items: server-granted premium unlocks (milestones, etc.) ────────
CREATE TABLE IF NOT EXISTS granted_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  item_id     TEXT NOT NULL REFERENCES avatar_items (id),
  reason      TEXT,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, item_id)
);

ALTER TABLE granted_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "granted_items_select_self" ON granted_items FOR SELECT USING (profile_id = current_profile_id());
-- No client INSERT/UPDATE/DELETE — grants are a server decision (checkin
-- milestones today), the same "server that verified writes the record"
-- principle as checkins/withdrawals.


-- ── checkins: manual "Leave" for event presence ──────────────────────────────
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS left_at TIMESTAMPTZ;

-- The checked-in person can set (and only set) left_at on their own row —
-- everything else on checkins (method, coords_hash, stamp_*) stays
-- server-write-only, per 006_checkins.sql's original reasoning.
CREATE POLICY "checkins_update_self_leave"
  ON checkins FOR UPDATE
  USING (profile_id = current_profile_id())
  WITH CHECK (profile_id = current_profile_id());
REVOKE UPDATE (event_id, profile_id, method, coords_hash, stamp_minted_at, stamp_tx_digest, created_at) ON checkins FROM anon, authenticated;

-- Event presence ("who's here now") is the brief's one deliberately public-ish
-- signal — readable by anyone logged in, not just the attendee or host, but
-- ONLY for currently-present rows (left_at IS NULL). Past attendance stays
-- restricted to checkins_select_self/checkins_select_host.
CREATE POLICY "checkins_select_here_now"
  ON checkins FOR SELECT
  USING (left_at IS NULL);


-- ── presence: opt-in, mutuals-only, coarse area presence ─────────────────────
-- geohash6 (~±0.6 km) only — never raw coordinates. A NULL geohash6 with a
-- row present just means "toggled on, no fix yet"; deleting the row is how a
-- user goes fully back to ghost mode (client does this when the Settings
-- toggle turns off).
CREATE TABLE IF NOT EXISTS presence (
  profile_id  UUID PRIMARY KEY REFERENCES profiles (id) ON DELETE CASCADE,
  geohash6    TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE presence ENABLE ROW LEVEL SECURITY;

-- Readable by yourself and by accepted mutuals only — never by strangers.
CREATE POLICY "presence_select_self_or_mutual"
  ON presence FOR SELECT
  USING (
    profile_id = current_profile_id()
    OR EXISTS (
      SELECT 1 FROM friendships
      WHERE status = 'accepted'
        AND ((requester_id = current_profile_id() AND addressee_id = presence.profile_id)
          OR (addressee_id = current_profile_id() AND requester_id = presence.profile_id))
    )
  );

CREATE POLICY "presence_upsert_self"
  ON presence FOR INSERT
  WITH CHECK (profile_id = current_profile_id());
CREATE POLICY "presence_update_self"
  ON presence FOR UPDATE
  USING (profile_id = current_profile_id())
  WITH CHECK (profile_id = current_profile_id());
-- Deleting your own row is how "Show my area to mutuals" turning off works —
-- ghost mode means no row at all, not a stale/hidden one.
CREATE POLICY "presence_delete_self"
  ON presence FOR DELETE
  USING (profile_id = current_profile_id());


-- ── seed: a starting free avatar catalog (19 items across 6 slots) ──────────
-- Deliberately smaller than the brief's "~24" suggestion — a real, working
-- catalog now beats padding to a round number; adding more later is just
-- inserting rows + SVG files, the system doesn't care about count.
INSERT INTO avatar_items (id, slot, name, svg_path, premium) VALUES
  ('base_round',    'base', 'Round',        '/avatar/base_round.svg',    false),
  ('base_soft',     'base', 'Soft square',  '/avatar/base_soft.svg',     false),
  ('skin_01',       'skin', 'Tone 1',       '/avatar/skin_01.svg',       false),
  ('skin_02',       'skin', 'Tone 2',       '/avatar/skin_02.svg',       false),
  ('skin_03',       'skin', 'Tone 3',       '/avatar/skin_03.svg',       false),
  ('skin_04',       'skin', 'Tone 4',       '/avatar/skin_04.svg',       false),
  ('hair_short',    'hair', 'Short',        '/avatar/hair_short.svg',    false),
  ('hair_curly',    'hair', 'Curly',        '/avatar/hair_curly.svg',    false),
  ('hair_bun',      'hair', 'Bun',          '/avatar/hair_bun.svg',      false),
  ('hair_shaved',   'hair', 'Shaved',       '/avatar/hair_shaved.svg',   false),
  ('top_tee',       'top',  'Tee',          '/avatar/top_tee.svg',       false),
  ('top_collar',    'top',  'Collar',       '/avatar/top_collar.svg',    false),
  ('top_hoodie',    'top',  'Hoodie',       '/avatar/top_hoodie.svg',    false),
  ('acc_glasses',   'accessory', 'Glasses', '/avatar/acc_glasses.svg',   false),
  ('acc_cap',       'accessory', 'Cap',     '/avatar/acc_cap.svg',       false),
  ('bg_paper',      'bg',   'Paper',        '/avatar/bg_paper.svg',      false),
  ('bg_teal',       'bg',   'Teal',         '/avatar/bg_teal.svg',       false),
  ('bg_coral',      'bg',   'Coral',        '/avatar/bg_coral.svg',      false),
  -- Milestone-only premium items (v3 P3's Passport milestones: 5/10/25 stamps).
  -- Unlocked via granted_items on checkin, never purchasable — seeds the
  -- cosmetic economy before any shop exists.
  ('acc_medal',     'accessory', 'Medal (5 stamps)',    '/avatar/acc_medal.svg',    true),
  ('bg_gold',       'bg',        'Gold (10 stamps)',    '/avatar/bg_gold.svg',      true),
  ('acc_crown',     'accessory', 'Crown (25 stamps)',   '/avatar/acc_crown.svg',    true)
ON CONFLICT (id) DO NOTHING;
