import { ImageResponse } from 'next/og';
import { createServiceClient } from '@/lib/supabase/server';

export const alt = 'WhatsVP event';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let title = 'WhatsVP';
  let venue = '';
  try {
    const supabase = createServiceClient();
    const { data } = await supabase.from('events').select('title, venue_name').eq('id', slug).maybeSingle();
    if (data) {
      title = data.title;
      venue = data.venue_name ?? '';
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
          background: '#0F6E56',
          padding: 80,
          textAlign: 'center',
        }}
      >
        <div style={{ display: 'flex', fontSize: 28, letterSpacing: 4, color: '#F7F5EF', opacity: 0.75, marginBottom: 28 }}>WHATSVP</div>
        <div style={{ display: 'flex', fontSize: 56, fontWeight: 700, color: '#F7F5EF', lineHeight: 1.15 }}>{title}</div>
        {venue && <div style={{ display: 'flex', fontSize: 30, color: '#F7F5EF', opacity: 0.85, marginTop: 24 }}>{venue}</div>}
      </div>
    ),
    { ...size }
  );
}
