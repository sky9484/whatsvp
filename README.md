# WhatsVP

The live map of the **Kuala Lumpur builder & founder scene**. Discover events (live + upcoming) on a precise KL map, get directions and the nearest train line, organize your own events by pasting a Luma link, and connect with the community.

Builder-first, KL-first. The map is the product.

---

## Status

| Phase | Scope | State |
|---|---|---|
| **0** | Scaffold + MapLibre map of KL, pins, search, filters, near-me | ✅ Built |
| **1** | Luma ingestion (cron) + organize (paste a Luma URL) | ✅ Built |
| **2** | Identity — Enoki zkLogin (Google → Sui address), Settings drawer, gating | ✅ Built |
| **3** | Directions + transit — nearest station + next-departure from GTFS | ✅ Built |
| **4** | Real 3D buildings — fill-extrusion + flyTo/tilt + **isometric typography** on click | ✅ Built (needs MapTiler key for extrusion) |
| **5** | Chat — Supabase Realtime groups + topics + messages | ✅ Built |
| **6** | Top-up (USDC on Sui via Enoki — interface only) | ✅ Built (interface only) |
| + | **RSVP**, share, add-to-calendar, premium event card | ✅ Built |

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
| `NEXT_PUBLIC_MAPTILER_KEY` | [cloud.maptiler.com](https://cloud.maptiler.com) → Keys (free tier). Add a domain restriction. | Styled basemap + Phase 4 3D buildings |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | Reading/writing events |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API | Client reads (RLS-protected) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API (**secret**) | Cron ingestion + organize writes |
| `LUMA_API_KEY` | [lu.ma/settings](https://lu.ma/settings) → Developer (**requires Luma Plus**) | Phase 1 calendar ingestion |
| `LUMA_CALENDAR_ID` | The `cal_…` ID of the calendar you own and curate | Phase 1 |
| `CRON_SECRET` | Any random string; also set it in Vercel env | Securing the cron endpoint |
| `NEXT_PUBLIC_ENOKI_API_KEY` / `ENOKI_SECRET_KEY` | [portal.enoki.mystenlabs.com](https://portal.enoki.mystenlabs.com) | Phase 2 login |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | [console.cloud.google.com](https://console.cloud.google.com) → Credentials → OAuth client | Phase 2 login |

### 3. Database

Create a Supabase project, then run the migration and (optionally) seed data:

```bash
# Using the Supabase SQL editor: paste each file's contents and run.
#   supabase/migrations/001_initial.sql   ← schema + RLS + Realtime
#   supabase/seed.sql                       ← optional KL demo pins

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
  ├─ FilterCard    ── search + live/upcoming chips + near-me geolocate
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

### 3D buildings (Phase 4)

[Map.tsx](components/Map.tsx) adds a `fill-extrusion` layer (`add3DBuildings`) that renders OSM building footprints in 3D using the OpenMapTiles `render_height` / `render_min_height` properties, inserted below the label layers and growing in from zoom 14→16. Clicking **"View building"** in the popup calls `flyTo` with `pitch: 60` + a slight bearing so the venue's actual building extrudes in isometric; closing the popup eases the camera back to flat.

> **Requires a MapTiler key.** 3D needs **vector** tiles — the keyless CARTO Positron fallback is raster and can't extrude, so `add3DBuildings` detects the absence of a `building` source-layer and no-ops (the map still works, just flat). This matches the brief: *"MapTiler vector required for 3D buildings."* Set `NEXT_PUBLIC_MAPTILER_KEY` to see it. The layer-detection + flyTo code is verified to initialise without client errors on the raster fallback; the extrusion itself is only visible with the key.

**Isometric typography.** Clicking "View building in 3D" also raises a bold **isometric 3D typographic label** over the venue — block letters with a paper face, ink outline and a brand-color (live coral / upcoming teal) extrusion, anchored to the building and tracking the camera as it flies in (HTML overlay in [Map.tsx](components/Map.tsx), styled in [globals.css](app/globals.css) `.iso-stage`). This renders without a MapTiler key (it's HTML/CSS over the map), so it works on the free basemap too.

**Isometric building art.** [IsoBuilding.tsx](components/IsoBuilding.tsx) renders buildings as true 30° isometric SVG (boxes projected + painter-sorted, three shaded faces). Three **landmarks are hand-authored** from their real massing: **KLCC** (twin tapered towers, 5 setbacks, spires, skybridge), **Millerz Square** (5 slim towers on a podium), **MDEC Cyberjaya** (stepped glass mid-rise — stylized, as its architecture isn't documented). A venue resolves to a landmark by `building_key` or proximity ([lib/buildings.ts](lib/buildings.ts)); the three are in [seed.sql](supabase/seed.sql).

**Community building generator.** Any logged-in user can press **"Add this building"** on a non-landmark venue → uploads a photo to the public `buildings` Supabase Storage bucket → [/api/building](app/api/building/route.ts) records it (first contributor wins; landmarks never overwritten) → it renders as an isometric photo card (`IsoPhotoBuilding`). This is the "help the community" path — a **deterministic isometric stylization**, not a diffusion model; the seam to drop in a real image-to-isometric model is the single `IsoPhotoBuilding` render + the upload route. Requires migration [003_buildings.sql](supabase/migrations/003_buildings.sql) (columns + storage bucket + policies).

### Chat (Phase 5)

[ChatDrawer.tsx](components/ChatDrawer.tsx) — groups → topics (Telegram-style channels) → live messages over **Supabase Realtime**. Reads + message-send happen client-side with the RLS-authed client (the `messages` table has member INSERT/SELECT policies); group/topic creation + joining go through service-role routes (`/api/groups`, `/api/groups/join`, `/api/topics`) since those tables only expose SELECT under RLS. The authed client calls `realtime.setAuth(token)` so RLS-gated channels deliver only messages the user may read.

### RSVP, share, calendar (beat-Luma layer)

The event card ([EventPopup.tsx](components/EventPopup.tsx)) adds the functions Luma is known for: **one-tap RSVP** (client-side toggle on `event_rsvps`, world-readable counts, optimistic UI, gated behind login), **share** (Web Share API → clipboard fallback), and **add-to-Google-Calendar**, on top of a cover-image hero, live transit, and directions.

---

## Deploy (Vercel)

1. Push to GitHub, import the repo in Vercel.
2. Add every variable from `.env.example` in **Project → Settings → Environment Variables** (including `CRON_SECRET`).
3. Deploy. `vercel.json` registers the `/api/ingest-luma` cron for every 15 minutes.

---

## Project structure

```
app/
  layout.tsx            root layout + metadata
  page.tsx              renders <MapContainer/>
  globals.css           Tailwind + pin/drawer styles + CSS vars
  api/
    ingest-luma/route.ts  cron: curated calendar → events
    organize/route.ts     paste a Luma URL → event (tags host from session)
    transit/route.ts      nearest rail station (Phase 3 stub)
    auth/session/route.ts upsert profile + mint Supabase JWT
components/
  Providers.tsx         react-query + SuiClientProvider + Enoki wallets + WalletProvider
  MapContainer.tsx      client orchestrator (state, data fetch, gating)
  Map.tsx               MapLibre instance + markers (client-only)
  Header.tsx            wordmark + nav + login / user chip
  FilterCard.tsx        search + chips + near-me
  EventPopup.tsx        event detail + transit + directions
  OrganizeDrawer.tsx    paste-a-Luma-link form (gated)
  SettingsDrawer.tsx    Sui address + balance + top-up (only place address shows)
lib/
  types.ts              shared types
  utils.ts              status derivation, formatting, haversine, filtering
  luma.ts               Luma API + HTML parsing (server-only usage)
  gtfs.ts               GTFS-Static parse + frequency-based next-departure (server-only)
  sui.ts                network config + address/SUI formatting
  jwt.ts                HS256 Supabase JWT sign/verify (server-only, no deps)
  auth.tsx              <AuthProvider> — login/logout, profile, session token
  supabase/client.ts    browser anon + authed clients
  supabase/server.ts    service-role client (server-only)
supabase/
  migrations/001_initial.sql   schema + RLS + Realtime
  migrations/002_auth.sql      re-point RLS at sui_address (JWT sub)
  seed.sql                       dev demo pins
```

---

## Product principles (don't break these)

1. **Builder-first, KL-first.** No tourist mode, no super-app sprawl.
2. **Web2 UX.** No seed phrases / gas / chain names in the main flow. The Sui address shows **only in Settings**.
3. **Editorial curation, not magic discovery.** Curate your own Luma calendar.
4. **Cost control.** Cache aggressively; prefer free tiers.
5. **One sharp surface.** Everything orbits the map.
