import crypto from 'node:crypto';

/**
 * Minimal HS256 JWT signer — no external dependency.
 * Used server-side to mint a Supabase-compatible session token so that
 * Postgres RLS (`auth.jwt() ->> 'sub'`, `auth.role()`) recognises the user.
 *
 * The token MUST be signed with the project's JWT secret
 * (Supabase → Project Settings → API → JWT Secret), exposed as SUPABASE_JWT_SECRET.
 */

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export interface SupabaseClaims {
  sub: string;            // we use the Sui address as the stable user id
  role?: string;          // 'authenticated'
  [key: string]: unknown;
}

/** Sign a Supabase session JWT. Returns null if no secret is configured. */
export function signSupabaseJwt(
  claims: SupabaseClaims,
  ttlSeconds = 60 * 60 * 24 * 7 // 7 days
): string | null {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return null;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    aud: 'authenticated',
    role: 'authenticated',
    iat: now,
    exp: now + ttlSeconds,
    ...claims,
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest();

  return `${data}.${base64url(signature)}`;
}

/** Verify a Supabase session JWT and return its claims, or null if invalid. */
export function verifySupabaseJwt(token: string): SupabaseClaims | null {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, signature] = parts;

  const expected = base64url(
    crypto.createHmac('sha256', secret).update(`${encodedHeader}.${encodedPayload}`).digest()
  );

  // Constant-time comparison
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64').toString('utf-8')
    ) as SupabaseClaims & { exp?: number };
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
