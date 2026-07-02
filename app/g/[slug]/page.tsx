import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServiceClient } from '@/lib/supabase/server';
import { whatsAppShareUrl } from '@/lib/utils';
import { TAGLINE } from '@/lib/copy';

/** Public, unauthenticated, server-rendered guild share page. */
async function getGuild(slug: string) {
  let supabase;
  try {
    supabase = createServiceClient();
  } catch {
    return null;
  }
  const { data: guild } = await supabase.from('guilds').select('*').eq('slug', slug).maybeSingle();
  if (!guild) return null;
  const { count } = await supabase.from('guild_members').select('*', { count: 'exact', head: true }).eq('guild_id', guild.id);
  return { guild, memberCount: count ?? 0 };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const result = await getGuild(slug);
  if (!result) return { title: 'Guild not found — WhatsVP' };

  const description = result.guild.description || TAGLINE;
  return {
    title: `${result.guild.name} — WhatsVP`,
    description,
    openGraph: { title: result.guild.name, description, images: [`/g/${slug}/opengraph-image`] },
    twitter: { card: 'summary_large_image', title: result.guild.name, description },
  };
}

export default async function GuildSharePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await getGuild(slug);
  if (!result) notFound();
  const { guild, memberCount } = result;

  const shareUrl = `https://whatsvp.com/g/${slug}`;

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4 py-10">
      <div className="max-w-md w-full rounded-2xl border border-hairline shadow-xl overflow-hidden bg-surface">
        <div className="h-20 relative" style={{ background: `linear-gradient(135deg, ${guild.color ?? '#1D9E75'}, ${guild.color ?? '#1D9E75'}55)` }}>
          {guild.banner_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={guild.banner_url} alt="" className="w-full h-full object-cover" />
          )}
        </div>
        <div className="px-6 -mt-6 pb-6">
          <span
            className="w-14 h-14 rounded-2xl border-4 border-surface flex items-center justify-center text-white text-xl font-bold"
            style={{ backgroundColor: guild.color ?? '#1D9E75' }}
          >
            {guild.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={guild.logo_url} alt="" className="w-full h-full rounded-2xl object-cover" />
            ) : (
              guild.name[0]?.toUpperCase()
            )}
          </span>
          <h1 className="mt-3 text-h2 font-semibold text-ink flex items-center gap-1.5">
            {guild.name}
            {guild.is_verified && <span className="text-teal text-lg" title="Verified">✓</span>}
          </h1>
          <p className="mt-1 text-sm text-sub">
            {memberCount} {memberCount === 1 ? 'member' : 'members'}
          </p>
          {guild.description && <p className="mt-3 text-sm text-ink/70">{guild.description}</p>}

          <div className="mt-6 flex flex-col gap-2">
            <Link
              href="/?open=guilds"
              className="w-full py-2.5 rounded-xl bg-teal text-white text-sm font-semibold text-center hover:bg-teal/90 transition-colors"
            >
              Open in WhatsVP
            </Link>
            <a
              href={whatsAppShareUrl(guild.name, shareUrl)}
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
