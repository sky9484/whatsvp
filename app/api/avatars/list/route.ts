import { NextRequest } from 'next/server';
import { getSuiClient } from '@/lib/sui-server';
import { isMoveConfigured, BUILDER_ID_TYPE, AVATAR_TYPE } from '@/lib/sui-move';

/**
 * GET /api/avatars/list?address=0x...
 * Returns the address's on-chain WhatsVP identity: its soulbound Builder ID and
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
    return Response.json({ builderId: null, cosmetics: [], configured: false });
  }

  try {
    const client = getSuiClient();
    const [builder, avatars] = await Promise.all([
      client.getOwnedObjects({
        owner: address,
        filter: { StructType: BUILDER_ID_TYPE() },
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

    const builderId = builder.data?.[0]?.data ?? null;
    const cosmetics = (avatars.data ?? []).map((o) => o.data).filter(Boolean);

    return Response.json({ builderId, cosmetics, configured: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[avatars/list] RPC error:', msg);
    return Response.json({ builderId: null, cosmetics: [], configured: true, error: msg });
  }
}
