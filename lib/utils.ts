import type { RawEvent, Event, EventStatus } from './types';

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

export function filterEvents(
  events: Event[],
  filter: string,
  query: string
): Event[] {
  return events.filter((e) => {
    if (filter === 'live' && e.status !== 'live') return false;
    if (filter === 'upcoming' && e.status !== 'upcoming') return false;
    if (filter === 'all' && e.status === 'past') return false;

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
