import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSuiClient } from '@/lib/sui-server';
import { getAdminAddress } from '@/lib/sui-admin';
import { sendMail, isMailConfigured } from '@/lib/mail';

// ── Vercel Cron: hourly ──────────────────────────────────────────────────────
// vercel.json: { "crons": [{ "path": "/api/cron/treasury-watch", "schedule": "0 * * * *" }] }
//
// Operator alerting (§5.6): warns when the backend stamp/badge signer's SUI
// runs low (mints start failing silently otherwise) or when the day's
// sponsored USDC approaches SPONSOR_DAILY_CAP_USD. Every alert is logged to
// chain_ops for a durable trail, and emailed to OPERATOR_EMAIL when mail is
// configured — the risk here is drain-by-bot, so noticing early matters more
// than the unit cost.

const LOW_SUI_THRESHOLD_MIST = 100_000_000n; // 0.1 SUI — a few hundred mints of headroom
const BUDGET_ALERT_FRACTION = 0.8;

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (process.env.CRON_SECRET && auth !== expected) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let supabase;
  try {
    supabase = createServiceClient();
  } catch {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const alerts: string[] = [];

  // 1. Backend signer SUI balance.
  const adminAddress = getAdminAddress();
  if (adminAddress) {
    try {
      const bal = await getSuiClient().getBalance({ owner: adminAddress });
      if (BigInt(bal.totalBalance) < LOW_SUI_THRESHOLD_MIST) {
        alerts.push(`Backend signer SUI is low (${bal.totalBalance} MIST) — top it up or Stamp/badge mints will start failing.`);
      }
    } catch (e) {
      alerts.push(`Could not read backend signer balance: ${e instanceof Error ? e.message : 'unknown'}`);
    }
  }

  // 2. Today's sponsored spend vs. the daily cap.
  const capUsd = Number(process.env.SPONSOR_DAILY_CAP_USD || '0');
  if (capUsd > 0) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: today } = await supabase.from('transfers').select('amount_base').gt('created_at', since);
    const spentUsd = (today ?? []).reduce((sum, t) => sum + Number(t.amount_base) / 1e6, 0);
    if (spentUsd >= capUsd * BUDGET_ALERT_FRACTION) {
      alerts.push(`Daily transfer volume is at ${spentUsd.toFixed(0)} USDC — ${Math.round((spentUsd / capUsd) * 100)}% of the ${capUsd} cap.`);
    }
  }

  // 3. Recent chain-op failures worth surfacing.
  const sinceHour = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: failCount } = await supabase
    .from('chain_ops')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'failed')
    .gt('created_at', sinceHour);
  if ((failCount ?? 0) > 0) {
    alerts.push(`${failCount} chain op(s) failed in the last hour — check the chain_ops table.`);
  }

  for (const detail of alerts) {
    await supabase.from('chain_ops').insert({ op_type: 'treasury_alert', status: 'failed', detail });
  }
  if (alerts.length > 0 && isMailConfigured() && process.env.OPERATOR_EMAIL) {
    await sendMail(process.env.OPERATOR_EMAIL, 'WhatsVP treasury alert', `<ul>${alerts.map((a) => `<li>${a}</li>`).join('')}</ul>`);
  }

  return Response.json({ alerts, checked_admin: Boolean(adminAddress) });
}
