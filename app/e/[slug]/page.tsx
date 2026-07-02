import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServiceClient } from '@/lib/supabase/server';
import { withStatus, formatEventTime, whatsAppShareUrl } from '@/lib/utils';
import { TAGLINE } from '@/lib/copy';
import type { RawEvent } from '@/lib/types';

/**
 * Public, unauthenticated, server-rendered event share page — fast, and
 * readable by link-preview crawlers (WhatsApp, etc.) without executing JS.
 * "slug" here is the event's id; events don't have pretty slugs yet.
 */
async function getEvent(id: string): Promise<RawEvent | null> {
  let supabase;
  try {
    supabase = createServiceClient();
  } catch {
    return null;
  }
  const { data } = await supabase.from('events').select('*').eq('id', id).maybeSingle();
  return data;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const event = await getEvent(slug);
  if (!event) return { title: 'Event not found — WhatsVP' };

  const description = event.venue_name ? `${event.venue_name} · ${TAGLINE}` : TAGLINE;
  return {
    title: `${event.title} — WhatsVP`,
    description,
    openGraph: { title: event.title, description, images: [`/e/${slug}/opengraph-image`] },
    twitter: { card: 'summary_large_image', title: event.title, description },
  };
}

export default async function EventSharePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const raw = await getEvent(slug);
  if (!raw) notFound();
  const event = withStatus([raw])[0];

  const shareUrl = `https://whatsvp.com/e/${slug}`;
  const badge = event.status === 'live' ? '● LIVE NOW' : event.status === 'upcoming' ? 'UPCOMING' : 'PAST';

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4 py-10">
      <div className="max-w-md w-full rounded-2xl border border-hairline shadow-xl overflow-hidden bg-surface">
        {event.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.cover_url} alt={event.title} className="w-full h-44 object-cover" />
        ) : (
          <div className="h-20 bg-gradient-to-br from-teal/20 to-teal/5" />
        )}
        <div className="p-6">
          <span
            className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold tracking-wide mb-2
              ${event.status === 'live' ? 'bg-live text-white' : event.status === 'upcoming' ? 'bg-upcoming text-white' : 'bg-ink/15 text-ink'}`}
          >
            {badge}
          </span>
          <h1 className="text-h2 font-semibold text-ink leading-snug">{event.title}</h1>
          <p className="mt-2 text-sm text-sub">{formatEventTime(event)}</p>
          {event.venue_name && <p className="text-sm text-sub">{event.venue_name}</p>}
          {event.description && <p className="mt-3 text-sm text-ink/70 line-clamp-3">{event.description}</p>}

          <div className="mt-6 flex flex-col gap-2">
            <Link
              href={`/?event=${event.id}`}
              className="w-full py-2.5 rounded-xl bg-teal text-white text-sm font-semibold text-center hover:bg-teal/90 transition-colors"
            >
              Open in WhatsVP
            </Link>
            <a
              href={whatsAppShareUrl(event.title, shareUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2.5 rounded-xl border border-hairline text-sm font-medium text-center text-ink hover:bg-ink/5 transition-colors"
            >
              Share on WhatsApp
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
