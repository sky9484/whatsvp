/**
 * Canonical user-facing vocabulary for WhatsVP — "the auntie test".
 *
 * A non-technical community organizer must be able to use every flow without
 * ever seeing crypto vocabulary. Forbidden in UI copy (labels, toasts, empty
 * states, onboarding, notifications): NFT, wallet, mint, on-chain, blockchain,
 * crypto, Web3, token, gas, Sui (as user-facing copy), address — except inside
 * `Settings → Advanced`, which is the one place chain details may appear.
 *
 * When adding new user-facing strings anywhere in components/* or app/*,
 * prefer the constants below (or add new ones here) so a future copy audit is
 * a single grep against this file instead of the whole codebase.
 */

// ── Brand vocabulary (replaces crypto terms) ──────────────────────────────────
export const VOCAB = {
  identity: 'Passport', // replaces "wallet" / "on-chain identity"
  attendance: 'stamp', // replaces "mint" (proof of attendance) — v3 P3
  attendancePlural: 'stamps',
  membership: 'badge', // replaces "on-chain membership token"
  membershipPlural: 'badges',
  cosmetic: 'avatar', // replaces "NFT" / "PFP" / "collectible"
  cosmeticPlural: 'avatars',
  account: 'account', // replaces "wallet" when referring to the user's Sui account
} as const;

// ── Tagline / positioning ──────────────────────────────────────────────────────
export const TAGLINE = "Your city's communities, live.";

// ── Nav ──────────────────────────────────────────────────────────────────────
export const NAV = {
  how: 'how',
  guilds: 'guilds',
  organize: 'organize',
  chat: 'chat',
  passport: 'passport',
} as const;

// ── Settings → Identity ────────────────────────────────────────────────────────
export const SETTINGS_IDENTITY = {
  title: `Your ${VOCAB.identity}`,
  activeBadge: 'Active',
  freeBadge: 'Free',
  descriptionNotConfigured:
    `Your free ${VOCAB.identity} is created automatically when you sign in — nothing to buy, nothing to set up.`,
  descriptionActive: `Your passport to every community you're part of.`,
  descriptionPending: `Setting up your ${VOCAB.identity}… it's ready shortly after you sign in.`,
  avatarsLabel: `${VOCAB.cosmeticPlural[0].toUpperCase()}${VOCAB.cosmeticPlural.slice(1)}`,
  avatarsHint: 'cosmetic only',
  avatarsEmpty: `No ${VOCAB.cosmeticPlural} yet — cosmetics are optional and never change your access.`,
} as const;

// ── Settings → Account (Advanced) — the ONLY place chain details may appear ────
export const SETTINGS_ACCOUNT_ADVANCED = {
  sectionLabel: 'Your account · Advanced',
  copyAddress: 'Copy address',
  copied: 'Copied!',
  copy: 'Copy',
  balanceLabel: 'Balance',
} as const;

// ── Settings → Top-up ──────────────────────────────────────────────────────────
export const SETTINGS_TOPUP = {
  title: 'Top up',
  soonBadge: 'Soon',
  description: 'Add funds to your account — no extra fees, nothing else to set up.',
  cta: 'Add funds',
  continueDisabled: 'Continue (coming soon)',
  previewNote: "Payments aren't live yet — this is a preview.",
} as const;

// ── Settings → External collectible avatar (opt-in, advanced) ──────────────────
export const SETTINGS_EXTERNAL_AVATAR = {
  title: 'External collectible avatar',
  subtitle: 'Optional · advanced · read-only ownership check',
  itemPlaceholder: 'Item #',
  itemRequiredError: 'Enter the item # you own in that collection.',
  linkCta: 'Link + verify',
  linkBusy: 'Verifying…',
  removeCta: 'Remove',
  linkedToast: (collection: string, itemId: string) =>
    `Verified! Using your ${collection} #${itemId} as your avatar.`,
  removedToast: 'External avatar removed',
} as const;
