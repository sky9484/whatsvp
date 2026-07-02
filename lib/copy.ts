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

// ── Passport page (v3 P3) ───────────────────────────────────────────────────────
export const PASSPORT_PAGE = {
  title: 'Your Passport',
  loginPrompt: 'Log in to see your Passport.',
  stampsHeading: 'Stamps',
  emptyTitle: 'No stamps yet.',
  emptyHint: 'Check in at a live event to start your Passport.',
  milestones: [
    { count: 1, label: 'First stamp' },
    { count: 5, label: 'Regular' },
    { count: 10, label: 'Explorer' },
    { count: 25, label: 'Legend' },
  ],
} as const;

// ── Check-in (v3 P3) ────────────────────────────────────────────────────────────
export const CHECKIN = {
  cta: 'Check in',
  busy: 'Checking in…',
  successToast: "You're checked in — stamp added to your Passport.",
  alreadyToast: "You're already checked in.",
  tooFarError: "You're not close enough to this event to check in.",
  notOpenError: "Check-in isn't open for this event right now.",
  loginRequired: 'Log in to check in.',
  qrScanTitle: 'Checking you in…',
  qrExpiredError: 'That code has expired — ask the organizer to refresh it.',
  organizerCodeTitle: 'Check-in code',
  organizerCodeHint: 'Have attendees scan this to check in.',
} as const;

// ── About page (v3 P5) ──────────────────────────────────────────────────────────
export const ABOUT = {
  title: 'How WhatsVP works',
  intro:
    "WhatsVP is a live map of what's happening in your city — run clubs, photography walks, food crawls, " +
    "student societies, board games nights, founders meetups, and everything in between. No separate app " +
    'for each community. One map, live.',
  steps: [
    {
      title: 'Find something happening',
      body: 'The map shows events near you — live right now (coral), upcoming (teal), or in the past 10 days. Filter by time or search by name.',
    },
    {
      title: 'RSVP, then check in',
      body: "RSVP if you're planning to go. When you actually show up, check in — scan the organizer's code or just tap Check in with your location. That's what fills your Passport.",
    },
    {
      title: 'Collect stamps',
      body: 'Every check-in adds a stamp to your Passport — a simple, honest record of the communities you actually showed up for, not just the ones you clicked "interested" on.',
    },
    {
      title: 'Join a guild',
      body: "A guild is a community's home base on WhatsVP — its own page, roster, and events. Join the ones you're part of to see their events and channels.",
    },
    {
      title: 'Chat three ways',
      body: 'Guild channels for ongoing conversation, a live room for each event (open the day before, archived after), and DMs with people you both agreed to connect with.',
    },
  ],
  faq: [
    { q: 'Do I need an account to see the map?', a: 'No. The map is open to everyone. Logging in unlocks RSVPs, check-ins, chat, and organizing events.' },
    { q: 'Is it free?', a: 'Yes. Your Passport and every stamp are free — nothing to buy, nothing to set up.' },
    { q: "What's a Passport?", a: "Your identity on WhatsVP — created automatically the first time you log in. It's yours, and it holds every stamp you collect." },
    { q: "What's a Stamp?", a: 'Proof you actually attended an event, added the moment you check in. Unlike an RSVP, it can\'t be faked from your couch.' },
    {
      q: 'Does WhatsVP track my location?',
      a: "Only when you tap Check in, and only to confirm you're near the venue — we never store your exact coordinates, and we never track you in the background.",
    },
    { q: 'Can I organize an event?', a: "Yes — paste a Luma link for any physical event and we'll add it to the map with a pin and, automatically, its own event room." },
  ],
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
