-- WhatsVP v4 P0 — audit fixes, run before any v4 phase work.
-- (1) guild.move's mint moved server-side (AdminCap-gated, mirrors stamp.move);
--     guild_members gains the same mint-tracking columns checkins already has.
-- (2) withdraw-to-external-wallet gains a server-verified audit trail
--     (history integrity, §5.2 of the v4 brief) instead of trusting the client.
-- Run AFTER 007_chat2.sql. Reuses current_profile_id() from 002_auth.sql.

-- ── guild_members: badge mint tracking ──────────────────────────────────────
ALTER TABLE guild_members ADD COLUMN IF NOT EXISTS badge_minted_at TIMESTAMPTZ;
ALTER TABLE guild_members ADD COLUMN IF NOT EXISTS badge_tx_digest TEXT;

-- Trust columns, same treatment as guilds.is_verified/badge_type and
-- checkins.stamp_*: never client-writable, even via the existing
-- guild_members_update_self_member policy (which only constrains `role`).
REVOKE UPDATE (badge_minted_at, badge_tx_digest) ON guild_members FROM anon, authenticated;


-- ── withdrawals: server-verified audit trail for external-wallet sends ─────
CREATE TABLE IF NOT EXISTS withdrawals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    UUID NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  from_address  TEXT NOT NULL,
  to_address    TEXT NOT NULL,
  amount_mist   NUMERIC NOT NULL,
  digest        TEXT UNIQUE NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS withdrawals_profile_idx ON withdrawals (profile_id, created_at);

ALTER TABLE withdrawals ENABLE ROW LEVEL SECURITY;

-- A user can read their own withdrawal history (Settings → Advanced).
CREATE POLICY "withdrawals_select_self"
  ON withdrawals FOR SELECT
  USING (profile_id = current_profile_id());

-- Deliberately NO client INSERT/UPDATE/DELETE policy: a row here means the
-- server (/api/withdraw/verify) independently fetched the transaction by
-- digest and confirmed the sender matches the caller's session address —
-- the client never gets to assert its own amount/recipient. Same lesson as
-- checkins: a "record" of a real-world (or on-chain) action must be written
-- by the party that verified it, not the party reporting it.
