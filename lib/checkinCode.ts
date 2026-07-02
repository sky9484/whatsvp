import crypto from 'node:crypto';

/**
 * TOTP-style rotating check-in code — an HMAC of the event's per-event secret
 * and a 30-second time window, so a screenshotted/shared QR code stops working
 * within half a minute. No external dependency (mirrors lib/jwt.ts's approach).
 * Server-only: callers must never expose `checkin_secret` itself to a client.
 */

const WINDOW_SECONDS = 30;

function codeForWindow(secret: string, eventId: string, windowIndex: number): string {
  const digest = crypto.createHmac('sha256', secret).update(`${eventId}:${windowIndex}`).digest('hex');
  const n = parseInt(digest.slice(0, 8), 16) % 1_000_000;
  return n.toString().padStart(6, '0');
}

export function currentCheckinCode(secret: string, eventId: string, at = Date.now()) {
  const windowIndex = Math.floor(at / 1000 / WINDOW_SECONDS);
  return {
    code: codeForWindow(secret, eventId, windowIndex),
    expiresAt: (windowIndex + 1) * WINDOW_SECONDS * 1000,
  };
}

/** Accepts the current window plus one window of tolerance either side (scan/clock lag). */
export function verifyCheckinCode(secret: string, eventId: string, code: string, at = Date.now()): boolean {
  const windowIndex = Math.floor(at / 1000 / WINDOW_SECONDS);
  for (const w of [windowIndex - 1, windowIndex, windowIndex + 1]) {
    if (codeForWindow(secret, eventId, w) === code) return true;
  }
  return false;
}
