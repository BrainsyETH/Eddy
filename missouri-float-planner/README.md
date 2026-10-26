# Eddy

Your Missouri float trip assistant. Plan trips on Ozarks rivers with real-time water conditions, access points, and float time estimates — powered by live USGS gauge data.

## Features

- **Interactive Map**: Click to select put-in and take-out points
- **Real-time Conditions**: Live USGS gauge data with floatability ratings
- **Float Time Estimates**: Calculated based on vessel type and water levels
- **Shuttle Planning**: Drive-back time and distance
- **Shareable Plans**: Generate URLs to share your float plan

River pages place “Find a float on this river” near the bottom, after the river
guide and before the feedback link, when float search is enabled for the web.

## Web navigation

The main links are **Conditions**, **Map**, **Floats**, and **Guides**, with a
separate app link. Conditions uses the existing `/rivers` and `/dams` pages as
linked tabs; `/gauges` remains part of Conditions. Map opens Build a Route at
`/plan`. Floats links to `/find-float` when web discovery is enabled and is hidden
otherwise. The planning page links use the iOS
labels **Find a Route** and **Build a Route**. The planner tabs belong only to
`/plan`, never shared plans at `/plan/[shortCode]`. These are normal links, with
no hover menus or nested mobile menus.

On river and access pages, Map and Floats preserve the river slug. On the map,
finder, and planner they follow the current URL selection; unrelated pages
start without a remembered river. Planning tabs retain existing endpoints. Only
the planner forwards its URL vessel; finder result links supply the selected
vessel instead of forwarding an old URL value. The map's URL is the source of
its river/gauge selection and condition filters, including browser history and
query-only navigation. Loading catalogue data never replaces an incoming deep link.

The homepage shows **Daily River Report**, real condition cards, the two route
actions, river guides, and the iPhone app. The hero links to Build a Route. The
Live River Map card opens `/river-map` without a separate header link.
River reports appear directly under the heading without a second alert summary.
Report photos prefer the bundled guide covers over older external URLs. Eddy's
existing colors, fonts, artwork, and condition badges are reused. Website widgets
remain in the footer.

`npm run test:navigation` runs fixture-backed browser checks at desktop, 390px,
and 320px widths, including keyboard/touch navigation and river selection across
the planner, map history, refresh, the finder, shared-plan tab isolation, and
report photo loading. It also times filter toggles with 60 rivers at 6× CPU slowdown. It uses
Playwright Chromium, starts a local development server, and removes its temporary
fixture routes afterward. It does not require production credentials.
Screenshots go to `/tmp/eddy-navigation`
(override with `NAV_SMOKE_OUTPUT`).

For map performance, first build `/river-map` with
`npm run build -- --webpack --debug-build-paths=app/river-map/page.tsx`, then run
`NAV_SMOKE_PRODUCTION_MAP=1 npm run test:navigation`. This starts the optimized
build and enforces a 250ms click-to-painted-state budget under the same throttle.
Development timings are diagnostic only. Production mode uses API fixtures but
does not create any fixture routes.

## Find a Route

The finder places preferences beside photo-led discovery/results on desktop
and stacks them on narrow screens. One destination field offers rivers from
the catalogue and town suggestions after a 350ms pause. The destination field
uses a combobox/listbox: arrow keys move through suggestions while input keeps
focus, Enter chooses, Escape dismisses, and Tab moves to the next control.
Selecting a river clears the nearby location; selecting a town or device
location clears the river. Typed text must be resolved to a selection before
searching. Coordinates and town
suggestions stay in memory; only the Vessel preference is saved locally.

Duration presets retain the full 0.5–12 hour custom selection. Results are a
snapshot of the submitted preferences: editing keeps them visible with an
update notice, and disables their planner actions until refreshed. Failed
refreshes retain the previous snapshot. The existing 30-minute expiry still
removes expired results, including on focus and return from the planner.
Condition badges, cautions, and estimate provenance remain visible. Inspiration
photos come from the river catalogue and make no current-condition claim.
The Vessel icon parity test compares web and iOS SVG geometry and strokes.

