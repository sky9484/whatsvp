-- WhatsVP — building isometric designs (landmark presets + community uploads)
-- Run AFTER 002_auth.sql.

-- ── events: building design fields ────────────────────────────────────────────
ALTER TABLE events ADD COLUMN IF NOT EXISTS building_key TEXT;        -- 'klcc' | 'millerz' | 'mdec'
ALTER TABLE events ADD COLUMN IF NOT EXISTS building_image_url TEXT;  -- community-uploaded photo

-- ── Storage bucket for community building photos ──────────────────────────────
-- Public bucket so the isometric photo card can render on the map.
INSERT INTO storage.buckets (id, name, public)
VALUES ('buildings', 'buildings', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone can read building images (public bucket)
DROP POLICY IF EXISTS "buildings_read" ON storage.objects;
CREATE POLICY "buildings_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'buildings');

-- Any authenticated user (a member of the community) may upload a building photo.
DROP POLICY IF EXISTS "buildings_insert_authed" ON storage.objects;
CREATE POLICY "buildings_insert_authed"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'buildings'
    AND auth.jwt() ->> 'sub' IS NOT NULL
  );
