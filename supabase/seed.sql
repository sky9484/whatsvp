-- Dev seed data — a mixed set of real KL communities so the map shows pins
-- before Luma ingestion is wired up. Run AFTER 004_guilds.sql:
--   psql "$DATABASE_URL" -f supabase/seed.sql
-- or paste into the Supabase SQL editor.
--
-- WhatsVP is horizontal community infrastructure — this seed is deliberately
-- mixed (run club, photography, sport, food, student society, hobby, founders,
-- tech) so a first-time visitor never mistakes this for a crypto-only app.
-- Times are relative to now() so some render as "live" and some as "upcoming".

-- ── Guilds — one per community, spanning many segments on the same primitives ──
INSERT INTO guilds (slug, name, description, color, is_verified) VALUES
  ('kl-builders',   'KL Builders',        'Founders and tech builders shipping product in KL.', '#0F6E56', true),
  ('kl-runners',    'KL Runners',         'Morning and sunset runs around the city.',            '#D85A30', true),
  ('frame-by-frame','Frame by Frame KL',  'Photography walks across KL''s best light.',           '#185FA5', true),
  ('smash-club',    'Smash Club',         'Weeknight badminton, all levels welcome.',            '#1D9E75', true),
  ('kl-food-crawl', 'KL Food Crawlers',   'Street food and pasar malam trails.',                 '#E8714A', true),
  ('um-society',    'UM Students Society','Universiti Malaya student community.',                '#0F6E56', true),
  ('ss15-boardgamers','SS15 Board Gamers','Weekly board games night in Subang Jaya.',             '#6A6A62', true)
ON CONFLICT (slug) DO NOTHING;

