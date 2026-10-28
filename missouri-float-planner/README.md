# Eddy

Your Missouri float trip assistant. Plan trips on Ozarks rivers with real-time water conditions, access points, and float time estimates — powered by live USGS gauge data.

## Features

- **Interactive Map**: Inspect access points and choose put-in and take-out points
- **Real-time Conditions**: Live USGS gauge data with floatability ratings
- **Float Time Estimates**: Calculated based on vessel type and water levels
- **Shuttle Planning**: Drive-back time and distance
- **Shareable Plans**: Generate URLs to share your float plan

River pages place “Find a float on this river” near the bottom, after the river
guide and before the feedback link, when float search is enabled for the web.

## Web navigation

The main links are **Conditions**, **Map**, **Floats**, and **Guides**, with a
separate app link. Conditions opens a shared, searchable directory at `/rivers`;
`/dams` opens the same interface with Lakes & Dams selected and retains its own
metadata and canonical URL. `/gauges` remains part of Conditions. Map opens Build a Route at
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

The homepage shows **River and Dam Conditions**, the two route actions, river
guides, and the iPhone app. Its two report columns reuse the Conditions directory's
`RiverCard` and `DamListCard`, including charts, Eddy artwork, and dam timelines.
Each column shows one report, rotating horizontally every eight seconds while
visible; the columns stack on mobile and support swipe and previous/next arrows.
Hover temporarily holds rotation. Keyboard focus or pointer interaction stops
automatic rotation for the visit, and reduced motion disables it. There is no
rotation button or extra explanatory copy. Dam summaries share the directory's
stored five-minute cache and refresh. The hero links to Build a Route. The
Live River Map card opens `/river-map` without a separate header link.
Reports appear directly under the heading without a second alert summary. Eddy's
existing colors, fonts, artwork, and condition badges are reused. Website widgets
remain in the footer.

`npm run test:navigation` runs fixture-backed browser checks at desktop, 390px,
and 320px widths, including keyboard/touch navigation and river selection across
the planner, map history, refresh, the finder, shared-plan tab isolation, and
report charts, dam timelines, and carousel interactions. Set `NAV_SMOKE_HOME_ONLY=1`
to run only the homepage and navigation checks. It also times filter toggles with 60 rivers at 6× CPU slowdown. It uses
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

## Conditions directory

`/rivers` starts with All: full **Featured** reports for Table Rock, Bull Shoals,
Current and Buffalo, followed by complete Rivers and Lakes & Dams sections.
Featured is a fixed editorial selection, not measured popularity, and respects
the state filter. All cards are visible without a Show all step: two columns
on desktop, one on mobile. Search results and explicit sorts use those same
components, including river charts, gauge details, Eddy summaries and condition
artwork. Dam cards focus on release, water temperature and the generation
schedule; the generator status/rack and below-dam elevation stay on full reports.
Dam cards share the full report’s framed border and warm reading surface, with a
compact header, inline next change, and shorter chart for today’s schedule.
Teal generation bars and an orange Now marker match iOS. The footer combines the
report link, Central time, and schedule age; longer provenance lives in the info
dialog, with “May have changed” still visible when the schedule is outdated.
Unavailable release readings are marked explicitly; turbine flow is not
substituted for total release.

Hydroelectric dam cards also show today's hourly generation timeline directly,
using the same `DamTimeline` as the full report. Today means Central time at the
dam; another day's schedule never substitutes for a missing one. Hover, tap or
arrow keys reveal hourly details in place. Only the dam heading and Full report
link navigate, so inspecting a schedule keeps the current search and filters.
Additional schedule days remain on the full report.

Both entry points use the “Conditions” heading, Eddy's canoe artwork and the
cross-river summary. A compact A–Z link directory keeps every destination
reachable before JavaScript, including when live gauge metadata is unavailable.
`/dams` keeps its own search title, canonical URL and initial Lakes & Dams filter.
The USGS observation-delay note remains below the reports alongside source and
dam-release guidance.

Search matches both lake and dam names against the same destination. Ranking is
exact name, name prefix, approved alias, words within a name, then related
destinations; direct names always beat related matches. Taneycomo can surface
Table Rock with the explicit label “Releases into Lake Taneycomo”. Related river
gauges are labeled “Gauge: …” to explain their matches. State names
and compound searches such as “bull ar” also match. Search uses Best matches;
clearing it restores the browse sort. Search runs locally and does not request
new API data or server navigation on each keystroke. The pure matching, ranking,
and URL rules live in `src/lib/conditions/directory.ts` for reuse by future map
search.

`kind=all|rivers|dams` is separate from the existing river `type` parameter.
Legacy river-only filters (or river-only sorts) without `kind` select Rivers;
an explicit `kind` wins and incompatible filters are ignored. River-only
controls appear only under Rivers. State options reflect the current category,
not the search results; switching category clears an unavailable state with a
notice. All supports Featured, A–Z and Nearest. A–Z and Nearest show one combined
list without pinned cards. Location is requested only for Nearest, is never
written to the URL, and denial falls back to editorial order with a retry.
Browser Back, Forward and reload restore the URL selection.

