# WhatsVP

**Your city's communities, live.** Horizontal community infrastructure — guilds (any community, not just tech), events, a live map, chat, and a passport of the places you've actually shown up. A run club, a photography crew, a student society, a foodie group, and a Web3 guild all use the same primitives; go-to-market is sequenced one community at a time, but the codebase never assumes the user is a "builder" or crypto-native.

The map is the product. Every flow passes **the auntie test**: a non-technical community organizer can use it without ever seeing crypto vocabulary — wallet/mint/on-chain/gas/NFT never appear outside `Settings → Advanced`.

---

## Status

| Phase | Scope | State |
|---|---|---|
| **0** | Scaffold + MapLibre map of KL, pins, search, filters, near-me | ✅ Built |
| **1** | Luma ingestion (cron) + organize (paste a Luma URL) | ✅ Built |
| **2** | Identity — Enoki zkLogin (Google → Sui address), Settings drawer, gating | ✅ Built |
| **3** | Directions + transit — nearest station + next-departure from GTFS | ✅ Built |
| **4** | Building reveal — flyTo/tilt + **isometric typography** + spinning iso card on click | ✅ Built |
| **5** | Chat — Supabase Realtime groups + topics + messages | ✅ Built |
| **6** | Top-up (USDC on Sui via Enoki — interface only) | ✅ Built (interface only) |
| + | **RSVP**, share, add-to-calendar, premium event card | ✅ Built |

### v2 upgrades

| # | Scope | State |
|---|---|---|
| **1** | Light/dark theme + theme-aware map (light/dark basemap), pin **clustering**, live-presence glow | ✅ Built |
| **2** | Guilds (community homes: directory, roster, events, join, create) | ✅ Built |
| **3** | Sui Move identity (soulbound Passport) + cosmetic Avatars (Kiosk) + GuildBadge, Enoki-sponsored | 🟡 Authored — publish to testnet to activate |
| **4** | External-collection PFP verification (opt-in, read-only EVM) | ✅ Built (needs `EVM_NFT_API_KEY` to activate) |

**Theming** ([lib/theme.tsx](lib/theme.tsx)): class-based dark mode with a no-flash inline script; colours are CSS variables (`--paper`, `--ink`, …) so every Tailwind utility flips automatically. The map swaps between MapTiler `streets-v2` / `streets-v2-dark` (or CARTO Positron / Dark Matter without a key) on toggle, re-adding the pin + 3D-building layers on the new style. Events render from a **clustered GeoJSON source** (`ev-clusters` / `ev-unclustered`), with an animated coral glow on live pins.

**Guilds** ([GuildsDrawer.tsx](components/GuildsDrawer.tsx), migration [004_guilds.sql](supabase/migrations/004_guilds.sql)): a guild is a community's home — directory + search, guild page (banner, roster, events, join), and create. Events carry a `guild_id`; "Show on map" filters the map to a guild. RLS hardened via an adversarial multi-agent review: self-inserts are forced to `role='member'`, and `is_verified`/`badge_type` are service-role-only so the ✓ badge can't be forged.

**Sui Move identity** ([move/whatsvp](move/whatsvp), [lib/sui-move.ts](lib/sui-move.ts)): three modules — `passport` (free soulbound Passport, one per address), `guild` (soulbound GuildBadge, **server-minted** — see the pre-v4 P0 fix below), `cosmetics` (tradable Avatar + royalty `TransferPolicy` for Kiosk). The app auto-mints the Passport on first login, **gaslessly via the Enoki wallet** — no crypto UX. Settings shows the Passport + owned cosmetics ([/api/avatars/list](app/api/avatars/list/route.ts)).

> **To activate Upgrade 3:** publish `move/whatsvp` to testnet (`sui client publish`) and set `NEXT_PUBLIC_WHATSVP_PACKAGE_ID` + `NEXT_PUBLIC_PASSPORT_REGISTRY_ID`. Everything is gated on `isMoveConfigured()`, so without the package IDs the app runs normally and simply skips all on-chain mints. The modules + wiring are authored and type-check, but the Sui toolchain isn't in this build environment, so **publishing and on-chain verification happen on your machine**.

**External-collection PFP** ([ExternalPfpLinker.tsx](components/ExternalPfpLinker.tsx), [/api/pfp/verify](app/api/pfp/verify/route.ts), migration [005_external_pfp.sql](supabase/migrations/005_external_pfp.sql)): opt-in, power-user, read-only. Lives collapsed inside Settings — **behind** the free Sui Passport, never in front of it. Flow: link an EVM wallet by signing a SIWE-style message ([lib/siwe.ts](lib/siwe.ts), no funds move) → server verifies the signature via `viem` (`verifyMessage`, ERC-6492-aware so it covers both EOAs and smart-contract wallets) → checks the collection against an **allowlist** ([lib/externalCollections.ts](lib/externalCollections.ts) — generic, licence-gated; WhatsVP never bundles third-party art) → verifies ownership **read-only** via the Alchemy NFT API → the verified image renders as the avatar with a teal ring. `pfp_*` columns on `profiles` are `REVOKE`d from client roles, so only this server route can set them. `viem` is lazy-loaded (`next/dynamic`) so it never ships to users who don't open this section — confirmed it keeps the main bundle at ~82 kB instead of the ~135 kB it hit when statically imported.

