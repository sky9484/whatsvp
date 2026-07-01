/**
 * Allowlist of external NFT collections a user may verify as their PFP.
 * This is GENERIC, READ-ONLY ownership verification — WhatsVP never bundles or
 * sells third-party art. A collection is added here only when licensing allows it:
 * e.g. Pudgy Penguins is listed under the holder-owns-their-own model (a Pudgy
 * holder has commercial rights to their own penguin via OverpassIP) — the holder
 * uses THEIR OWN penguin as a PFP; WhatsVP hosts no Pudgy art.
 *
 * This whole feature sits behind the free Sui Builder ID, is strictly opt-in, and
 * is never required to onboard — mainstream users never see it.
 */

export interface ExternalCollection {
  chain: 'ethereum' | 'polygon' | 'base' | 'arbitrum';
  contract: string; // lowercase contract address
  name: string;
}

export const ALLOWED_COLLECTIONS: ExternalCollection[] = [
  { chain: 'ethereum', contract: '0xbd3531da5cf5857e7cfaa92426877b022e612cf8', name: 'Pudgy Penguins' },
  { chain: 'ethereum', contract: '0x524cab2ec69124574082676e6f654a18df49a048', name: 'Lil Pudgys' },
  // Add more allowlisted collections here (with a licence / holder-owns-own basis).
];

export function findAllowedCollection(chain: string, contract: string): ExternalCollection | null {
  const c = contract.toLowerCase();
  return (
    ALLOWED_COLLECTIONS.find((x) => x.chain === chain && x.contract === c) ?? null
  );
}

/** Alchemy network slug for a chain. */
export function alchemyNetwork(chain: ExternalCollection['chain']): string {
  return {
    ethereum: 'eth-mainnet',
    polygon: 'polygon-mainnet',
    base: 'base-mainnet',
    arbitrum: 'arb-mainnet',
  }[chain];
}