River snapshots retain their 60-second server cache and live gauges their
10-minute polling; dam summaries keep a separate five-minute cache and client
refresh. Initial HTML uses stored dam summaries; partial snapshots keep that
five-minute refresh schedule and mark missing readings on the affected cards.
Only a wholly unavailable stored catalogue triggers an immediate API retry.
The directory never waits for live upstream dam feeds.
Missing dam observations keep the destination searchable with no
invented measurements. The directory does not add reservoir levels or change
`/api/dams` or iOS payloads.

`npm run test:conditions` runs the actual directory layout with local fixtures
in Chromium at desktop, tablet, 390px and 320px widths. It covers server-rendered
cards and canonical URLs, populated river charts, Eddy artwork and summaries,
dam release/temperature/schedule information, matching and related
labels, state/category filters,
legacy links, browser history, sorting, request-free typing and overflow.
No production credentials are needed. Set `PLAYWRIGHT_CHROMIUM_PATH` for an
installed browser. Screenshots go to `/tmp/eddy-conditions` (override with
`CONDITIONS_SMOKE_OUTPUT`). Temporary fixture routes are ignored by Git,
development-guarded, and removed on exit. The fixture server keeps its Webpack
memory settings in `scripts/conditions-smoke-server.mjs`; the application config
contains no browser-test overrides. Set `CONDITIONS_SMOKE_IMAGES` to a directory
with the original `canoe.png`, `green.png`, `yellow.png`, `red.png` and `flood.png`
assets for visual review; otherwise image requests use a local Eddy fixture.

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

Searching shows the locally bundled Eddy checking a gauge with “Eddy’s reading
the waters”; Reduce Motion disables the progress-dot animation. Refreshes keep
the previous cards visible but their planner actions blocked. Empty results
explain the actual condition/access exclusion and offer an explicit nearby
river or wider-radius search. These recovery searches preserve the submitted
time, vessel, and access preference; private accesses require a separate action.

`npm run test:float-finder` runs fixture-backed browser checks of the real page
at 1440, 1024, 390, and 320px, plus dark mode. It covers keyboard combobox
navigation, location/river selection, pending and failed searches, late
responses, partial/empty results, expiry, and
planner parameters. No production credentials are needed. Set
`PLAYWRIGHT_CHROMIUM_PATH` when using a locally installed browser. Screenshots
go to `/tmp/eddy-float-finder` (override with `FINDER_SMOKE_OUTPUT`).
## Route map

Build a Route keeps one MapLibre map mounted while choosing rivers, loading
river details, and returning to **All rivers**. All rivers zooms back to the
service area and preserves the current route and its endpoint selections;
choosing a different river starts that river's plan, with Undo available.
Mobile pins and the access strip on both layouts select endpoints directly;
tapping a selected endpoint clears it. Pairs are ordered downstream regardless
of selection order.
Desktop pins and search results open access previews. Inspecting another river's
access does not discard the current route. Endpoint edits and river changes can
be undone; Undo appears only while history exists. Mobile search includes the
already-loaded accesses on the selected river without downloading the regional
access catalogue, and its results remain visible until the dialog closes.

A completed route fits the usable map area beside the panel or above the mobile
sheet. Show route restores that view after exploring; resizing overlays does
not override a manual pan. Valid camera deep links win on initial load.
Fullscreen includes planner controls and details. Zoom buttons remain available
on touch screens, and access, gauge, POI, and hazard markers support keyboard
activation. The selected route uses the same accent orange as the iOS map,
separate from river condition colors.

Desktop content filters start enabled each visit and retain changes while
switching rivers. USGS gauge layer choices are saved across visits on both layouts. The regional catalogue supplies access points and POIs;
gauges and verified photo pins remain visible across rivers. Photo queries
reuse the existing per-river cache/endpoints. Mobile keeps saved filter choices.
The desktop plan card fills the available height, and the access strip sits to
its right. Eddy Says River Report keeps its existing position and behavior.

Map tools share MapLibre's native control stack. Compact attribution starts
closed, including when source credits arrive asynchronously, and remains
available through its info button.

`npm run test:planner-map` uses real MapLibre with fixture APIs to check map
continuity, retained endpoints, default filters, camera framing, control/panel
spacing, attribution, keyboard search, and desktop/mobile layouts.

## Nationwide gauges on both web maps

The planner (`/plan`) and Live River Map (`/river-map`) share **USGS gauges**
controls: **Eddy-rated** and **Other USGS**, both enabled by default. Explicit
layer choices persist across both maps and open tabs. On first use, the previous planner
`showGauges` preference seeds both switches, preserving a saved off choice.
The national layer uses the complete,
CDN-cached `/api/gauges/points` index at every zoom, refreshing every 15 minutes
while enabled; viewport result caps cannot drop smaller stations. It is fetched
once the browser is idle after the map's own requests, and the last index is
kept in `localStorage` and painted from there on the next visit. At zoom 8
and closer, debounced `/api/gauges/map` requests enrich pin and choice-list names
by site ID. Their 1,000-row cap or a failed name request never replaces the index.
Selecting a station loads detail from `/api/gauges/[siteId]`, preserving any
planned route; the planner keeps it in the link as `?gauge=`. Site numbers remain fallbacks until a name is available.
Freshness updates run at observation boundaries, rather than rebuilding the
national layer every minute.

