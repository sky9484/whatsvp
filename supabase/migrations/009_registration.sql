-- WhatsVP v4 P2 â€” Registration 2.0.
-- Numbered 009 (the brief's own draft proposed 008, which collides with the
-- real 008_p0_audit_fixes.sql â€” same renumbering discipline used every phase
-- so far). Run AFTER 008_p0_audit_fixes.sql. Reuses current_profile_id().

-- â”€â”€ events: capacity + approval â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ALTER TABLE events ADD COLUMN IF NOT EXISTS capacity INT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS approval_mode BOOLEAN NOT NULL DEFAULT false;


-- â”€â”€ registration_questions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS registration_questions (
  id          UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  idx         INT NOT NULL DEFAULT 0,
  kind        TEXT NOT NULL CHECK (kind IN ('short_text', 'long_text', 'single_select', 'multi_select', 'checkbox')),
  label       TEXT NOT NULL,
  options     JSONB,
  required    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS registration_questions_event_idx ON registration_questions (event_id, idx);

ALTER TABLE registration_questions ENABLE ROW LEVEL SECURITY;

-- World-readable (a logged-out visitor needs to see the form before signing in).
CREATE POLICY "registration_questions_select_all"
  ON registration_questions FOR SELECT USING (true);

-- Only the event's host manages questions â€” the organizer form builder writes
-- directly via RLS (no service-role route needed for simple CRUD like this).
CREATE POLICY "registration_questions_write_host"
  ON registration_questions FOR ALL
  USING (EXISTS (SELECT 1 FROM events WHERE events.id = registration_questions.event_id AND events.host_id = current_profile_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM events WHERE events.id = registration_questions.event_id AND events.host_id = current_profile_id()));


-- â”€â”€ guests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- A logged-out registrant's captured name+email. Service-role only (written by
-- /api/register, read by /api/register/claim) â€” no client policy of any kind,
-- same treatment checkin_secret/withdrawals got: this is real PII, not just a
-- trust flag.
CREATE TABLE IF NOT EXISTS guests (
  id                  UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  email               TEXT NOT NULL,
  display_name        TEXT,
  claim_token         TEXT UNIQUE NOT NULL DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  claimed_profile_id  UUID REFERENCES profiles (id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guests_email_idx ON guests (lower(email));

ALTER TABLE guests ENABLE ROW LEVEL SECURITY;
-- No policies at all â€” service-role only, by omission (RLS defaults to deny).


-- â”€â”€ registration_answers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS registration_answers (
  id            UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  profile_id    UUID REFERENCES profiles (id) ON DELETE CASCADE,
  guest_id      UUID REFERENCES guests (id) ON DELETE CASCADE,
  question_id   UUID NOT NULL REFERENCES registration_questions (id) ON DELETE CASCADE,
  answer        JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (profile_id IS NOT NULL OR guest_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS registration_answers_event_idx ON registration_answers (event_id);

ALTER TABLE registration_answers ENABLE ROW LEVEL SECURITY;

-- Readable by the person who answered (if a profile) and the event's host â€”
-- guest answers are only readable by the host, since a guest has no session
-- to match against (mirrors guests itself being service-role-only for writes).
CREATE POLICY "registration_answers_select_owner_or_host"
  ON registration_answers FOR SELECT
  USING (
    profile_id = current_profile_id()
    OR EXISTS (SELECT 1 FROM events WHERE events.id = registration_answers.event_id AND events.host_id = current_profile_id())
  );

-- Client-side insert only covers the logged-in path (profile_id = self); guest
-- answers are written by /api/register under the service role, since a guest
-- registration also has to create the guests row + event_rsvps row atomically.
CREATE POLICY "registration_answers_insert_self"
  ON registration_answers FOR INSERT
  WITH CHECK (profile_id = current_profile_id());


-- â”€â”€ event_rsvps: guest support + approval status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ALTER TABLE event_rsvps ADD COLUMN IF NOT EXISTS guest_id UUID REFERENCES guests (id) ON DELETE CASCADE;
ALTER TABLE event_rsvps ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'pending', 'declined'));

-- The existing PRIMARY KEY (event_id, profile_id) assumed profile_id was
-- always set; a guest registration has profile_id NULL, so relax it to a
-- regular NOT NULL-when-relevant pair instead of a composite PK. Guest rows
-- get a surrogate id; profile rows keep their natural one-per-event-per-person
-- uniqueness via a partial unique index (a plain UNIQUE(event_id, profile_id)
-- would not treat two NULLs as equal anyway in Postgres, but being explicit
-- here avoids relying on that NULL-handling quirk).
ALTER TABLE event_rsvps DROP CONSTRAINT IF EXISTS event_rsvps_pkey;
ALTER TABLE event_rsvps ADD COLUMN IF NOT EXISTS id UUID DEFAULT extensions.gen_random_uuid();
UPDATE event_rsvps SET id = extensions.gen_random_uuid() WHERE id IS NULL;
ALTER TABLE event_rsvps ALTER COLUMN id SET NOT NULL;
ALTER TABLE event_rsvps ADD PRIMARY KEY (id);

CREATE UNIQUE INDEX IF NOT EXISTS event_rsvps_profile_unique
  ON event_rsvps (event_id, profile_id) WHERE profile_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS event_rsvps_guest_unique
  ON event_rsvps (event_id, guest_id) WHERE guest_id IS NOT NULL;

ALTER TABLE event_rsvps ADD CONSTRAINT event_rsvps_person_check CHECK (profile_id IS NOT NULL OR guest_id IS NOT NULL);

-- Registration now has real server-enforced invariants (capacity, approval
-- workflow) that a raw client INSERT would trivially bypass (default
-- status='confirmed', no capacity check) â€” the same class of gap the
-- checkins/withdrawals tables were built to avoid from day one. All writes
-- now go through /api/register under the service role; direct self-DELETE
-- (cancelling your own registration, confirmed or pending) stays client-side
-- since it has no invariant to enforce.
DROP POLICY IF EXISTS "rsvps_insert_self" ON event_rsvps;

