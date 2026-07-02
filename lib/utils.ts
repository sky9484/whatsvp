import type { RawEvent, Event, EventStatus, EventFilter } from './types';

const KL_TZ = 'Asia/Kuala_Lumpur';

export function getEventStatus(event: Pick<RawEvent, 'starts_at' | 'ends_at'>): EventStatus {
  const now = Date.now();
  const start = new Date(event.starts_at).getTime();
  // Default event duration is 3 hours if end time not set
  const end = event.ends_at
    ? new Date(event.ends_at).getTime()
    : start + 3 * 60 * 60 * 1000;

  if (now >= start && now <= end) return 'live';
  if (now < start) return 'upcoming';
  return 'past';
}

export function withStatus(events: RawEvent[]): Event[] {
  return events.map((e) => ({ ...e, status: getEventStatus(e) }));
}

export function formatEventTime(event: Pick<RawEvent, 'starts_at' | 'ends_at'>): string {
  const start = new Date(event.starts_at);
  const now = new Date();

  const isToday = start.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = start.toDateString() === tomorrow.toDateString();

  const timeStr = start.toLocaleTimeString('en-MY', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: KL_TZ,
  });

  const endStr = event.ends_at
    ? new Date(event.ends_at).toLocaleTimeString('en-MY', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: KL_TZ,
      })
    : null;

  const dayLabel = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : start.toLocaleDateString('en-MY', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: KL_TZ,
  });

  return endStr ? `${dayLabel}, ${timeStr} – ${endStr}` : `${dayLabel}, ${timeStr}`;
}

const CHECKIN_WINDOW_PAD_MS = 30 * 60 * 1000;

/**
 * Whether "now" falls within an event's check-in window (30 min before start
 * through 30 min after end). Shared by the client (button gating/hints) and
 * /api/checkin (the authoritative check) so the two never drift apart.
 */
export function isCheckinWindowOpen(event: Pick<RawEvent, 'starts_at' | 'ends_at'>, now = Date.now()): boolean {
  const start = new Date(event.starts_at).getTime();
  const end = event.ends_at ? new Date(event.ends_at).getTime() : start + 3 * 60 * 60 * 1000;
  return now >= start - CHECKIN_WINDOW_PAD_MS && now <= end + CHECKIN_WINDOW_PAD_MS;
}

/** wa.me share link — works everywhere (opens the app on mobile, web.whatsapp.com on desktop). */
export function whatsAppShareUrl(text: string, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
}

/** Haversine distance in metres */
export function distanceMetres(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** KL-calendar-day key (YYYY-MM-DD) for a timestamp — timezone-safe day comparison. */
function klDateKey(ms: number): string {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: KL_TZ });
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Which time-scrubber segment(s) an event belongs to, evaluated against `now`. */
function matchesSegment(event: Event, filter: EventFilter, now: number): boolean {
  const start = new Date(event.starts_at).getTime();

  switch (filter) {
    case 'live':
      return event.status === 'live';
    case 'today':
      return event.status !== 'past' && klDateKey(start) === klDateKey(now);
    case 'tomorrow':
      return klDateKey(start) === klDateKey(now + DAY_MS);
    case 'week':
      return event.status !== 'past' && start <= now + 7 * DAY_MS;
    case 'past10':
      return event.status === 'past' && start >= now - 10 * DAY_MS;
    default:
      return true;
  }
}

export function filterEvents(
  events: Event[],
  filter: EventFilter,
  query: string
): Event[] {
  const now = Date.now();
  return events.filter((e) => {
    if (!matchesSegment(e, filter, now)) return false;

    if (query.trim()) {
      const q = query.toLowerCase();
      return (
        e.title.toLowerCase().includes(q) ||
        (e.venue_name?.toLowerCase().includes(q) ?? false) ||
        (e.description?.toLowerCase().includes(q) ?? false)
      );
    }
    return true;
  });
}

/** Counts for each time-scrubber segment, for badges on the scrubber. */
export function segmentCounts(events: Event[]): Record<EventFilter, number> {
  const now = Date.now();
  const counts: Record<EventFilter, number> = { live: 0, today: 0, tomorrow: 0, week: 0, past10: 0 };
  for (const key of Object.keys(counts) as EventFilter[]) {
    counts[key] = events.filter((e) => matchesSegment(e, key, now)).length;
  }
  return counts;
}