Other gauges show measurements and the shared historical flow-comparison colors,
never a floatability verdict; the filter controls show the color key, and count
bubbles are parchment with an ink edge so a group never reads as a comparison
color. Stage-only stations are included. Historical
observations are opt-in; delayed, suspect and missing-comparison readings do not
receive a current comparison color. Flow bands combine as alternatives; Reports
flow and Reports stage narrow together. Filters start clear on each visit.

The planner uses separate MapLibre sources and cluster trees for reference
gauges and places; access points and POIs draw above the reference layer, whose
stations are small plain dots with a 10px river-priority hit area. On
phones, Eddy-rated gauges now cover all rated rivers, matching desktop, rather
than only the selected river. The SVG Live River Map keeps
its Ozarks home view and river overlays while allowing nationwide pan/zoom with
state outlines. Its world-anchored clusters use discrete zoom steps and one
screen of overscan, keeping centroids stable and filling the view during pans.
They account for every visible national station, including on phones; coincident
stations have a choice list. Single stations paint under the curated rivers;
only small tap targets and count bubbles sit in the marker layer, beneath
Eddy's gauges, so rivers and empty map stay tappable except right on a dot.
The layer is one keyboard tab stop, with arrow keys moving between stations.
Zoom runs from about 60× in to the whole United States. A station opens in
the same peek/expand sheet as Eddy's gauges. Automatic curated selections retain the original
Ozarks zoom limits. The old `ContextSiteCard` has been removed. The capped
`/api/usgs/mo-sites` API and its loader remain deprecated compatibility code:
remove them together only after checking external traffic and announcing a
sunset; no removal date is scheduled.
National readings remain their latest observations when the curated river
history timeline is scrubbed; the layer dims and the dock says so.

`npm run test:national-gauges` runs fixture-backed Chromium checks of both real
maps at desktop, 390px and 320px with over 14,000 stations, including dense
Ozarks stations beside access points, viewport name enrichment/failure/caps,
legacy preferences, and source stability across an unchanged minute. River Map
Smoke runs this suite in CI alongside `scripts/mosw-smoke.ts`, whose original
mobile dismissal coordinate remains unchanged. The full
`npm run test:planner-map` includes these checks after its route regression suite.
Use `PLAYWRIGHT_CHROMIUM_PATH` for an installed browser. Run browser checks
separately from typechecking because the runner creates and removes temporary
fixture routes. `node --import tsx scripts/build-us-gauge-outlines.ts` regenerates
the SVG state outlines from the pinned US Census/us-atlas dataset.

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
change and downstream travel-time note appears once below the list.

The root HTML declares the site's smooth-scroll behavior to Next so route
changes can reset immediately instead of retaining the bottom of the old page.

Dam pages keep measured generation and the posted schedule in one card, with
separate labelled sections. Desktop and landscape phones place the reading
beside the wider hourly chart; portrait phones stack them. The first available
schedule day is expanded, and later days can be opened individually. The generation pattern
always includes upcoming scheduled hours alongside measured history. Six-hour
time labels above and below the pattern align with guides in every row; days
with a clock change also carry their own correctly positioned time labels. Missing observations remain gaps and retain the full day axis.

The detail dashboard uses a static framed generation card with a warm sand
observed panel, turbine flow as the primary reading, and the next scheduled
change above the hourly chart. Date headings lead straight into the
chart; hourly details and the peak window share one line below it. Generation
uses teal bars, while an orange Now marker matches iOS. Peak windows are named
without a second band above the bars. Flow
estimates stay out of ramp hours, and megawatts are spelled out in hourly
details and explained in the info dialog. Dam and lake measurements sit above
the full-width generation pattern at every screen size, on quiet panel cards.
The header keeps only Share, with its icon, native touch sharing, and desktop
copy feedback. The bottom phone action reads “Release Line: [number]”.
Framed cards keep the brand's border and offset shadow without moving charts on hover. This layout
does not infer downstream arrival times or add an AI conditions assessment.

Info buttons hold reference/methodology explanations. Reading age, schedule
check age, stale indicators, and release differences stay visible; compact
directory cards put full schedule provenance in their info dialog. The HTML
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

## Scheduled job monitoring

Diagnostics distinguish the latest cron tick from the latest work outcome.
Skipped ticks and running retries do not clear a failed or partial outcome.
Attempts still marked started after ten minutes require attention even after
a later skip: they did not report completion, which can mean a timeout or a
failed final monitoring write. Historical run rows are not rewritten.
Successful work clears attention. Latest ticks still determine schedule deadlines.
Both views use the existing 30-day job-history retention window.

The additive `20261027111520_admin_job_last_result` migration provides this
outcome history while preserving the existing RPC fields. Apply it before
relying on failure persistence. Until then, a skipped or running latest tick
reports the completed outcome as unavailable rather than assuming success.

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