> **To activate Upgrade 4:** get a free key at [alchemy.com](https://www.alchemy.com) and set `EVM_NFT_API_KEY`. Without it the route returns 503 and the rest of the app is unaffected. The SIWE message build/parse logic is unit-tested; the live signature-verification + ownership-check path needs a real Alchemy key to exercise (not available in this build environment).

### v3 — "Every community, live on the map"

Repositioning: **"The live map of the KL builder scene"** → **"Your city's communities, live."** WhatsVP is horizontal community infrastructure, not a crypto/founder-only app — the codebase never assumes the user is a "builder."

| P | Scope | State |
|---|---|---|
| **1** | Reposition + fix pass — renames, copy audit, mixed seed data, responsive nav, design tokens | ✅ Built |
| **2** | Map 2.0 — bottom sheet + carousel, time scrubber | ✅ Built (presence via check-ins deferred to P3) |
| **3** | Core loop — check-in (QR/geofence) → Stamp (new Move module) → Passport, organizer analytics | ✅ Built |
| **4** | Chat 2.0 — guild channels, ephemeral event rooms + photo drops, DMs + mutuals, PWA/push | ✅ Built |
| **5** | Landing & growth — logged-out map hero, SSR `/e/[slug]` `/g/[slug]`, OG images, WhatsApp share | ✅ Built |

**P1 — the auntie test.** `BuilderId` renamed to **Passport** everywhere (Move module [passport.move](move/whatsvp/sources/passport.move), types, routes, UI — nothing was on-chain yet, so this was free). [lib/copy.ts](lib/copy.ts) is now the canonical, grep-able registry of user-facing vocabulary — forbidden words (NFT, wallet, mint, on-chain, blockchain, crypto, Web3, token, gas, Sui, address) are audited out of every component/route except `Settings → Advanced`, which is the one place chain details may appear. [lib/demoEvents.ts](lib/demoEvents.ts) + [seed.sql](supabase/seed.sql) now seed **7 guilds across 8 community types** (run club, photography, badminton, food, student society, board games, founders, Web3) — a Web3 meetup is one community among many, not the default.

**Responsive nav.** [TabBar.tsx](components/TabBar.tsx) — a bottom tab bar (Map/Guilds/Chat/Passport) on `<md` screens; desktop keeps the header's top nav (`how/guilds/organize/chat`). Organize becomes a floating "+" on mobile. MapContainer's four independent drawer-open booleans were replaced with a single `activeDrawer` state — this was also a confirmed audit finding (drawers could stack with undefined dismiss behaviour), fixed as a natural byproduct of building tab-highlighting.

**Design tokens.** `app/globals.css` gained `surface`/`sub`/`info` CSS-variable tokens (light + dark, exact v3 hex values) alongside the existing `paper`/`ink`/`teal`/`live`/`upcoming`/`hairline`; `tailwind.config.ts` gained a type scale (`text-body`, `text-h1`, …) and named radii (`rounded-control`/`card`/`sheet`) for new components to opt into. Satoshi font swap and framer-motion are deferred to the P2 redesign pass — nothing in P1 needed them, and adding either now would be premature.

**P2 — Map 2.0.** Mobile gets a **draggable bottom sheet** ([EventSheet.tsx](components/EventSheet.tsx), `framer-motion`) instead of the floating popup: peek (a synced horizontal card carousel) → half → full, with drag + velocity-biased snapping. Swiping the carousel flies the map to that pin; tapping a pin scrolls the carousel to match. Desktop keeps [EventPopup.tsx](components/EventPopup.tsx) — both now share [lib/useEventDetail.ts](lib/useEventDetail.ts) (transit/RSVP/share/building-upload state) and [EventDetailContent.tsx](components/EventDetailContent.tsx) (the rendered detail body), so a 5th detail surface didn't mean a 5th copy of the logic — a direct fix for the audit's "duplicated drawer chrome" finding. [FilterCard.tsx](components/FilterCard.tsx) was replaced by [SearchBar.tsx](components/SearchBar.tsx) (search + near-me only) plus a new **time scrubber** ([TimeScrubber.tsx](components/TimeScrubber.tsx)) — five segments (Live now / Today / Tomorrow / This week / Past 10 days) computed KL-timezone-safe in [lib/utils.ts](lib/utils.ts) (`matchesSegment`/`segmentCounts`), replacing the old live/upcoming/past status chips. Clustering and theme-aware basemap swapping (v2 Upgrade 1) were untouched by this pass and re-verified working. **Presence** ("N here now" on pins) is spec'd in the v3 brief but genuinely depends on P3's `checkins` table — it's deferred rather than faked with timestamp math dressed up as presence.

**P3 — Check-in → Stamp → Passport.** The retention loop: attend a live event → check in → collect a Stamp → watch your Passport fill up.

- **Check-in** ([/api/checkin](app/api/checkin/route.ts)): two server-verified methods, both requiring login and enforcing one check-in per profile per event (`UNIQUE(event_id, profile_id)`). **Geofence** — the browser's location, checked server-side against the venue (≤300 m, haversine) and the event's time window (30 min before start through 30 min after end); only a coarse SHA-256 hash of the coordinates is stored, never raw lat/lng. **QR** — a TOTP-style code ([lib/checkinCode.ts](lib/checkinCode.ts), dep-free HMAC, mirrors [lib/jwt.ts](lib/jwt.ts)'s approach) that rotates every 30 seconds, keyed off a per-event secret (`events.checkin_secret`, `REVOKE`d from every client DB role — even `SELECT *` on `events` had to become an explicit column list, since Postgres refuses a wildcard select the instant any column's read is revoked). The organizer displays the live code as a QR ([CheckinQR.tsx](components/CheckinQR.tsx)); scanning it opens [/checkin/[event_id]](app/checkin/[event_id]/page.tsx), which auto-submits once the scanner is signed in.
- **Stamp** ([stamp.move](move/whatsvp/sources/stamp.move), [lib/sui-admin.ts](lib/sui-admin.ts)): a soulbound proof-of-attendance, minted only after the check-in above succeeds — **the direct fix for the guild.move audit finding**. Unlike Passport/GuildBadge/cosmetics (all client-signed, Enoki-sponsored), `stamp::mint_to` is gated behind a backend-held `AdminCap` that is `key`-only (no `store` — the other audit fix, learned from `cosmetics::MintCap`) and never reachable from a client-built transaction; the backend signs with its own funded keypair (a hot-wallet pattern, not per-user sponsorship). `/api/checkin` mints fire-and-forget via Next's `after()` so the check-in response doesn't wait on-chain, with one retry on failure. Stamp art is a deterministic generated SVG ([/api/stamp-image/[event_id]](app/api/stamp-image/[event_id]/route.ts)) — same honesty principle as `IsoPhotoBuilding`, not an image model.
- **Passport page** ([app/passport/page.tsx](app/passport/page.tsx)): every Stamp collected, a milestone progress line (First stamp → Regular → Explorer → Legend — display/recognition only, no fake "unlocks"), reachable from the TabBar's Passport tab and Settings. The TabBar's Guilds/Chat tabs still open drawers over the map, but Passport now navigates to a real, shareable page — [MapContainer.tsx](components/MapContainer.tsx) honors a one-shot `?open=guilds|chat` param on mount so linking back from Passport can still reopen the right drawer.
- **Organizer analytics** ([/guilds/[slug]/events/[id]/manage](app/guilds/[slug]/events/[id]/manage/page.tsx)): RSVPs vs. check-ins, a check-in timeline sparkline, attendee list, CSV export (fetched client-side with the auth header and downloaded via a Blob URL, since a plain `<a href>` can't carry a bearer token), and the organizer's live QR code. Reachable via a "Manage" link on your own events inside the Guilds drawer.
- Schema: [006_checkins.sql](supabase/migrations/006_checkins.sql) — renumbered from the brief's proposed `005` to avoid colliding with the real `005_external_pfp.sql` from v2 Upgrade 4.

> **To activate on-chain Stamps:** publish `move/whatsvp` (now including `stamp.move`) to testnet, fund a backend address with a small amount of SUI, transfer that address the `AdminCap` from the module's `init`, and set `STAMP_REGISTRY_ID` / `STAMP_ADMIN_CAP_ID` / `STAMP_ADMIN_PRIVATE_KEY`. Without them, check-ins work fully — they're just recorded in Postgres only, exactly the same graceful degradation as every other Move feature in this app.

**P4 — Chat 2.0 + PWA.** Three tiers on one shared engine ([lib/useRoom.ts](lib/useRoom.ts) — history, Realtime delivery, optimistic send, reactions, presence, all in one place instead of three near-copies), switched via tabs in [ChatDrawer.tsx](components/ChatDrawer.tsx):

- **Guilds** ([GuildChannels.tsx](components/chat/GuildChannels.tsx)): the existing groups → topics chat, unchanged behavior, rebuilt on the shared engine.
- **Live** ([EventRooms.tsx](components/chat/EventRooms.tsx)): an ephemeral room auto-created for every event (a Postgres trigger on `events` INSERT, so it can never be forgotten by a future ingestion path) — opens 24h before start, live through the event, read-only for 48h after, then shows a **recap strip** (photo drops sorted by reaction count) instead of a composer. Access = RSVP'd or checked in, evaluated live. Photo drops upload to a dedicated `event-photos` Storage bucket with a 7-day **application-level** expiry (Supabase Storage has no native TTL — a daily cron, [/api/cron/cleanup-expired](app/api/cron/cleanup-expired/route.ts), does the actual deletion; `expires_at` gates visibility immediately either way).
- **DMs** ([DirectMessages.tsx](components/chat/DirectMessages.tsx)): friend requests + accepted mutuals + threads, with an optional **disappearing mode** (messages get `expires_at = now()+24h`, swept by the same cleanup cron). Thread creation ([/api/dm/start](app/api/dm/start/route.ts)) is the one write that needs the service role — everything else in Chat 2.0 (reactions, RSVP-gated room access, friend requests/responses, photo uploads) is a **direct RLS-authed client write**, matching the existing `event_rsvps` pattern, not a new service-role route per action. A small **"+ friend"** affordance ([AddFriendButton.tsx](components/AddFriendButton.tsx)) lives in the Guilds roster and the organizer attendee list — the only two places you see another real person to befriend.
- **Table stakes**: unread dots (per-conversation, comparing each room's latest message against `room_reads`; a global aggregate badge on the closed drawer's tab icon was scoped out — see below), reply-to, message grouping (consecutive same-sender messages within 3 min don't repeat the name), reactions (👍❤️😂😮), and simple online presence via Supabase Realtime presence tracking. **Typing indicators were deliberately not built** — real infrastructure for a cosmetic signal, lower value than everything else in this list; noted here rather than silently dropped.
- **PWA**: [public/manifest.json](public/manifest.json) + [public/sw.js](public/sw.js) (installable; push + notification-click only — **no offline asset/data caching**, since a live map showing stale cached "live" pins would be actively dishonest) + a Notifications toggle in Settings ([lib/pwa.ts](lib/pwa.ts)) using VAPID web-push. `/api/cron/event-reminders` pushes "starting soon" ~10-20 min before an RSVP'd event; DM sends fire a best-effort push via `/api/push/notify`. **@mention push was not built** — it needs @-handle parsing + resolution to a profile, a distinct feature; only DM push shipped.

> **To activate push:** run `npx web-push generate-vapid-keys` and set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`. Without them the Notifications toggle shows "Soon" and everything else works normally. The PWA install icon is currently SVG-only ([public/icon.svg](public/icon.svg)) — this installs fine on Chrome/Edge/Android; Safari/iOS historically wants a real PNG `apple-touch-icon` for full home-screen fidelity, not yet added.

**P5 — Landing & growth.** No separate marketing site: the logged-out `/` route already shows the real, live map — [HeroOverlay.tsx](components/HeroOverlay.tsx) adds a one-time, dismissible intro card over it (tagline + live counts + "Explore the map" / "How it works") that never reappears once you log in or dismiss it (localStorage), and unmounts entirely once you have an account.

- **SSR share pages**, fast and crawlable without executing JS: [/e/[slug]](app/e/%5Bslug%5D/page.tsx) (an event; "slug" is the event's id — events don't have pretty slugs yet) and [/g/[slug]](app/g/%5Bslug%5D/page.tsx) (a guild — this is the URL the "create guild" form already previewed as `whatsvp.com/g/…` since v2, now real). Each has a matching `opengraph-image.tsx` generating a real PNG via `next/og`'s `ImageResponse` (no `@vercel/og` package needed — it's built into Next.js since 13.3), with a generic fallback card when Supabase isn't configured rather than a broken image.
- **"Open in WhatsVP"** on the event share page deep-links to `/?event=<id>` — [MapContainer.tsx](components/MapContainer.tsx) picks up a one-shot `?event=` param once events have loaded, selects it, and cleans the URL (the same pattern as the `?open=guilds|chat` param from P3).
- **WhatsApp share** ([lib/utils.ts](lib/utils.ts) `whatsAppShareUrl`) — `wa.me` links pointing at the new share pages, added next to the existing share button in the event detail view, the guild page, and the share pages themselves.
- **[/about](app/about/page.tsx)**: how-it-works steps + FAQ, written to describe only what's actually built — an earlier draft claimed you could "create an event under a guild," which isn't a real feature (organizing is Luma-URL-only); caught and corrected before shipping rather than leaving copy that oversells the product.
- Header's "how" nav item now links to `/about` instead of the GitHub repo — the old link was developer-facing, not visitor-facing.
- `lib/copy.ts` gained an `ABOUT` vocabulary group for this phase's strings, continuing the "centralize for future localization" pattern from P1.

**Post-P5 refinements — map filter, building reveal, real wallet withdrawal.**

- **Status filter simplified to 3 segments.** `EventFilter` is now `'past' | 'live' | 'upcoming'` (was 5: live/today/tomorrow/week/past10) — it mirrors `EventStatus` exactly, so `lib/utils.ts`'s filtering collapsed to a direct `event.status === filter` comparison (the old KL-timezone-day-bucketing logic for "today"/"tomorrow" is gone, no longer needed). [TimeScrubber.tsx](components/TimeScrubber.tsx) was replaced by [StatusFilter.tsx](components/StatusFilter.tsx) — three buttons, not a scrollable scrubber, since there's nothing left to scrub. The search + filter card moved from the top of the map to the bottom on both mobile and desktop — on mobile it now stacks directly above the EventSheet's peek carousel (with the live-indicator/empty-state stacked above *that*), verified via `getBoundingClientRect()` to have clean gaps and zero overlap with the carousel or tab bar.
- **Ambient city-wide building extrusion removed.** `add3DBuildings` (the fill-extrusion layer that shaded every OSM building in view, regardless of whether it hosted an event) is gone — non-event buildings now render as the basemap's normal flat footprints, which is cheaper to render and was rendering detail nobody was reading. The per-event "View building in 3D" reveal (the hand-authored `IsoBuilding`/`IsoPhotoBuilding` overlay) is untouched by this and remains the only "special" building treatment — it was always scoped to buildings with an event, so removing the ambient layer doesn't take anything away from that flow.
- **Building reveal is closer and animated.** The reveal camera now flies to `zoom: 18.6` (was 17.5) for a tighter, more street-level framing — `maxPitch`/target pitch deliberately stayed at 70, since MapLibre's own docs flag pitch beyond 60° as "experimental and may result in rendering issues"; the closer zoom carries the "street view" feel instead of pushing pitch into that zone. The iso card itself now floats and slowly spins ([app/globals.css](app/globals.css) `.iso-spin`/`.iso-float`, nested so the entrance animation, the continuous rotation, and the gentle bob each animate their own element instead of fighting over one `transform`) — `perspective` is set on the parent so the `rotateY` spin reads as a card turning in 3D space, not squashing flat. Respects `prefers-reduced-motion`. **Not built yet, deliberately:** true 4-sided rotation showing a building's actual back/left/right faces — that needs real photos from those angles, which no upload flow collects today. The natural next step is a front/back/left/right multi-photo upload (with the building's name + address) feeding a real textured cuboid instead of a single spinning card; flagged for later rather than faked with a repeated single image pretending to be four sides.
- **Wallet: withdraw, not export.** zkLogin addresses have no exportable private key — signing authority comes from a fresh ephemeral key plus a ZK proof of the Google login, re-proven each session, not a stored key. So "type a password to get your private key" isn't something that can be built as asked; the correct equivalent is a real on-chain transfer. [lib/sui.ts](lib/sui.ts) gained `buildSendSuiTx`/`buildTransferObjectTx`, and Settings' "Your account · Advanced" card gained a **Withdraw to another wallet** flow — paste any Sui address (Slush, Phantom, ...; MetaMask doesn't support Sui at all, a different curve/address format) and an amount, `useSignAndExecuteTransaction` sends it. "Max" reserves a small gas buffer rather than emptying the coin used to pay for its own transaction. Passport and Stamps are soulbound by design and can never be included — only SUI balance (and, via `buildTransferObjectTx`, individual transferable Avatars) can move. No new password/2FA/custody infrastructure — this works within zkLogin's actual security model rather than beside it.

### Pre-v4 P0 — audit fixes (2026-07-03)

Two things had to close before any v4 work: the guild.move access-control hole both the product and Move security audits had already flagged (CRITICAL), and an audit of the withdraw flow above against the v4 brief's money-safety rules (confirm screen, server-verified history, caps).

- **`guild::mint` was ungated.** The original function was `public fun mint(guild_slug: String, ctx)` — callable by anyone, for any guild_slug, no membership check at all. Rebuilt on the exact `AdminCap` + `Registry` pattern already proven in [stamp.move](move/whatsvp/sources/stamp.move): `mint_to` now requires a backend-held `AdminCap` and takes `recipient` as an explicit argument. [`/api/guilds/join`](app/api/guilds/join/route.ts) mints server-side via [`lib/sui-admin.ts`](lib/sui-admin.ts)'s `mintGuildBadgeServerSide` (fire-and-forget via `after()`, one retry — same shape as Stamp minting) only *after* it has recorded a real `guild_members` row; the client-side mint call in `GuildsDrawer.tsx` is gone entirely. One backend address now holds both `stamp::AdminCap` and `guild::AdminCap`, so `GUILD_REGISTRY_ID` / `GUILD_ADMIN_CAP_ID` are the only new env vars — they reuse `STAMP_ADMIN_PRIVATE_KEY` as the signer.
- **`cosmetics::MintCap` had `store`.** The sole mint-gating capability could be wrapped, listed in a Kiosk, or moved by any generic store-based mechanism outside the module's control. Changed to `key`-only, matching `stamp::AdminCap` and the new `guild::AdminCap`.
- **`Move.toml` pinned a moving branch, not a commit.** `rev = "framework/testnet"` is a branch ref that can silently point to a different commit tomorrow — non-reproducible builds. Resolved and pinned to its commit SHA as of 2026-07-03 (`git ls-remote`); re-pin deliberately, don't drift back to the branch name.
- **Withdraw had no confirm screen and no server-verified history.** Clicking "Send" fired `signAndExecute` immediately, and nothing was recorded once it succeeded. Settings now shows a distinct **review step** (recipient, amount, network) before signing, and on success posts the digest to [`/api/withdraw/verify`](app/api/withdraw/verify/route.ts), which re-fetches the transaction by digest, confirms the sender matches the caller's session address, derives the recipient + amount from the chain's own balance changes (never trusting what the client reports), and writes the one row to `withdrawals` ([008_p0_audit_fixes.sql](supabase/migrations/008_p0_audit_fixes.sql)) that has no client INSERT policy at all. **Honest limitation:** withdraw is self-custodial and client-signed with no server relay, so no backend check can *block* the on-chain transfer itself — the brief's "caps" are enforceable for sponsored/relayed transfers (v4 §5.5), not this one. What's added instead is a UI-level gate (unlocks 24h after account creation, and once Passport is set up if Move is published) plus the audit trail above.

Neither fix is on-chain yet — same constraint as every Move module in this project (no Sui/Move CLI in this build environment). They're authored and type-check-by-hand-review; publishing + verifying on-chain happens on the operator's machine, and `move/whatsvp` must not be published as `guild.move` previously stood.

---

## Tech stack

- **Next.js 15** (App Router, TypeScript) on **Vercel**
- **MapLibre GL JS** with **MapTiler** vector tiles (CARTO Positron free fallback when no key)
- **Supabase** — Postgres + RLS + Realtime + Storage
- **Enoki (zkLogin)** for crypto-free identity on **Sui** *(Phase 2)*
- **Luma** official API / page-scrape for event ingestion (server-side only)
- **data.gov.my** GTFS for transit *(Phase 3)*
- **Tailwind CSS**

---

## Local setup

### 1. Install

```bash
npm install
```

### 2. Environment

```bash
cp .env.example .env.local
```

Fill in the keys. **Minimum to see the map running:** none — it falls back to free CARTO tiles and dev seed data. To get the full experience, set these:

| Variable | Where to get it | Required for |
|---|---|---|
| `NEXT_PUBLIC_MAPTILER_KEY` | [cloud.maptiler.com](https://cloud.maptiler.com) → Keys (free tier). Add a domain restriction. | Styled vector basemap (CARTO raster fallback without it) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | Reading/writing events |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API | Client reads (RLS-protected) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API (**secret**) | Cron ingestion + organize writes |
| `LUMA_API_KEY` | [lu.ma/settings](https://lu.ma/settings) → Developer (**requires Luma Plus**) | Phase 1 calendar ingestion |
| `LUMA_CALENDAR_ID` | The `cal_…` ID of the calendar you own and curate | Phase 1 |
| `CRON_SECRET` | Any random string; also set it in Vercel env | Securing the cron endpoint |
| `NEXT_PUBLIC_ENOKI_API_KEY` / `ENOKI_SECRET_KEY` | [portal.enoki.mystenlabs.com](https://portal.enoki.mystenlabs.com) | Phase 2 login |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | [console.cloud.google.com](https://console.cloud.google.com) → Credentials → OAuth client | Phase 2 login |
| `STAMP_REGISTRY_ID` / `STAMP_ADMIN_CAP_ID` / `STAMP_ADMIN_PRIVATE_KEY` | From publishing `move/whatsvp` + funding a backend address (see below) | v3 P3 on-chain Stamps |
| `GUILD_REGISTRY_ID` / `GUILD_ADMIN_CAP_ID` | From publishing `move/whatsvp` — reuses `STAMP_ADMIN_PRIVATE_KEY` as the signer | Pre-v4 P0 on-chain GuildBadges |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | `npx web-push generate-vapid-keys` | v3 P4 push notifications |

### 3. Database

Create a Supabase project, then run the migrations **in order** and (optionally) seed data:

```bash
# Using the Supabase SQL editor: paste each file's contents and run, in order.
#   supabase/migrations/001_initial.sql        ← schema + RLS + Realtime
#   supabase/migrations/002_auth.sql           ← re-point RLS at sui_address
#   supabase/migrations/003_buildings.sql      ← building fields + Storage bucket
#   supabase/migrations/004_guilds.sql         ← guilds + guild_members
#   supabase/migrations/005_external_pfp.sql   ← external-collection PFP columns
#   supabase/migrations/006_checkins.sql       ← check-in -> Stamp -> Passport
#   supabase/migrations/007_chat2.sql          ← event rooms, DMs, reactions, push
#   supabase/migrations/008_p0_audit_fixes.sql ← guild badge tracking + withdrawals audit trail
#   supabase/seed.sql                            ← optional KL demo pins

# Or with the Supabase CLI:
supabase db push
psql "$DATABASE_URL" -f supabase/seed.sql
```

### 4. Run

```bash
npm run dev
```

Open <http://localhost:3000>. With the seed data loaded you'll see live (coral) and upcoming (teal) pins across KL.

---

## How it works

```
Browser (Next.js / React)
  ├─ MapLibre map  ── reads events from Supabase (anon client, RLS-protected)
  ├─ SearchBar + StatusFilter ── search + near-me + past/live/upcoming
  ├─ EventPopup (desktop) / EventSheet (mobile) ── event detail, sharing lib/useEventDetail.ts
  └─ OrganizeDrawer ── POSTs a Luma URL to /api/organize

  └─ Enoki zkLogin ── Google OAuth → Sui address → /api/auth/session

Vercel serverless (route handlers + Cron)
  ├─ /api/ingest-luma  (cron */15m) → curated Luma calendar → upsert events
  ├─ /api/organize     → fetch + parse a pasted Luma URL server-side → insert
  ├─ /api/transit      → nearest rail station + next departure from GTFS (cached)
  └─ /api/auth/session → upsert profile + mint Supabase session JWT

Supabase Postgres
  └─ profiles, events, groups, group_members, topics, messages, event_rsvps (+ RLS)
```

**Why server-side Luma?** Luma is CORS-blocked in the browser and has no public discovery API. Discovery pins come from a calendar **you own and curate**; the organize flow fetches any public Luma event page server-side (JSON-LD → `__NEXT_DATA__` → OG-tag fallback).

### Authentication (Phase 2)

Login is **Enoki zkLogin** via dapp-kit's wallet standard — `registerEnokiWallets` registers a Google-backed Sui wallet, and `useConnectWallet` triggers the OAuth pop-up. On success:

1. The browser gets a Sui address (`useCurrentAccount`).
2. [`lib/auth.tsx`](lib/auth.tsx) POSTs it to `/api/auth/session`, which **finds-or-creates** the `profiles` row (service role) and mints a **Supabase session JWT** (`sub` = Sui address) so Postgres RLS recognises the user.
3. The header swaps to a user chip; the **Sui address + balance appear only in the Settings drawer** — never in the main flow (web2-UX principle). `organize` and `chat` are gated behind login.

Migration [`002_auth.sql`](supabase/migrations/002_auth.sql) re-points the RLS policies at `sui_address` (the JWT `sub`). Everything **degrades gracefully**: with no Enoki keys the map still runs and the login button is inert; with no `SUPABASE_JWT_SECRET` login still works (profile created) without the RLS-authed client.

**Proof of address ownership.** On login the client signs a fresh, timestamped message ([lib/authMessage.ts](lib/authMessage.ts)) with the wallet; `/api/auth/session` verifies it with `verifyPersonalMessageSignature` (`@mysten/sui/verify`, with the server Sui client for the zkLogin epoch check) before creating the profile or minting a JWT. A caller cannot mint a session for an address they don't control. Verified end-to-end: a real signature passes, while missing / expired (>5 min) / address-mismatch / tampered all return `401`.

### Transit (Phase 3)

The directions buttons in the event popup are deep links (Google Maps transit + Waze). `/api/transit` returns the nearest rail station and a next-departure estimate from the **data.gov.my GTFS-Static feed** for `rapid-rail-kl` ([lib/gtfs.ts](lib/gtfs.ts)):

1. Downloads + unzips the GTFS feed (`fflate`), parses stops/routes/trips/calendar/frequencies/stop_times. Parsed feed cached **12 h** in memory; per-coordinate results cached **60 s**.
2. Finds the nearest station (haversine, 2 km cutoff), groups interchange platforms by name, determines today's active service from `calendar.txt`.
3. Computes the next departure from the **frequency (headway) windows** — this network is frequency-based, not fixed-timetable — and reports both `next train ~N min` and `every N min`.

> **Key finding (verified against the live feed):** `rapid-rail-kl` has **no GTFS-Realtime feed** — both the vehicle-position and trip-updates endpoints `404` for this category. So departures are schedule-derived and `realtime: false`, exactly the fallback the brief anticipated. `computeNextDeparture` is structured so a realtime overlay can be added later without changing the API contract. The algorithm is pure and was validated end-to-end against real KL coordinates (KLCC→KJL, Bukit Bintang→MRT Kajang, interchanges, out-of-range).

### Building reveal (Phase 4)

Every building on the map renders as the basemap's normal flat footprint — there's no ambient city-wide 3D extrusion (a `fill-extrusion` layer shading every OSM building in view regardless of relevance was built, then deliberately removed post-P5: it cost render performance for detail nobody was reading, since it applied to buildings whether or not they hosted an event). The only "special" building treatment is per-event and explicit: clicking **"View building in 3D"** calls `flyTo` with a close zoom (18.6) and a steep pitch (70, MapLibre's documented-safe ceiling — its own docs flag pitch beyond 60° as "experimental and may result in rendering issues") for a street-level establishing shot, then raises the isometric overlay described below.

**Isometric typography.** Clicking "View building in 3D" also raises a bold **isometric 3D typographic label** over the venue — block letters with a paper face, ink outline and a brand-color (live coral / upcoming teal) extrusion, anchored to the building and tracking the camera as it flies in (HTML overlay in [Map.tsx](components/Map.tsx), styled in [globals.css](app/globals.css) `.iso-stage`). This renders without a MapTiler key (it's HTML/CSS over the map), so it works on the free basemap too.

**Floating + spinning building card.** The iso art itself (`IsoBuilding` or `IsoPhotoBuilding`) floats and slowly turns — `.iso-spin`/`.iso-float` in globals.css, nested inside `.iso-art` so the one-shot entrance, the continuous rotation, and the gentle bob each animate their own element rather than fighting over one `transform`. A `perspective` on the parent makes the `rotateY` read as a card turning in 3D space. This is an honest "floating showcase" effect on a flat image — it does not reveal new building faces, since none of the current art (hand-authored isometric SVGs, or a single community-uploaded photo) has more than one angle to show. Respects `prefers-reduced-motion`.

> **Future: real 4-sided buildings.** The natural next step — not yet built — is a front/back/left/right photo upload (plus the building's name and address) feeding a real textured cuboid that genuinely shows different faces as it turns, with the contributor earning a star on their avatar and a title for supplying it. Flagged here rather than faked with one image repeated on four sides.

**Isometric building art.** [IsoBuilding.tsx](components/IsoBuilding.tsx) renders buildings as true 30° isometric SVG (boxes projected + painter-sorted, three shaded faces). Three **landmarks are hand-authored** from their real massing: **KLCC** (twin tapered towers, 5 setbacks, spires, skybridge), **Millerz Square** (5 slim towers on a podium), **MDEC Cyberjaya** (stepped glass mid-rise — stylized, as its architecture isn't documented). A venue resolves to a landmark by `building_key` or proximity ([lib/buildings.ts](lib/buildings.ts)); the three are in [seed.sql](supabase/seed.sql).

**Community building generator.** Any logged-in user can press **"Add this building"** on a non-landmark venue → uploads a photo to the public `buildings` Supabase Storage bucket → [/api/building](app/api/building/route.ts) records it (first contributor wins; landmarks never overwritten) → it renders as an isometric photo card (`IsoPhotoBuilding`). This is the "help the community" path — a **deterministic isometric stylization**, not a diffusion model; the seam to drop in a real image-to-isometric model is the single `IsoPhotoBuilding` render + the upload route. Requires migration [003_buildings.sql](supabase/migrations/003_buildings.sql) (columns + storage bucket + policies).

### Chat (Phase 5)

[ChatDrawer.tsx](components/ChatDrawer.tsx) — groups → topics (Telegram-style channels) → live messages over **Supabase Realtime**. Reads + message-send happen client-side with the RLS-authed client (the `messages` table has member INSERT/SELECT policies); group/topic creation + joining go through service-role routes (`/api/groups`, `/api/groups/join`, `/api/topics`) since those tables only expose SELECT under RLS. The authed client calls `realtime.setAuth(token)` so RLS-gated channels deliver only messages the user may read.

### RSVP, share, calendar (beat-Luma layer)

The event detail views ([EventPopup.tsx](components/EventPopup.tsx) desktop, [EventSheet.tsx](components/EventSheet.tsx) mobile, both via [EventDetailContent.tsx](components/EventDetailContent.tsx)) add the functions Luma is known for: **one-tap RSVP** (client-side toggle on `event_rsvps`, world-readable counts, optimistic UI, gated behind login), **share** (Web Share API → clipboard fallback), and **add-to-Google-Calendar**, on top of a cover-image hero, live transit, and directions.

---

## Deploy (Vercel)

1. Push to GitHub, import the repo in Vercel.
2. Add every variable from `.env.example` in **Project → Settings → Environment Variables** (including `CRON_SECRET`).
3. Deploy. `vercel.json` registers the `/api/ingest-luma` cron for every 15 minutes.

---

## Project structure

```
app/
  layout.tsx              root layout + metadata + theme no-flash script
  page.tsx                renders <MapContainer/>
  globals.css             Tailwind + CSS vars (light/dark) + pin/drawer/iso styles
  passport/page.tsx       your collected Stamps + milestone progress (v3 P3)
  checkin/[event_id]/page.tsx  QR-scan landing page — auto check-in once signed in (v3 P3)
  guilds/[slug]/events/[id]/manage/page.tsx  organizer attendance analytics (v3 P3)
  about/page.tsx          how-it-works + FAQ (v3 P5)
  e/[slug]/page.tsx + opengraph-image.tsx   public SSR event share page + OG image (v3 P5)
  g/[slug]/page.tsx + opengraph-image.tsx   public SSR guild share page + OG image (v3 P5)
  api/
    ingest-luma/route.ts    cron: curated calendar → events
    organize/route.ts       paste a Luma URL → event (tags host from session)
    transit/route.ts        nearest station + next-departure from GTFS-Static
    auth/session/route.ts   verify signed login message → upsert profile → JWT
    groups|topics/route.ts  chat group/topic creation (service-role, JWT-gated)
    guilds/route.ts         list/create guilds
    guilds/[slug]/route.ts  guild detail (read) + owner branding (PATCH)
    guilds/join/route.ts    join/leave a guild
    guilds/[slug]/events/[id]/manage/route.ts  organizer analytics + CSV export (v3 P3)
    building/route.ts       community building-photo upload → event
    avatars/list/route.ts   owned Passport + cosmetics (Sui RPC, read-only)
    pfp/verify/route.ts     external-collection PFP: SIWE verify + ownership check
    checkin/route.ts        verify + record a check-in, fire-and-forget Stamp mint (v3 P3)
    checkin/qr/[event_id]/route.ts  host-only rotating check-in code (v3 P3)
    stamp-image/[event_id]/route.ts  deterministic generated Stamp SVG (v3 P3)
    passport/route.ts       my profile + every Stamp collected (v3 P3)
    dm/start/route.ts       find-or-create a DM thread with a mutual friend (v3 P4)
    push/subscribe|unsubscribe/route.ts  manage a web-push subscription (v3 P4)
    push/notify/route.ts    best-effort push after a DM send (v3 P4)
    cron/event-reminders/route.ts   "starting soon" push for RSVP'd events (v3 P4)
    cron/cleanup-expired/route.ts   delete expired photos + disappearing DMs (v3 P4)
components/
  chat/
    RoomView.tsx            shared message list + composer: reactions, reply-to, grouping, photo strip (v3 P4)
    GuildChannels.tsx       tier 1 — groups -> topics (existing behavior, now on lib/useRoom.ts)
    EventRooms.tsx          tier 2 — ephemeral per-event rooms + recap strip (v3 P4)
    DirectMessages.tsx      tier 3 — friend requests + DMs + disappearing mode (v3 P4)
  Providers.tsx           theme + react-query + SuiClientProvider + Enoki + toast + auth
  MapContainer.tsx        client orchestrator (state, data fetch, gating, guild filter)
  Map.tsx                 MapLibre: theme-aware style, clustering, iso building-reveal overlay
  IsoBuilding.tsx         isometric SVG landmark renderer + photo-card renderer
  Header.tsx              slim top bar: wordmark + tagline (lg+) + desktop nav + theme toggle + user chip
  TabBar.tsx              bottom tab bar (Map/Guilds/Chat/Passport) — mobile only
  SearchBar.tsx           search + near-me (desktop + mobile)
  StatusFilter.tsx        3-button status filter: past/live/upcoming
  EventPopup.tsx           desktop event detail card (floating, md:block)
  EventSheet.tsx           mobile draggable bottom sheet: peek carousel → half → full (md:hidden)
  EventDetailContent.tsx  shared detail body (time/venue/transit/RSVP/share/building) — used by both
  OrganizeDrawer.tsx       paste-a-Luma-link form (gated)
  ChatDrawer.tsx           groups → topics → Supabase Realtime messages
  GuildsDrawer.tsx         guild directory + guild home (roster/events/join) + create
  SettingsDrawer.tsx       account + balance + withdraw (Advanced) + Passport + cosmetics + external avatar + top-up
  ExternalPfpLinker.tsx    opt-in external wallet link + ownership verify (lazy-loaded)
  PassportMinter.tsx       silent, gasless Passport auto-mint on first login
  CheckinQR.tsx            organizer's self-refreshing rotating check-in QR (v3 P3)
  AddFriendButton.tsx      "+ friend" affordance used in rosters/attendee lists (v3 P4)
  ServiceWorkerRegister.tsx  registers public/sw.js on mount, silent (v3 P4)
  HeroOverlay.tsx          one-time dismissible logged-out landing card (v3 P5)
lib/
  types.ts                shared types
  utils.ts                status derivation, formatting, haversine, filtering, time-segment matching, check-in window
  useEventDetail.ts       shared event-detail state/actions (transit, RSVP, share, building upload, check-in)
  checkinCode.ts          dep-free HMAC TOTP-style rotating check-in code (server-only)
  sui-admin.ts            backend Sui signer for AdminCap-gated Stamp mints (server-only, v3 P3)
  useRoom.ts              shared chat engine: history, Realtime, send, reactions, presence (v3 P4)
  useUnread.ts            per-conversation has-unread flags (v3 P4)
  webPush.ts              server-side VAPID push sending, prunes dead subscriptions (v3 P4)
  pwa.ts                  client push subscribe/unsubscribe helpers (v3 P4)
  luma.ts                 Luma API + HTML parsing (server-only usage)
  gtfs.ts                 GTFS-Static parse + frequency-based next-departure (server-only)
  sui.ts / sui-server.ts  network config, formatting, withdraw tx builders / server-only Sui RPC client
  sui-move.ts             Move package tx builders, gated on isMoveConfigured()
  jwt.ts                  HS256 Supabase JWT sign/verify (server-only, no deps)
  authMessage.ts          Sui login-message build/parse (signature-proof login)
  siwe.ts                 EVM link-message build/parse (external avatar proof)
  buildings.ts            landmark resolution by key or proximity
  externalCollections.ts  allowlisted collections (licence-gated, no bundled art)
  copy.ts                 canonical user-facing vocabulary registry (the auntie test)
  auth.tsx                <AuthProvider> — login/logout, profile, session token
  theme.tsx               <ThemeProvider> — light/dark, persisted, no-flash
  toast.tsx               <ToastProvider> — feedback for every user action
  apiAuth.ts              requireProfile() — JWT → profile for service-role routes
  supabase/client.ts      browser anon + authed (+ Realtime-authed) clients
  supabase/server.ts      service-role client (server-only)
move/whatsvp/             Sui Move package: passport, guild, cosmetics, stamp modules
public/
  manifest.json           PWA manifest (v3 P4)
  sw.js                   service worker — push + notification-click only, no offline caching (v3 P4)
  icon.svg                app icon (SVG; see the PWA note above re: iOS PNG)
supabase/
  migrations/001_initial.sql     schema + RLS + Realtime
  migrations/002_auth.sql        re-point RLS at sui_address (JWT sub)
  migrations/003_buildings.sql   building_key/building_image_url + Storage bucket
  migrations/004_guilds.sql      guilds + guild_members + RLS (hardened)
  migrations/005_external_pfp.sql pfp_* columns, REVOKEd from client roles
  migrations/006_checkins.sql    checkins table + events.checkin_secret/checkin_methods (v3 P3)
  migrations/007_chat2.sql       event_rooms, dm_threads, friendships, reactions, room_reads, event_photos, push_subscriptions (v3 P4)
  seed.sql                       dev demo pins + landmark events + seed guild
```

---

## Product principles (don't break these)

1. **Every community, KL-first.** Horizontal infrastructure for any community type — no tourist mode, no super-app sprawl, no crypto-only default.
2. **The auntie test.** No wallet / mint / on-chain / gas / NFT / crypto vocabulary in the main flow, ever. Chain details show **only in Settings → Advanced**. [lib/copy.ts](lib/copy.ts) is the canonical vocabulary.
3. **Editorial curation, not magic discovery.** Curate your own Luma calendar.
4. **Cost control.** Cache aggressively; prefer free tiers.
5. **One sharp surface.** Everything orbits the map.