-- ── Events ─────────────────────────────────────────────────────────────────────
INSERT INTO events (source, luma_url, title, description, venue_name, lat, lng, starts_at, ends_at, guild_id)
VALUES
  ('manual', 'https://lu.ma/seed-run-morning',
   'Morning Run Club',
   'Easy 5-8km loop around the park, all paces welcome. Coffee after.',
   'Desa ParkCity, Kuala Lumpur',
   3.1691, 101.6297,
   now() - interval '30 minutes', now() + interval '1 hour 30 minutes',
   (SELECT id FROM guilds WHERE slug = 'kl-runners')),

  ('manual', 'https://lu.ma/seed-run-sunset',
   'Sunset 5K',
   'Golden-hour 5K, chill pace. Meet at the clubhouse.',
   'Desa ParkCity, Kuala Lumpur',
   3.1691, 101.6297,
   now() + interval '1 day 6 hours', now() + interval '1 day 7 hours 30 minutes',
   (SELECT id FROM guilds WHERE slug = 'kl-runners')),

  ('manual', 'https://lu.ma/seed-photo-heritage',
   'Heritage Walk: Merdeka Square',
   'Street and architecture photography through KL''s colonial core.',
   'Dataran Merdeka, Kuala Lumpur',
   3.1478, 101.6953,
   now() + interval '4 hours', now() + interval '6 hours',
   (SELECT id FROM guilds WHERE slug = 'frame-by-frame')),

  ('manual', 'https://lu.ma/seed-photo-goldenhour',
   'Golden Hour Shoot @ KLCC Park',
   'Skyline shots as the sun sets. Bring a tripod.',
   'KLCC Park, Kuala Lumpur',
   3.1553, 101.7132,
   now() + interval '1 day 3 hours', now() + interval '1 day 5 hours',
   (SELECT id FROM guilds WHERE slug = 'frame-by-frame')),

  ('manual', 'https://lu.ma/seed-badminton-setapak',
   'Badminton Night',
   'Casual doubles, courts booked till 11pm. All levels.',
   'Setapak Sports Complex, Kuala Lumpur',
   3.1928, 101.7180,
   now() + interval '3 hours', now() + interval '5 hours',
   (SELECT id FROM guilds WHERE slug = 'smash-club')),

  ('manual', 'https://lu.ma/seed-coffee-bangsar',
   'Founders Coffee',
   'Casual Saturday coffee for early-stage founders. Just turn up.',
   'APW Bangsar, Kuala Lumpur',
   3.1209, 101.6710,
   now() - interval '1 hour', now() + interval '1 hour',
   (SELECT id FROM guilds WHERE slug = 'kl-builders')),

  ('manual', 'https://lu.ma/seed-food-petaling',
   'Petaling Street Food Crawl',
   'Six stops, one street. Bring an appetite.',
   'Petaling Street, Kuala Lumpur',
   3.1435, 101.6959,
   now() + interval '6 hours', now() + interval '8 hours',
   (SELECT id FROM guilds WHERE slug = 'kl-food-crawl')),

  ('manual', 'https://lu.ma/seed-food-pasarmalam',
   'Pasar Malam Trail',
   'Night-market crawl — satay, apam balik, and cendol.',
   'SS2 Pasar Malam, Petaling Jaya',
   3.1177, 101.6234,
   now() + interval '2 days 3 hours', now() + interval '2 days 5 hours',
   (SELECT id FROM guilds WHERE slug = 'kl-food-crawl')),

  ('manual', 'https://lu.ma/seed-um-mixer',
   'UM Students Society Mixer',
   'New-semester mixer — clubs fair + free food.',
   'Universiti Malaya, Kuala Lumpur',
   3.1209, 101.6535,
   now() + interval '1 day 5 hours', now() + interval '1 day 7 hours',
   (SELECT id FROM guilds WHERE slug = 'um-society')),

  ('manual', 'https://lu.ma/seed-boardgames-ss15',
   'Board Games Night',
   'Catan, Wingspan, and whatever else shows up. BYO game welcome.',
   'SS15 Courtyard, Subang Jaya',
   3.0733, 101.5860,
   now() + interval '5 hours', now() + interval '8 hours',
   (SELECT id FROM guilds WHERE slug = 'ss15-boardgamers')),

  ('manual', 'https://lu.ma/seed-pj-web3',
   'Sui Devs PJ',
   'Web3 builders on Sui — workshop + hangout in PJ.',
   'Petaling Jaya',
   3.1073, 101.6067,
   now() - interval '45 minutes', now() + interval '1 hour',
   (SELECT id FROM guilds WHERE slug = 'kl-builders')),

  ('manual', 'https://lu.ma/seed-sentral-ai',
   'AI Builders Meetup',
   'Talks on shipping LLM products. Hosted near KL Sentral.',
   'KL Sentral',
   3.1340, 101.6864,
   now() + interval '8 hours', now() + interval '11 hours',
   (SELECT id FROM guilds WHERE slug = 'kl-builders'))
ON CONFLICT (luma_url) DO NOTHING;

-- ── Landmark buildings with hand-authored isometric designs ─────────────────────
-- Requires 003_buildings.sql (building_key column).
INSERT INTO events (source, luma_url, title, description, venue_name, lat, lng, starts_at, ends_at, building_key, guild_id)
VALUES
  ('manual', 'https://lu.ma/seed-klcc-tower',
   'Founders Summit @ KLCC',
   'The flagship KL founder gathering at the Petronas Twin Towers.',
   'Petronas Twin Towers, KLCC',
   3.1579, 101.7115,
   now() + interval '2 hours', now() + interval '6 hours', 'klcc',
   (SELECT id FROM guilds WHERE slug = 'kl-builders')),

  ('manual', 'https://lu.ma/seed-millerz',
   'Builders Loft @ Millerz Square',
   'Co-working social at Millerz Square, Old Klang Road.',
   'Millerz Square, Old Klang Road',
   3.1015, 101.6766,
   now() - interval '20 minutes', now() + interval '2 hours', 'millerz',
   (SELECT id FROM guilds WHERE slug = 'kl-builders')),

  ('manual', 'https://lu.ma/seed-mdec',
   'Malaysia Digital Meetup @ MDEC',
   'Digital economy builders at MDEC, Cyberjaya.',
   'MDEC, Cyberjaya',
   2.9220, 101.6550,
   now() + interval '1 day', now() + interval '1 day 3 hours', 'mdec',
   (SELECT id FROM guilds WHERE slug = 'kl-builders'))
ON CONFLICT (luma_url) DO NOTHING;
