/**
 * The login message a user signs with their wallet to prove control of their
 * Sui address. Shared by the client (which signs it) and the server (which
 * parses + verifies it) so the two can never drift.
 *
 * Format (human-readable — shown in the wallet prompt):
 *   WhatsVP login
 *   Address: 0x...
 *   Issued: <ISO-8601>
 */

const PREFIX = 'WhatsVP login';

export function buildLoginMessage(address: string, issuedAtMs: number): string {
  return `${PREFIX}\nAddress: ${address}\nIssued: ${new Date(issuedAtMs).toISOString()}`;
}

export interface ParsedLoginMessage {
  address: string;
  issuedAt: number;
}

export function parseLoginMessage(message: string): ParsedLoginMessage | null {
  const lines = message.split('\n');
  if (lines[0] !== PREFIX) return null;

  const addressLine = lines.find((l) => l.startsWith('Address: '));
  const issuedLine = lines.find((l) => l.startsWith('Issued: '));
  if (!addressLine || !issuedLine) return null;

  const address = addressLine.slice('Address: '.length).trim();
  const issuedAt = Date.parse(issuedLine.slice('Issued: '.length).trim());
  if (!/^0x[0-9a-fA-F]{1,64}$/.test(address) || !isFinite(issuedAt)) return null;

  return { address, issuedAt };
}

/** Max age of a login signature before it's rejected (replay window). */
export const LOGIN_MESSAGE_MAX_AGE_MS = 5 * 60 * 1000;
