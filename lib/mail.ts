/**
 * Minimal, dependency-free mail sending for the guest-registration claim link
 * (v4 P2). Uses Resend's plain HTTP API via `fetch` — no SDK, matching this
 * project's preference for dep-free server-side integrations where the API
 * surface is small (see lib/jwt.ts, lib/checkinCode.ts). Env-gated: without
 * `RESEND_API_KEY`, `sendMail` returns false and the caller falls back to
 * showing the claim link directly ("screenshot this"), never a silent failure.
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? '';
const MAIL_FROM = process.env.MAIL_FROM || 'WhatsVP <hello@whatsvp.com>';

export function isMailConfigured(): boolean {
  return Boolean(RESEND_API_KEY);
}

export async function sendMail(to: string, subject: string, html: string): Promise<boolean> {
  if (!isMailConfigured()) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: MAIL_FROM, to: [to], subject, html }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** The guest-registration claim email — "Claim your Passport to check in & earn the stamp." */
export function claimEmailHtml(eventTitle: string, claimUrl: string): string {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#1B1B18;">
      <p>You're in for <strong>${escapeHtml(eventTitle)}</strong>.</p>
      <p>Claim your Passport to check in at the door and collect the stamp for this event.</p>
      <p style="margin:24px 0;">
        <a href="${claimUrl}" style="background:#0F6E56;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600;">
          Claim your Passport
        </a>
      </p>
      <p style="color:#6A6A62;font-size:13px;">If the button doesn't work, copy this link: ${claimUrl}</p>
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
