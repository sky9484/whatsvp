/**
 * GET /api/fx — USD→MYR rate for the "≈ RM" display (§5.1). Cached in-memory
 * per warm instance for a day; FX here is explicitly approximate and always
 * labeled, so a slightly stale rate is fine and a fetch failure just means the
 * UI shows USDC without the RM hint rather than erroring. No API key needed
 * (open.er-api.com free tier).
 */

let cache: { rate: number; day: string } | null = null;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET() {
  if (cache && cache.day === today()) {
    return Response.json({ usd_to_myr: cache.rate, cached: true });
  }
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', { next: { revalidate: 86400 } });
    const data = await res.json();
    const rate = data?.rates?.MYR;
    if (typeof rate === 'number' && rate > 0) {
      cache = { rate, day: today() };
      return Response.json({ usd_to_myr: rate });
    }
  } catch {
    /* fall through to null */
  }
  return Response.json({ usd_to_myr: cache?.rate ?? null });
}
