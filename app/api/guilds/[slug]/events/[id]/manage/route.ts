import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/apiAuth';

/**
 * GET /api/guilds/[slug]/events/[id]/manage — organizer-only attendance
 * analytics: RSVPs vs check-ins, attendee list, pending approvals, and
 * Registration 2.0 (v4 P2) questions/answers. `?format=csv` exports the
 * attendee list (with one column per question) instead of returning JSON.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await ctx.params;

  let supabase;
  try {
    supabase = createServiceClient();
  } catch {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const me = await requireProfile(request, supabase);
  if (!me) return Response.json({ error: 'Log in required' }, { status: 401 });

  const { data: event } = await supabase.from('events').select('*').eq('id', id).maybeSingle();
  if (!event) return Response.json({ error: 'Event not found' }, { status: 404 });
  if (event.host_id !== me.profileId) {
    return Response.json({ error: 'Only the organizer can view this.' }, { status: 403 });
  }

  const [{ data: rsvps }, { data: checkins }, { data: questions }, { data: pending }, { data: answers }] = await Promise.all([
    supabase
      .from('event_rsvps')
      .select('id, profile_id, guest_id, status, created_at, profiles(display_name, avatar_url), guests(display_name, email)')
      .eq('event_id', id)
      .eq('status', 'confirmed'),
    supabase
      .from('checkins')
      .select('profile_id, method, created_at, stamp_minted_at, profiles(display_name, avatar_url)')
      .eq('event_id', id)
      .order('created_at', { ascending: true }),
    supabase.from('registration_questions').select('*').eq('event_id', id).order('idx', { ascending: true }),
    supabase
      .from('event_rsvps')
      .select('id, profile_id, guest_id, created_at, profiles(display_name, avatar_url), guests(display_name, email)')
      .eq('event_id', id)
      .eq('status', 'pending')
      .order('created_at', { ascending: true }),
    supabase.from('registration_answers').select('*').eq('event_id', id),
  ]);

  const format = request.nextUrl.searchParams.get('format');
  if (format === 'csv') {
    const qs = questions ?? [];
    const answerMap = new Map<string, Map<string, unknown>>(); // key: profile_id or guest_id -> question_id -> answer
    for (const a of answers ?? []) {
      const personKey = a.profile_id ?? a.guest_id;
      if (!personKey) continue;
      if (!answerMap.has(personKey)) answerMap.set(personKey, new Map());
      answerMap.get(personKey)!.set(a.question_id, a.answer);
    }

    const header = ['display_name', 'email', 'status', 'method', 'checked_in_at', 'stamp_minted', ...qs.map((q) => q.label)];
    const rows = [header];

    const checkinByProfile = new Map((checkins ?? []).map((c) => [c.profile_id, c]));
    for (const r of rsvps ?? []) {
      const profile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
      const guest = Array.isArray(r.guests) ? r.guests[0] : r.guests;
      const personKey = r.profile_id ?? r.guest_id;
      const checkin = r.profile_id ? checkinByProfile.get(r.profile_id) : undefined;
      const personAnswers = answerMap.get(personKey ?? '') ?? new Map();
      rows.push([
        profile?.display_name ?? guest?.display_name ?? '',
        guest?.email ?? '',
        r.status,
        checkin?.method ?? '',
        checkin?.created_at ?? '',
        checkin?.stamp_minted_at ? 'yes' : 'no',
        ...qs.map((q) => formatAnswer(personAnswers.get(q.id))),
      ]);
    }
    const csv = rows.map((r) => r.map((v) => csvCell(String(v ?? ''))).join(',')).join('\n');
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${slug}-${event.title.replace(/[^a-z0-9]+/gi, '-')}-attendees.csv"`,
      },
    });
  }

  return Response.json({
    event,
    rsvp_count: rsvps?.length ?? 0,
    checkin_count: checkins?.length ?? 0,
    rsvps: rsvps ?? [],
    checkins: checkins ?? [],
    questions: questions ?? [],
    pending: pending ?? [],
    answers: answers ?? [],
  });
}

/**
 * PATCH /api/guilds/[slug]/events/[id]/manage — the organizer sets capacity
 * and approval_mode. A dedicated route rather than a direct client update
 * because `events` has no host-scoped UPDATE-column restriction today
 * (events_update_host_or_service allows any column) — keeping this narrow
 * avoids accidentally exposing a path to edit unrelated event fields here.
 */
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let supabase;
  try {
    supabase = createServiceClient();
  } catch {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const me = await requireProfile(request, supabase);
  if (!me) return Response.json({ error: 'Log in required' }, { status: 401 });

  const { data: event } = await supabase.from('events').select('host_id').eq('id', id).maybeSingle();
  if (!event) return Response.json({ error: 'Event not found' }, { status: 404 });
  if (event.host_id !== me.profileId) return Response.json({ error: 'Only the organizer can edit this.' }, { status: 403 });

  let body: { capacity?: number | null; approval_mode?: boolean };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if ('capacity' in body) patch.capacity = body.capacity;
  if ('approval_mode' in body) patch.approval_mode = Boolean(body.approval_mode);

  const { error } = await supabase.from('events').update(patch).eq('id', id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

function formatAnswer(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (Array.isArray(v)) return v.join('; ');
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  return String(v);
}

function csvCell(v: string): string {
  return `"${String(v).replace(/"/g, '""')}"`;
}