`npm run test:float-finder` runs fixture-backed browser checks of the real page
at 1440, 1024, 390, and 320px, plus dark mode. It covers keyboard combobox
navigation, location/river selection, pending and failed searches, late
responses, partial/empty results, expiry, and
planner parameters. No production credentials are needed. Set
`PLAYWRIGHT_CHROMIUM_PATH` when using a locally installed browser. Screenshots
go to `/tmp/eddy-float-finder` (override with `FINDER_SMOKE_OUTPUT`).

## River and gauge history

Desktop reports (1024px and wider) show the full chart tools inline: all supported
history ranges, Custom dates, comparison, zoom, CSV export, and a collapsed data
table. Mobile web keeps Expand, preserving the selected range and units on open
and close. A selected long or custom range stays highlighted in the compact
control. Resizing to desktop closes the dialog until the next Expand tap.
Both layouts share `GaugeHistoryChart`; iOS is unchanged. See
[ADR 0010](../docs/decisions/0010-hydrograph-gridlines-and-export-belong-to-an-expanded-mode.md).

Run `npx tsx scripts/gauge-smoke.ts` for fixture-backed desktop/mobile checks.
Screenshots and CSV downloads go to `.smoke-gauge` (override with `SMOKE_OUT`).

## Dam pages

The lakes and dams index uses compact cards with generation estimates, release,
water temperature, and below-dam elevation where readings are available. Wider
screens use two columns. Fishery and equipment descriptions stay on the detail
page. The summary payload includes water temperature with its original timestamp;
missing measurements never become zeroes or invented readings. The schedule
change and downstream travel-time note appears once above the list.

The root HTML declares the site's smooth-scroll behavior to Next so route
changes can reset immediately instead of retaining the bottom of the old page.

Dam pages keep measured generation and the posted schedule in one card, with
separate labelled sections. Desktop and landscape phones place the reading
beside the wider hourly chart; portrait phones stack them. The first available
schedule day is expanded, and later days can be opened individually. History
shows completed observations by default; an explicit toggle includes upcoming
scheduled hours. Missing observations remain gaps and retain the full day axis.

The detail dashboard uses Eddy's static framed cards, with a deep-teal observed
panel, turbine flow as the primary reading, and the next scheduled change above
the existing hourly chart. History takes the wider lower column; supporting
dam and lake measurements sit alongside it on desktop. Framed cards keep the
brand's border and offset shadow without moving charts on hover. This layout
does not infer downstream arrival times or add an AI conditions assessment.

Info buttons hold reference/methodology explanations. Reading age, schedule
check age, stale provenance, and release differences stay visible. The HTML
snapshot renders on the server, with one shared display clock for readings,
the hourly schedule and the history strip on the client.
Visible pages refresh that same cached server snapshot every five minutes and
on focus/return after at least one minute, preserving chart and disclosure state.
Hidden tabs do not poll. Original measurement timestamps are never replaced by
page refresh times. The dam API and iOS app contracts are unchanged.

Bull Shoals, Table Rock, and Beaver have a compact widget invitation in the
generation card's footer: “Bull Shoals on your Home Screen.” and “Get Eddy for
iPhone”. It replaces their bottom resource button and hides on Android after
hydration. `src/lib/dam-app-promotion.ts` owns only the three IDs and campaigns;
the card uses the snapshot's name and `/app` resolves names from the registry
on the server. The app page shows a real widget screenshot, labeled as an
example. Its QR retains the dam and campaign and stays visible in narrow
desktop windows; iOS uses the download action. QR generation stays on the
server. `AppLink` and the delegated listener retain click attribution, while
`app_promotion_view` counts the invitation once when half of it enters the
viewport. See `docs/VISIBILITY_MEASUREMENT.md` for reporting and device checks.

