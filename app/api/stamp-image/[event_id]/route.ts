import crypto from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * GET /api/stamp-image/[event_id] — deterministic generated SVG "stamp" art
 * for one event. Deliberately a deterministic renderer, not an image model
 * (same honesty principle as IsoPhotoBuilding for community buildings) — the
 * seam to swap in real generated art later is this single route.
 */

const PALETTE = ['#0F6E56', '#D85A30', '#1D9E75', '#185FA5', '#6A6A62'];

function hashPick<T>(seed: string, options: T[]): T {
  const h = crypto.createHash('sha256').update(seed).digest();
  return options[h[0] % options.length];
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function GET(_req: Request, ctx: { params: Promise<{ event_id: string }> }) {
  const { event_id } = await ctx.params;

  let supabase;
  try {
    supabase = createServiceClient();
  } catch {
    return new Response('Supabase not configured', { status: 503 });
  }

  const { data: event } = await supabase
    .from('events')
    .select('title, starts_at')
    .eq('id', event_id)
    .maybeSingle();
  if (!event) return new Response('Not found', { status: 404 });

  const color = hashPick(event_id, PALETTE);
  const title = event.title.length > 28 ? `${event.title.slice(0, 26)}…` : event.title;
  const dateStr = new Date(event.starts_at)
    .toLocaleDateString('en-MY', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' })
    .toUpperCase();

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
  <defs>
    <clipPath id="clip"><circle cx="200" cy="200" r="176"/></clipPath>
  </defs>
  <circle cx="200" cy="200" r="188" fill="none" stroke="${color}" stroke-width="4" stroke-dasharray="6 7"/>
  <circle cx="200" cy="200" r="176" fill="${color}"/>
  <circle cx="200" cy="200" r="176" fill="none" stroke="#F7F5EF" stroke-width="3"/>
  <g clip-path="url(#clip)">
    <circle cx="200" cy="200" r="150" fill="none" stroke="#F7F5EF" stroke-width="1.5" opacity="0.35"/>
    <circle cx="200" cy="200" r="120" fill="none" stroke="#F7F5EF" stroke-width="1.5" opacity="0.25"/>
  </g>
  <text x="200" y="185" text-anchor="middle" font-family="Georgia, serif" font-size="22" font-weight="700" fill="#F7F5EF">${escapeXml(title)}</text>
  <text x="200" y="215" text-anchor="middle" font-family="Georgia, serif" font-size="14" letter-spacing="2" fill="#F7F5EF" opacity="0.85">${escapeXml(dateStr)}</text>
  <text x="200" y="248" text-anchor="middle" font-family="Georgia, serif" font-size="11" letter-spacing="3" fill="#F7F5EF" opacity="0.7">WHATSVP</text>
</svg>`;

  return new Response(svg, {
    headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400, immutable' },
  });
}
