import webpush from 'web-push';
import { createServiceClient } from './supabase/server';

/**
 * Server-side web-push sending (v3 P4). Gated on VAPID keys — without them
 * this silently no-ops, same graceful-degradation pattern as every other
 * optional feature in this app (Move mints, Alchemy PFP verification, etc).
 */

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:hello@whatsvp.com';

export function isPushConfigured(): boolean {
  return Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
}

let configured = false;
function ensureConfigured() {
  if (configured || !isPushConfigured()) return;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  configured = true;
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

/** Send a push to every subscription a profile has. Best-effort — prunes dead (404/410) subscriptions as it goes. */
export async function sendPushToProfile(profileId: string, payload: PushPayload): Promise<void> {
  if (!isPushConfigured()) return;
  ensureConfigured();

  const supabase = createServiceClient();
  const { data: subs } = await supabase.from('push_subscriptions').select('*').eq('profile_id', profileId);
  if (!subs?.length) return;

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload));
      } catch (e: unknown) {
        const statusCode = (e as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', s.id);
        }
      }
    })
  );
}
