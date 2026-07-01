import { NextRequest } from 'next/server';
import { createPublicClient, http, type Chain } from 'viem';
import { mainnet, polygon, base, arbitrum } from 'viem/chains';
import { createServiceClient } from '@/lib/supabase/server';
import { verifySupabaseJwt } from '@/lib/jwt';
import { parseSiweMessage, SIWE_MESSAGE_MAX_AGE_MS } from '@/lib/siwe';
import { findAllowedCollection, alchemyNetwork } from '@/lib/externalCollections';

/**
 * POST /api/pfp/verify
 * Body: { message: string, signature: string, token_id: string }
 *
 * Opt-in, read-only external-PFP verification (Upgrade 4). Flow:
 *   1. Caller must already be logged in (Supabase session JWT) — this sits
 *      BEHIND the free Sui Builder ID, never in front of it.
 *   2. The posted `message` is a SIWE-style message (lib/siwe.ts) the user signed
 *      with their EVM wallet, naming their own Sui address — verified here via
 *      viem (supports both EOA and ERC-1271 smart-contract wallets).
 *   3. The message's contract/chain must be on the allowlist
 *      (lib/externalCollections.ts) — no unlicensed third-party collections.
 *   4. Ownership of `token_id` at that contract is checked READ-ONLY via the
 *      Alchemy NFT API (no on-chain write, no bridge, no multichain mint).
 *   5. On success, profiles.pfp_* is set (service role only — these columns are
 *      REVOKEd from client roles in 005_external_pfp.sql, so this route is the
 *      only way to set them).
 */

const CHAINS: Record<string, Chain> = { ethereum: mainnet, polygon, base, arbitrum };

export async function POST(request: NextRequest) {
  let supabase;
  try {
    supabase = createServiceClient();
  } catch {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const auth = request.headers.get('authorization');
  const claims = auth?.startsWith('Bearer ') ? verifySupabaseJwt(auth.slice(7)) : null;
  if (!claims?.sub) return Response.json({ error: 'Login required' }, { status: 401 });

  let body: { message?: string; signature?: string; token_id?: string; chain?: string; contract?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { message, signature, token_id, chain, contract } = body;
  if (!message || !signature || !token_id || !chain || !contract) {
    return Response.json(
      { error: 'message, signature, token_id, chain, and contract are required' },
      { status: 400 }
    );
  }

  // 1. Message must name this exact (already-authenticated) Sui address.
  const parsed = parseSiweMessage(message);
  if (!parsed) return Response.json({ error: 'Unrecognised link message' }, { status: 400 });
  if (parsed.suiAddress.toLowerCase() !== claims.sub.toLowerCase()) {
    return Response.json({ error: 'Message does not match your account' }, { status: 401 });
  }
  if (Math.abs(Date.now() - parsed.issuedAt) > SIWE_MESSAGE_MAX_AGE_MS) {
    return Response.json({ error: 'Link message expired — please retry' }, { status: 401 });
  }

  // 2. Collection must be allowlisted (never arbitrary third-party art).
  const collection = findAllowedCollection(chain, contract);
  if (!collection) {
    return Response.json({ error: 'That collection is not supported yet' }, { status: 422 });
  }

  const viemChain = CHAINS[collection.chain];
  const apiKey = process.env.EVM_NFT_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'External PFP verification is not configured' }, { status: 503 });
  }

  // 3. Verify the EVM signature (EOA ecrecover OR ERC-1271 smart-contract wallet).
  const client = createPublicClient({
    chain: viemChain,
    transport: http(`https://${alchemyNetwork(collection.chain)}.g.alchemy.com/v2/${apiKey}`),
  });

  let signatureValid = false;
  try {
    signatureValid = await client.verifyMessage({
      address: parsed.evmAddress as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });
  } catch (err) {
    console.warn('[pfp/verify] signature check error:', err instanceof Error ? err.message : err);
  }
  if (!signatureValid) {
    return Response.json({ error: 'Signature verification failed' }, { status: 401 });
  }

  // 4. Read-only ownership check via Alchemy NFT API (no write, no bridge).
  let ownsToken = false;
  let imageUrl: string | null = null;
  try {
    const url = new URL(`https://${alchemyNetwork(collection.chain)}.g.alchemy.com/nft/v3/${apiKey}/getNFTsForOwner`);
    url.searchParams.set('owner', parsed.evmAddress);
    url.searchParams.append('contractAddresses[]', collection.contract);
    url.searchParams.set('withMetadata', 'true');
    url.searchParams.set('pageSize', '100');

    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Alchemy API ${res.status}`);
    const data = await res.json();

    const owned = (data.ownedNfts ?? []).find(
      (n: { tokenId?: string }) => n.tokenId === token_id
    );
    if (owned) {
      ownsToken = true;
      imageUrl = owned.image?.cachedUrl ?? owned.image?.originalUrl ?? owned.raw?.metadata?.image ?? null;
    }
  } catch (err) {
    console.error('[pfp/verify] ownership check error:', err instanceof Error ? err.message : err);
    return Response.json({ error: 'Could not verify ownership — try again shortly' }, { status: 502 });
  }

  if (!ownsToken) {
    return Response.json(
      { error: `That address does not own token #${token_id} in ${collection.name}` },
      { status: 403 }
    );
  }

  // 5. Persist — service role only (client roles have these columns REVOKEd).
  const { data: profile, error } = await supabase
    .from('profiles')
    .update({
      pfp_chain: collection.chain,
      pfp_contract: collection.contract,
      pfp_token_id: token_id,
      pfp_image_url: imageUrl,
      pfp_verified_at: new Date().toISOString(),
    })
    .eq('sui_address', claims.sub)
    .select()
    .single();

  if (error) {
    console.error('[pfp/verify] update error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ profile });
}

/** DELETE /api/pfp/verify — unlink the external PFP (revert to the default avatar). */
export async function DELETE(request: NextRequest) {
  let supabase;
  try {
    supabase = createServiceClient();
  } catch {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const auth = request.headers.get('authorization');
  const claims = auth?.startsWith('Bearer ') ? verifySupabaseJwt(auth.slice(7)) : null;
  if (!claims?.sub) return Response.json({ error: 'Login required' }, { status: 401 });

  const { error } = await supabase
    .from('profiles')
    .update({
      pfp_chain: null,
      pfp_contract: null,
      pfp_token_id: null,
      pfp_image_url: null,
      pfp_verified_at: null,
    })
    .eq('sui_address', claims.sub);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
