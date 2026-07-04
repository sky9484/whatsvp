-- WhatsVP v4 P5 â€” real money on Sui (self-custodial USDC, event/guild-anchored).
-- Numbered 012 (the brief's draft proposed 011, which collides with the real
-- 011_scenes.sql â€” same renumbering discipline every phase has needed). Run
-- AFTER 011_scenes.sql. Reuses current_profile_id() from 002_auth.sql.

CREATE EXTENSION IF NOT EXISTS citext;

-- â”€â”€ profiles: @handle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Pay-to-@handle resolves a handle â†’ sui_address server-side. citext so
-- @Ana and @ana are the same claim. Claimed via /api/handle (reserved-word
-- + format checks live there), never a direct client write.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS handle CITEXT UNIQUE;
REVOKE UPDATE (handle) ON profiles FROM anon, authenticated;


-- â”€â”€ transfers: server-verified money history â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- A row here means the SERVER fetched the tx by digest and confirmed
-- sender = session address, the coin type, the recipient, and the amount â€”
-- never a client-reported amount (Â§5.2 history integrity, same discipline as
-- the withdrawals table from P0).
CREATE TABLE IF NOT EXISTS transfers (
  id            UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  digest        TEXT UNIQUE NOT NULL,
  from_profile  UUID NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  to_profile    UUID REFERENCES profiles (id) ON DELETE SET NULL,
  to_address    TEXT NOT NULL,
  amount_base   NUMERIC NOT NULL,          -- USDC base units (6dp), server-derived from balance changes
  context_kind  TEXT NOT NULL CHECK (context_kind IN ('direct', 'split', 'dues', 'tip')),
  context_id    TEXT,                      -- split_id / guild_id / event_id, per kind
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transfers_from_idx ON transfers (from_profile, created_at);
CREATE INDEX IF NOT EXISTS transfers_to_idx ON transfers (to_profile, created_at);

ALTER TABLE transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transfers_select_involved"
  ON transfers FOR SELECT
  USING (from_profile = current_profile_id() OR to_profile = current_profile_id());
-- No client INSERT/UPDATE/DELETE â€” every row is written by /api/transfers/verify
-- under the service role after on-chain verification.


-- â”€â”€ splits: the event-room hero flow â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS splits (
  id            UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  creator_id    UUID NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  payee_address TEXT NOT NULL,             -- who everyone pays (the creator's address), snapshotted
  note          TEXT,
  total_base    NUMERIC NOT NULL,          -- USDC base units
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS split_shares (
  id            UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  split_id      UUID NOT NULL REFERENCES splits (id) ON DELETE CASCADE,
  profile_id    UUID NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  amount_base   NUMERIC NOT NULL,
  paid_transfer UUID REFERENCES transfers (id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (split_id, profile_id)
);

CREATE INDEX IF NOT EXISTS split_shares_split_idx ON split_shares (split_id);

ALTER TABLE splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE split_shares ENABLE ROW LEVEL SECURITY;

-- A split (and its shares) is readable by its creator and anyone owing a share.
CREATE POLICY "splits_select_involved"
  ON splits FOR SELECT
  USING (
    creator_id = current_profile_id()
    OR EXISTS (SELECT 1 FROM split_shares WHERE split_shares.split_id = splits.id AND split_shares.profile_id = current_profile_id())
  );
CREATE POLICY "split_shares_select_involved"
  ON split_shares FOR SELECT
  USING (
    profile_id = current_profile_id()
    OR EXISTS (SELECT 1 FROM splits WHERE splits.id = split_shares.split_id AND splits.creator_id = current_profile_id())
  );
-- Creation goes through /api/splits (auto-suggests checked-in participants,
-- snapshots the payee address); paid_transfer is flipped by
-- /api/transfers/verify. No client writes to either table.


-- â”€â”€ guild dues + tips â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS dues_amount_base NUMERIC;
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS dues_period TEXT NOT NULL DEFAULT 'none' CHECK (dues_period IN ('none', 'monthly', 'yearly'));
ALTER TABLE guild_members ADD COLUMN IF NOT EXISTS dues_paid_until TIMESTAMPTZ;

-- dues config is owner-set (guilds_update_owner from 004 already covers it);
-- dues_paid_until is server-written after a verified dues transfer, never self-set.
REVOKE UPDATE (dues_paid_until) ON guild_members FROM anon, authenticated;


-- â”€â”€ chain_ops: mint/sponsor failure log for retry visibility (Â§5.6) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS chain_ops (
  id          UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  op_type     TEXT NOT NULL,   -- 'stamp_mint' | 'guild_badge_mint' | 'sponsor' | ...
  status      TEXT NOT NULL,   -- 'ok' | 'failed'
  detail      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE chain_ops ENABLE ROW LEVEL SECURITY;
-- Service-role only â€” internal ops/retry log, no client access at all.

