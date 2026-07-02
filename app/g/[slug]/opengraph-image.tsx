import { ImageResponse } from 'next/og';
import { createServiceClient } from '@/lib/supabase/server';

export const alt = 'WhatsVP guild';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let name = 'WhatsVP';
  let color = '#0F6E56';
  let memberCount = 0;
  try {
    const supabase = createServiceClient();
    const { data: guild } = await supabase.from('guilds').select('id, name, color').eq('slug', slug).maybeSingle();
    if (guild) {
      name = guild.name;
      color = guild.color ?? '#0F6E56';
      const { count } = await supabase.from('guild_members').select('*', { count: 'exact', head: true }).eq('guild_id', guild.id);
      memberCount = count ?? 0;
    }
  } catch {
    /* Supabase not configured — fall back to the generic card */
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          background: color,
          padding: 80,
          textAlign: 'center',
        }}
      >
        <div style={{ display: 'flex', fontSize: 28, letterSpacing: 4, color: '#F7F5EF', opacity: 0.75, marginBottom: 28 }}>WHATSVP GUILD</div>
        <div style={{ display: 'flex', fontSize: 60, fontWeight: 700, color: '#F7F5EF', lineHeight: 1.15 }}>{name}</div>
        <div style={{ display: 'flex', fontSize: 30, color: '#F7F5EF', opacity: 0.85, marginTop: 24 }}>
          {memberCount} {memberCount === 1 ? 'member' : 'members'}
        </div>
      </div>
    ),
    { ...size }
  );
}
