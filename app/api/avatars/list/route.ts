import { NextRequest } from 'next/server';
import { getSuiClient } from '@/lib/sui-server';
import { isMoveConfigured, PASSPORT_TYPE, AVATAR_TYPE } from '@/lib/sui-move';

/**
 * GET /api/avatars/list?address=0x...
 * Returns the address's on-chain WhatsVP identity: its soulbound Passport and
 * any owned cosmetic Avatars (read-only via Sui RPC getOwnedObjects).
 *
 * Public read (owned objects are public). Returns empty until the Move package
 * is published (NEXT_PUBLIC_WHATSVP_PACKAGE_ID set).
 */
export async function GET(request: NextRequest) {
  const address = new URL(request.url).searchParams.get('address')?.trim();
  if (!address || !/^0x[0-9a-fA-F]{1,64}$/.test(address)) {
    return Response.json({ error: 'A valid address is required' }, { status: 400 });
  }

  if (!isMoveConfigured()) {
    return Response.json({ passport: null, cosmetics: [], configured: false });
  }

  try {
    const client = getSuiClient();
    const [passportRes, avatars] = await Promise.all([
      client.getOwnedObjects({
        owner: address,
        filter: { StructType: PASSPORT_TYPE() },
        options: { showContent: true, showDisplay: true },
        limit: 1,
      }),
      client.getOwnedObjects({
        owner: address,
        filter: { StructType: AVATAR_TYPE() },
        options: { showContent: true, showDisplay: true },
        limit: 50,
      }),
    ]);

    const passport = passportRes.data?.[0]?.data ?? null;
    const cosmetics = (avatars.data ?? []).map((o) => o.data).filter(Boolean);

    return Response.json({ passport, cosmetics, configured: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[avatars/list] RPC error:', msg);
    return Response.json({ passport: null, cosmetics: [], configured: true, error: msg });
  }
}
