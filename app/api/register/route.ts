import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/apiAuth';
import { sendMail, claimEmailHtml, isMailConfigured } from '@/lib/mail';
import type { RegistrationQuestion, RegistrationAnswerValue } from '@/lib/types';

/**
 * GET /api/register?event_id=... — everything RegisterModal needs to render:
 * questions, capacity/approval state, social proof (mutuals first if the
 * caller is logged in), and the caller's own registration status. Public
 * (works logged-out) since a guest needs to see the form before signing in.
 */
export async function GET(request: NextRequest) {
  let supabase;
  try {
    supabase = createServiceClient();
  } catch {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const eventId = request.nextUrl.searchParams.get('event_id');
  if (!eventId) return Response.json({ error: 'event_id is required' }, { status: 400 });

  const { data: event } = await supabase
    .from('events')
    .select('id, capacity, approval_mode, guilds(name, logo_url, color)')
    .eq('id', eventId)
    .maybeSingle();
  if (!event) return Response.json({ error: 'Event not found' }, { status: 404 });
  const guild = Array.isArray(event.guilds) ? event.guilds[0] : event.guilds;

  const me = await requireProfile(request, supabase); // null when logged out — a normal case here, not an error

  const [{ data: questions }, { count: confirmedCount }, { data: attendeeRows }] = await Promise.all([
    supabase.from('registration_questions').select('*').eq('event_id', eventId).order('idx', { ascending: true }),
    supabase.from('event_rsvps').select('*', { count: 'exact', head: true }).eq('event_id', eventId).eq('status', 'confirmed'),
    supabase
      .from('event_rsvps')
      .select('profile_id, profiles(id, display_name, avatar_url)')
      .eq('event_id', eventId)
      .eq('status', 'confirmed')
      .not('profile_id', 'is', null)
      .order('created_at', { ascending: true })
      .limit(30),
  ]);

  let myStatus: 'none' | 'confirmed' | 'pending' = 'none';
  let mutualIds = new Set<string>();

  if (me) {
    const { data: mine } = await supabase
      .from('event_rsvps')
      .select('status')
      .eq('event_id', eventId)
      .eq('profile_id', me.profileId)
      .maybeSingle();
    if (mine) myStatus = mine.status as 'confirmed' | 'pending';

    const { data: friendships } = await supabase
      .from('friendships')
      .select('requester_id, addressee_id')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${me.profileId},addressee_id.eq.${me.profileId}`);
    mutualIds = new Set(
      (friendships ?? []).map((f) => (f.requester_id === me.profileId ? f.addressee_id : f.requester_id))
    );
  }

  const attendees = (attendeeRows ?? [])
    .map((r) => {
      const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
      if (!p) return null;
      return { profile_id: p.id, display_name: p.display_name, avatar_url: p.avatar_url, mutual: mutualIds.has(p.id) };
    })
    .filter((a): a is NonNullable<typeof a> => a !== null)
    .sort((a, b) => Number(b.mutual) - Number(a.mutual));

  return Response.json({
    questions: (questions ?? []) as RegistrationQuestion[],
    capacity: event.capacity,
    approval_mode: event.approval_mode,
    confirmed_count: confirmedCount ?? 0,
    attendees,
    my_status: myStatus,
    guild: guild ?? null,
  });
}

interface AnswerInput {
  question_id: string;
  answer: RegistrationAnswerValue;
}

/**
 * POST /api/register — the one write path for Registration 2.0 (event_rsvps'
 * direct client INSERT was revoked in 009_registration.sql). Handles both
 * flows: logged-in (Authorization header, zero identity fields) and guest
 * (event_id + guest_name + guest_email). Enforces capacity + approval_mode
 * server-side — a raw client insert can no longer bypass either.
 */
export async function POST(request: NextRequest) {
  let supabase;
  try {
    supabase = createServiceClient();
  } catch {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  let body: {
    event_id?: string;
    answers?: AnswerInput[];
    guest_name?: string;
    guest_email?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { event_id, answers = [] } = body;
  if (!event_id) return Response.json({ error: 'event_id is required' }, { status: 400 });

  const { data: event } = await supabase
    .from('events')
    .select('id, title, capacity, approval_mode')
    .eq('id', event_id)
    .maybeSingle();
  if (!event) return Response.json({ error: 'Event not found' }, { status: 404 });

  const { data: questions } = await supabase
    .from('registration_questions')
    .select('id, required, label')
    .eq('event_id', event_id);
  const missing = (questions ?? []).filter(
    (q) => q.required && !answers.some((a) => a.question_id === q.id && hasValue(a.answer))
  );
  if (missing.length > 0) {
    return Response.json({ error: `"${missing[0].label}" is required.` }, { status: 400 });
  }

  // Capacity is enforced against confirmed spots only — a pending approval
  // request doesn't reserve a spot until the organizer approves it. No
  // waitlist exists (out of scope per the brief), so a full event blocks new
  // registrations outright rather than queuing them.
  if (typeof event.capacity === 'number') {
    const { count } = await supabase
      .from('event_rsvps')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', event_id)
      .eq('status', 'confirmed');
    if ((count ?? 0) >= event.capacity) {
      return Response.json({ error: 'This event is full.' }, { status: 409 });
    }
  }

  const status: 'confirmed' | 'pending' = event.approval_mode ? 'pending' : 'confirmed';
  const me = await requireProfile(request, supabase);

  if (me) {
    const { data: existing } = await supabase
      .from('event_rsvps')
      .select('id, status')
      .eq('event_id', event_id)
      .eq('profile_id', me.profileId)
      .maybeSingle();
    if (existing) return Response.json({ ok: true, status: existing.status, already: true });

    const { data: rsvp, error } = await supabase
      .from('event_rsvps')
      .insert({ event_id, profile_id: me.profileId, status })
      .select('id')
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });

    if (answers.length > 0) {
      await supabase
        .from('registration_answers')
        .insert(answers.map((a) => ({ event_id, profile_id: me.profileId, question_id: a.question_id, answer: a.answer })));
    }

    return Response.json({ ok: true, status, rsvp_id: rsvp.id });
  }

  // Guest flow — no session, so identity is captured directly.
  const guestName = body.guest_name?.trim();
  const guestEmail = body.guest_email?.trim().toLowerCase();
  if (!guestEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
    return Response.json({ error: 'A valid email is required.' }, { status: 400 });
  }

  const { data: guest, error: guestErr } = await supabase
    .from('guests')
    .insert({ email: guestEmail, display_name: guestName || null })
    .select('id, claim_token')
    .single();
  if (guestErr) return Response.json({ error: guestErr.message }, { status: 500 });

  const { data: rsvp, error: rsvpErr } = await supabase
    .from('event_rsvps')
    .insert({ event_id, guest_id: guest.id, status })
    .select('id')
    .single();
  if (rsvpErr) return Response.json({ error: rsvpErr.message }, { status: 500 });

  if (answers.length > 0) {
    await supabase
      .from('registration_answers')
      .insert(answers.map((a) => ({ event_id, guest_id: guest.id, question_id: a.question_id, answer: a.answer })));
  }

  const claimUrl = `${appOrigin(request)}/e/${event_id}?claim=${guest.claim_token}`;
  // Awaited (not fire-and-forget): the response needs to know synchronously
  // whether the email actually went out, so it can show the "screenshot
  // this" link fallback instead of a "check your email" promise that might
  // not come true. One registration POST eating a ~few-hundred-ms mail-API
  // round-trip is an acceptable trade for that honesty.
  const mailSent = isMailConfigured()
    ? await sendMail(guestEmail, `You're in — ${event.title}`, claimEmailHtml(event.title, claimUrl))
    : false;

  return Response.json({ ok: true, status, rsvp_id: rsvp.id, mail_sent: mailSent, claim_url: mailSent ? undefined : claimUrl });
}

function hasValue(v: RegistrationAnswerValue | undefined): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true; // boolean (checkbox) — presence alone means "answered"
}

function appOrigin(request: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
}