`npm run test:dam-page` checks fixture-rendered dam pages in Chromium at desktop,
portrait, and landscape sizes, including list cards, list-to-detail navigation,
disclosure/dialog controls, freshness, missing-data states, and the three dam
links through `/app` and the outgoing download event. All browser requests are
local or intercepted. Install the browser with `npx playwright install chromium`
(or set `PLAYWRIGHT_CHROMIUM_PATH`). It starts a local server on port 3137 and
removes its temporary fixture route on exit or SIGINT/SIGTERM. The route is
ignored by Git and returns not-found unless the smoke script's development-only
flag is set; an uncatchable kill cannot leave a publicly usable fixture page.
Screenshots go to
`/tmp/eddy-dam-page` (override with `DAM_SMOKE_OUTPUT`); no live dam data is needed.
Use `DAM_SMOKE_APP_ONLY=1 npm run test:dam-page` to run just the dam-to-app flow.

## Supported Rivers

The launch set was eight Missouri rivers (Meramec, Current, Eleven Point,
Jacks Fork, Niangua, Big Piney, Huzzah, Courtois); coverage has since grown
well beyond it, including Arkansas rivers. The `rivers` table is the source
of truth, and [`scripts/ingestion/README.md`](scripts/ingestion/README.md)
documents how rivers are added.

## Tech Stack

- **Frontend**: Next.js (App Router), TypeScript, Tailwind CSS, MapLibre GL JS
- **Backend**: Supabase (PostgreSQL + PostGIS)
- **APIs**: USGS Water Services, Mapbox Directions

Exact versions live in [`package.json`](package.json) — this list names the
technologies only, so it cannot drift from the manifest.

## Getting Started

### Prerequisites

- Node.js 20 (the version CI pins — see `.github/workflows/app-ci.yml`)
- Supabase CLI (for local development)
- A Supabase project

### Environment Setup

Create a `.env.local` file with the following variables:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Mapbox (for driving directions)
MAPBOX_ACCESS_TOKEN=your_mapbox_token

# Map Tiles
NEXT_PUBLIC_MAP_STYLE_URL=https://api.maptiler.com/maps/streets/style.json?key=YOUR_KEY

# Cron Security
CRON_SECRET=your_random_secret

# Push notifications (iOS app)
# Optional. Enables Expo's enhanced security so a leaked project id alone
# cannot be used to send on our behalf. Create at expo.dev > Access Tokens.
EXPO_ACCESS_TOKEN=your_expo_access_token
# Emergency stop for ALL push sending, checked by /api/cron/deliver-push and
# /api/cron/push-receipts. Only the exact string "false" disables. Needs a
# redeploy — for a no-deploy stop, set app_config.push_enabled = false, which
# the same check reads.
EXPO_PUSH_ENABLED=true

# Rate limiting (optional but recommended in production)
# When set, API rate limits are enforced globally in Upstash Redis instead of
# per-serverless-instance memory. Create a free Redis database at upstash.com.
UPSTASH_REDIS_REST_URL=https://YOUR_DB.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_upstash_rest_token

# App URL
NEXT_PUBLIC_BASE_URL=http://localhost:3000

# Inbound email (Resend) — receive (and reply to) mail sent to *@eddy.guide.
# The first two are required for POST /api/webhooks/resend. See docs/INBOUND_EMAIL.md.
RESEND_API_KEY=re_your_api_key                 # fetches the received body + sends replies
RESEND_WEBHOOK_SECRET=whsec_your_signing_secret # verifies the Svix signature
# RESEND_REPLY_FROM=hello@eddy.guide            # optional: From for admin replies when the
                                                #   message wasn't sent to an @eddy.guide address

# RevenueCat — iOS subscription entitlements. Required for POST /api/webhooks/revenuecat.
# In the RevenueCat dashboard (Project → Integrations → Webhooks) set the
# Authorization header to exactly "Bearer <REVENUECAT_WEBHOOK_SECRET>".
REVENUECAT_WEBHOOK_SECRET=a_long_random_secret

