import { NextRequest } from 'next/server';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { createServiceClient } from '@/lib/supabase/server';
import { signSupabaseJwt } from '@/lib/jwt';
import { getSuiClient } from '@/lib/sui-server';
import { parseLoginMessage, LOGIN_MESSAGE_MAX_AGE_MS } from '@/lib/authMessage';

/**
 * POST /api/auth/session
 * Body: { sui_address, bytes, signature, display_name?, avatar_url?, oauth_sub? }
 *   - bytes:     base64 of the signed login message (from the wallet)
 *   - signature: base64 wallet signature over those bytes
 *
 * Called right after a successful Enoki zkLogin. The caller must prove control
 * of the Sui address by signing a fresh login message; the server verifies that
 * signature (works for zkLogin + standard signatures via verifyPersonalMessage-
 * Signature) before finding/creating the profile and minting a Supabase JWT keyed
 * on the Sui address. This closes the impersonation gap from the earlier phase.
 */
export async function POST(request: NextRequest) {
  let body: {
    sui_address?: string;
    bytes?: string;
    signature?: string;
    display_name?: string;
    avatar_url?: string;
    oauth_sub?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const address = body.sui_address?.trim();
  if (!address || !/^0x[0-9a-fA-F]{1,64}$/.test(address)) {
    return Response.json({ error: 'A valid sui_address is required' }, { status: 400 });
  }

  if (!body.bytes || !body.signature) {
    return Response.json(
      { error: 'A signed login message (bytes + signature) is required' },
      { status: 401 }
    );
  }

  // ── Verify the wallet signature proves control of `address` ──────────────────
  let messageBytes: Uint8Array;
  let messageText: string;
  try {
    messageBytes = new Uint8Array(Buffer.from(body.bytes, 'base64'));
    messageText = new TextDecoder().decode(messageBytes);
  } catch {
    return Response.json({ error: 'Malformed login message' }, { status: 400 });
  }

  const parsed = parseLoginMessage(messageText);
  if (!parsed) {
    return Response.json({ error: 'Unrecognised login message' }, { status: 400 });
  }
  if (parsed.address.toLowerCase() !== address.toLowerCase()) {
    return Response.json({ error: 'Login message address mismatch' }, { status: 401 });
  }
  if (Math.abs(Date.now() - parsed.issuedAt) > LOGIN_MESSAGE_MAX_AGE_MS) {
    return Response.json({ error: 'Login message expired — please retry' }, { status: 401 });
  }

  try {
    // Throws if the signature is invalid for `address` (zkLogin needs the client
    // to check the proof against the current epoch).
    await verifyPersonalMessageSignature(messageBytes, body.signature, {
      address,
      client: getSuiClient(),
    });
  } catch (err) {
    console.warn('[auth/session] signature verification failed:', err instanceof Error ? err.message : err);
    return Response.json({ error: 'Signature verification failed' }, { status: 401 });
  }

  // ── Find or create the profile (service role) ────────────────────────────────
  let supabase;
  try {
    supabase = createServiceClient();
  } catch {
    return Response.json(
      { error: 'Supabase is not configured on the server' },
      { status: 503 }
    );
  }

  const { data: existing, error: selErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('sui_address', address)
    .maybeSingle();

  if (selErr) {
    console.error('[auth/session] select error:', selErr);
    return Response.json({ error: selErr.message }, { status: 500 });
  }

  let profile = existing;

  if (!profile) {
    const displayName =
      body.display_name?.trim() ||
      `Builder ${address.slice(2, 6)}`; // friendly default, never the full address

    const { data: created, error: insErr } = await supabase
      .from('profiles')
      .insert({
        sui_address: address,
        oauth_sub: body.oauth_sub ?? null,
        display_name: displayName,
        avatar_url: body.avatar_url ?? null,
      })
      .select()
      .single();

    if (insErr) {
      console.error('[auth/session] insert error:', insErr);
      return Response.json({ error: insErr.message }, { status: 500 });
    }
    profile = created;
  }

  // Mint a Supabase session JWT (sub = sui_address). Null if SUPABASE_JWT_SECRET
  // isn't set — login still works, just without RLS-authed client writes.
  const token = signSupabaseJwt({ sub: address, role: 'authenticated' });

  return Response.json({ profile, token });
}
