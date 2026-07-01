-- WhatsVP v2 Upgrade 4 — external-collection PFP (opt-in, read-only EVM verification).
-- Run AFTER 004_guilds.sql.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pfp_chain       TEXT;   -- 'ethereum' | 'polygon' | ...
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pfp_contract    TEXT;   -- collection contract address
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pfp_token_id    TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pfp_image_url   TEXT;   -- rendered as the avatar with a verified ring
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pfp_verified_at TIMESTAMPTZ;

-- These are set ONLY by the server after read-only ownership verification
-- (/api/pfp/verify, service role). A client must never be able to self-assign a
-- "verified" external PFP, so revoke direct writes to these columns.
REVOKE INSERT (pfp_chain, pfp_contract, pfp_token_id, pfp_image_url, pfp_verified_at),
       UPDATE (pfp_chain, pfp_contract, pfp_token_id, pfp_image_url, pfp_verified_at)
  ON profiles FROM anon, authenticated;