# RevenueCat SECRET API key (Project Settings → API Keys → "Secret API key").
# Lets the server ASK RevenueCat what a subscriber owns, rather than only being
# told by webhooks. Without it, restoring a purchase onto an account that did
# not buy it — anyone who deleted their account and signed in again — resolves
# to nothing, because a TRANSFER event carries no entitlement state and the
# original row cascaded away with the deleted user. Server-side only; never the
# app's public appl_ key. See docs/REVENUECAT_SETUP.md §8b.
# REVENUECAT_SECRET_API_KEY=sk_...

# Honor StoreKit sandbox / TestFlight purchases as real entitlements.
# Set ONLY on preview/dev deploys — with this unset in production, a sandbox
# purchase can never unlock Eddy Premium. See src/lib/entitlement.ts.
# ALLOW_SANDBOX_ENTITLEMENTS=true

# x402 — AI-agent payments (x402 V2). Optional; dormant until a wallet is set.
# Browsers always pass through free; only AI agents are asked to pay (USDC).
# X402_WALLET_ADDRESS=0xYourBaseWallet        # EVM payout on Base — activates x402
# X402_SOLANA_ADDRESS=YourSolanaAddress       # optional: also accept on Solana
# CDP_API_KEY_ID=...                          # Coinbase CDP facilitator (+ Bazaar
# CDP_API_KEY_SECRET=...                      #   auto-discovery). Else X402_FACILITATOR_URL.
```

See [`docs/x402.md`](docs/x402.md) for the full x402 setup, including the
optional feature flags (`X402_SIWX_ENABLED`, `X402_BAZAAR_ENABLED`,
`X402_DYNAMIC_PAYTO`) and testnet mode.

### Database Setup

1. **Run migrations** in your Supabase project:

```bash
# Using Supabase CLI
supabase db push

# Or run migrations manually in SQL Editor
```

2. **Seed the database** with river data:

```bash
# Run each seed file in order via Supabase SQL Editor:
# 1. supabase/seed/rivers.sql
# 2. supabase/seed/gauge_stations.sql
# 3. supabase/seed/access_points.sql

# Or use Supabase CLI:
supabase db reset  # This runs migrations + seed.sql
```

3. **Verify data import**:

```sql
SELECT name, length_miles FROM rivers ORDER BY name;
SELECT COUNT(*) FROM access_points WHERE approved = true;
SELECT COUNT(*) FROM gauge_stations WHERE active = true;
```

### Install Dependencies

```bash
npm ci
```

### Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Admin visual guides

Sign in at `/admin` and choose **Visual guides** to explore the nine interactive
explainers. The documents require a valid admin session even when opened by
direct URL. See [the guide catalog](../docs/visuals/README.md) for source files,
editing instructions, and access-control details.

## Data Pipeline Scripts

Located in `/scripts`:

| Script | Purpose |
|--------|---------|
| `import-nhd-rivers.ts` | Downloads river geometry from NHD |
| `fetch-gauge-stations.ts` | Imports USGS gauge stations |
| `snap-access-points.ts` | Snaps access points to river lines |

Run scripts with:

```bash
npm run db:import-rivers
npm run db:import-gauges
npm run db:snap-access-points
```

## Project Structure

```
eddy/
├── src/
│   ├── app/              # Next.js app router pages
│   ├── components/       # React components
│   ├── lib/              # Utilities and clients
│   ├── hooks/            # React hooks
│   ├── types/            # TypeScript types
│   └── constants/        # App constants
├── supabase/
│   ├── migrations/       # Database migrations
│   └── seed/             # Seed data SQL files
├── scripts/              # Data import scripts
└── public/               # Static assets
```

## Validation

```bash
npm run typecheck   # tsconfig.json (shippable code) + tsconfig.test.json
npm run lint
npm test
```

Or `make check-web` from the repository root. The test suite here also covers
pure logic from `../eddy-ios` and `../packages` — neither has a runner of its
own — so changes there can fail these tests by design.

## License

Private project - not for distribution.

Chart sharing uses the responsive `GaugeHistoryChart` on dedicated gauge and river reports. The fixed-view link contract, public-image payment policy, and app-link activation gates are recorded in [ADR 0015](../docs/decisions/0015-gauge-and-chart-sharing.md).
