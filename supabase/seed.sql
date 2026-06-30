-- Dev seed data — a handful of real KL venues so the map shows pins before
-- Luma ingestion is wired up. Run AFTER 001_initial.sql:
--   psql "$DATABASE_URL" -f supabase/seed.sql
-- or paste into the Supabase SQL editor.
--
-- Times are relative to now() so some render as "live" and some as "upcoming".

INSERT INTO events (source, luma_url, title, description, venue_name, lat, lng, starts_at, ends_at, cover_url)
VALUES
  ('manual', 'https://lu.ma/seed-klcc-demo',
   'KL Builders Demo Night',
   'Monthly demo night for KL founders shipping product. Lightning demos + open networking.',
   'KLCC, Kuala Lumpur',
   3.1579, 101.7121,
   now() - interval '30 minutes', now() + interval '2 hours', NULL),

  ('manual', 'https://lu.ma/seed-apw-coffee',
   'Founder Coffee @ APW Bangsar',
   'Casual Saturday coffee for early-stage founders. Just turn up.',
   'APW Bangsar',
   3.1209, 101.6710,
   now() + interval '1 day', now() + interval '1 day 2 hours', NULL),

  ('manual', 'https://lu.ma/seed-sentral-ai',
   'AI Builders Meetup',
   'Talks on shipping LLM products. Hosted near KL Sentral.',
   'KL Sentral',
   3.1340, 101.6864,
   now() + interval '3 hours', now() + interval '6 hours', NULL),

  ('manual', 'https://lu.ma/seed-ts-bukit-bintang',
   'TechStars KL Office Hours',
   'Book a slot with mentors. Bukit Bintang.',
   'Bukit Bintang',
   3.1474, 101.7128,
   now() + interval '2 days', now() + interval '2 days 4 hours', NULL),

  ('manual', 'https://lu.ma/seed-pj-web3',
   'Sui Devs PJ',
   'Web3 builders on Sui — workshop + hangout in PJ.',
   'Petaling Jaya',
   3.1073, 101.6067,
   now() - interval '1 hour', now() + interval '1 hour', NULL),

  ('manual', 'https://lu.ma/seed-trx-pitch',
   'Pitch Practice @ TRX',
   'Practice your pitch in front of peers. Tun Razak Exchange.',
   'Tun Razak Exchange',
   3.1421, 101.7242,
   now() + interval '5 hours', now() + interval '8 hours', NULL)
ON CONFLICT (luma_url) DO NOTHING;

-- Landmark buildings with hand-authored isometric designs (Phase: buildings).
-- Requires 003_buildings.sql (building_key column) to have run first.
INSERT INTO events (source, luma_url, title, description, venue_name, lat, lng, starts_at, ends_at, building_key)
VALUES
  ('manual', 'https://lu.ma/seed-klcc-tower',
   'Founders Summit @ KLCC',
   'The flagship KL founder gathering at the Petronas Twin Towers.',
   'Petronas Twin Towers, KLCC',
   3.1579, 101.7115,
   now() + interval '2 hours', now() + interval '6 hours', 'klcc'),

  ('manual', 'https://lu.ma/seed-millerz',
   'Builders Loft @ Millerz Square',
   'Co-working social at Millerz Square, Old Klang Road.',
   'Millerz Square, Old Klang Road',
   3.1015, 101.6766,
   now() - interval '20 minutes', now() + interval '2 hours', 'millerz'),

  ('manual', 'https://lu.ma/seed-mdec',
   'Malaysia Digital Meetup @ MDEC',
   'Digital economy builders at MDEC, Cyberjaya.',
   'MDEC, Cyberjaya',
   2.9220, 101.6550,
   now() + interval '1 day', now() + interval '1 day 3 hours', 'mdec')
ON CONFLICT (luma_url) DO NOTHING;
