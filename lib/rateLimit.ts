/**
 * Best-effort, per-warm-instance rate limiter (v4 P5). NOT a durable/shared
 * store — same honest limitation as /api/checkin's inline limiter: it guards
 * against a runaway client loop, while the real defenses are the DB-level
 * invariants (unique digests, daily counts) the money routes also enforce.
 * A serverless cold start resets it; that's acceptable for a damper, not for
 * a hard security boundary.
 */

const buckets = new Map<string, number[]>();

export function rateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  buckets.set(key, recent);
  return recent.length > max;
}

/** Best-effort client IP from the standard proxy headers Vercel sets. */
export function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for');
  return fwd?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
}
