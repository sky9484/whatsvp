/**
 * A minimal Sign-In-With-Ethereum-style login message for linking an EVM wallet
 * to prove ownership of an external NFT PFP. Mirrors lib/authMessage.ts (the Sui
 * login message) so both flows are consistent and independently auditable.
 *
 * This is NOT an identity/auth mechanism — it only proves "this EVM address
 * signed this message", which the server then uses to check NFT ownership on
 * that address. The user's WhatsVP identity remains the Sui Builder ID.
 */

const PREFIX = 'WhatsVP wants you to link this wallet';

export function buildSiweMessage(evmAddress: string, suiAddress: string, issuedAtMs: number): string {
  return [
    PREFIX,
    '',
    `EVM address: ${evmAddress}`,
    `WhatsVP account: ${suiAddress}`,
    `Issued: ${new Date(issuedAtMs).toISOString()}`,
    '',
    'This only links a wallet for optional PFP verification — it does not move funds or change your login.',
  ].join('\n');
}

export interface ParsedSiweMessage {
  evmAddress: string;
  suiAddress: string;
  issuedAt: number;
}

export function parseSiweMessage(message: string): ParsedSiweMessage | null {
  const lines = message.split('\n');
  if (lines[0] !== PREFIX) return null;

  const evmLine = lines.find((l) => l.startsWith('EVM address: '));
  const suiLine = lines.find((l) => l.startsWith('WhatsVP account: '));
  const issuedLine = lines.find((l) => l.startsWith('Issued: '));
  if (!evmLine || !suiLine || !issuedLine) return null;

  const evmAddress = evmLine.slice('EVM address: '.length).trim();
  const suiAddress = suiLine.slice('WhatsVP account: '.length).trim();
  const issuedAt = Date.parse(issuedLine.slice('Issued: '.length).trim());

  if (!/^0x[0-9a-fA-F]{40}$/.test(evmAddress)) return null;
  if (!/^0x[0-9a-fA-F]{1,64}$/.test(suiAddress)) return null;
  if (!isFinite(issuedAt)) return null;

  return { evmAddress, suiAddress, issuedAt };
}

export const SIWE_MESSAGE_MAX_AGE_MS = 5 * 60 * 1000;
