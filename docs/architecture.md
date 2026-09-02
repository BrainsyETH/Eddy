# Architecture — the system map

A high-level picture of how Eddy fits together: what the surfaces are, what
serves them, and where the data comes from. `CLAUDE.md` is the routing guide
("I want to change X, where do I go"); this is the shape of the thing being
routed through.

Counts below were read from the tree at commit `5b56e80` (2026-08-22). They are
orientation, not contract — re-derive before quoting them anywhere load-bearing.

## The stack

One Next.js app is the whole backend. It serves the website, feeds a headless
API to the iOS app, runs every scheduled job, and is the only thing holding
credentials Supabase will accept.

```
                                 ENTRY POINTS
 ┌─────────────┐ ┌─────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────────┐
 │ Next.js web │ │  Expo iOS   │ │   Embeds   │ │ MCP + chat │ │   Machine    │
 │  48 pages   │ │ 19 screens  │ │  badge     │ │  /api/mcp  │ │  triggers    │
 │ eddy.guide  │ │ Expo SDK 57 │ │  planner   │ │  /api/chat │ │  27 crons    │
 │             │ │             │ │  card      │ │            │ │  + webhooks  │
 └──────┬──────┘ └──────┬──────┘ └─────┬──────┘ └─────┬──────┘ └──────┬───────┘
        └───────────────┴──────────────┴──────────────┴───────────────┘
                                       │ HTTP · JSON · SSE
                                       ▼
              ┌──────────────────────────────────────────────────┐
              │ missouri-float-planner/src/app/api               │
              │ 166 route handlers                               │
              │ rivers · gauges · dams · alerts · plan · reports  │
              │ admin · cron · webhooks · embed · export          │
              └────────────────────────┬─────────────────────────┘
                                       │ auth · cache headers · entitlement gate
                                       ▼
  ┌──────────────────┐      ┌──────────────────────────────────────────────────┐
  │ shared/ +        │      │ missouri-float-planner/src/lib                   │
  │ packages/        │─────▶│ 40 domain modules                                │
  │                  │      │ conditions · alerts · trust · social · geo       │
  │ 18 condition     │      │ push · ingestion · offline · embed · revenuecat  │
  │ modules          │      │ chat · email · gauges · camping · reports        │
  │ @eddy/types      │      └────────────────────────┬─────────────────────────┘
  │ @eddy/geo        │                               │ service-role client
  │ @eddy/hazards    │                               │ (RLS bypass)
  │ @eddy/sync       │                               ▼
  └──────────────────┘      ┌──────────────────────────────────────────────────┐
                            │ Supabase — Postgres + PostGIS                    │
                            │ 305 migrations · RLS · geometry columns          │
                            │ rivers · access_points · gauge_readings · alerts │
                            └──────────────────────────────────────────────────┘

  EXTERNAL SERVICES
    pulled from   USGS · NWS · USACE · NPS · Recreation.gov · USFS
                  OpenWeather · Mapbox · Google Places
    pushed to     Expo Push · Meta (FB/IG) · TikTok · Resend · Anthropic
                  Vercel Blob · RevenueCat · Sentry
```

Arrows follow the call, not the data. The machine-trigger column is the only
entry point with no human on the other end: Vercel's scheduler and two webhooks
(RevenueCat, Resend) hit ordinary routes under `/api/cron` and `/api/webhooks`,
which is why the cron handlers are counted inside the 166.

## One number becomes one condition code, once

This is the load-bearing path in the repo, and the reason `shared/` exists.

```
  USGS · NWS · USACE  ──polls──▶  /api/cron/update-gauges  ──writes──▶  gauge_readings
   stage ft, cfs                  hourly + */15 high-freq              one row per poll
                                                                              │
                                        raw number + gauge thresholds ────────┘
                                                     │
                                                     ▼
                                    ┌────────────────────────────────────┐
                                    │ shared/condition-ladder.ts         │
                                    │ too low · low · good · high ·      │
                                    │ dangerous                          │
                                    └────────────────┬───────────────────┘
                                                     │ one condition code
              ┌──────────────────────────────────────┼──────────────────────────────┐
              ▼                                      ▼                              ▼
   ┌────────────────────┐              ┌────────────────────────┐   ┌──────────────────────────┐
   │ Next.js web + API  │              │ Expo iOS               │   │ Alerts, push & social    │
   │ imports shared/    │              │ @eddy/conditions       │   │ same ladder,             │
   │ directly           │              │ (file: dep)            │   │ strictUnit: true         │
   │ river pages ·      │              │ map pins in condition  │   │ evaluate-gauge-alerts    │
   │ /api/gauges ·      │              │ colour · gauge screens │   │   → deliver-push         │
   │ embeds · Remotion  │              │ offline bundle         │   │ condition alerts → Meta  │
   └────────────────────┘              └────────────────────────┘   └──────────────────────────┘
```

The ladder is the only place a number becomes a code. It sits in `shared/` —
inside Vercel's root so the web build can reach it, and pulled into the Expo
bundle as a `file:` dependency — because this repo has already been bitten by
four parallel condition ladders and two competing flood-stage overrides. See the
header comment in `missouri-float-planner/shared/condition-ladder.ts` and
`docs/decisions/0003-conditions-package-lives-in-web-tree.md`.

The alert path passes `strictUnit: true`, so a gauge whose primary unit has no
reading returns `unknown` rather than silently grading cfs against foot
thresholds — that mismatch is how a dead stage sensor once manufactured a
`dangerous` social post.

## The clock

Nothing is fetched live from a government API on a page request. Vercel Cron
fills the database on a schedule (27 entries over 21 handlers, in
`missouri-float-planner/vercel.json`); every read serves what the clock already
collected.

| Group | Jobs | Cadence | What it does |
| --- | --- | --- | --- |
| Water & dams | 6 | 15 min → monthly | Gauge readings hourly plus a `*/15` high-frequency pass, latest-value sync, dam generation history, **assembled dam snapshots**, monthly percentile snapshots |
| Land & availability | 5 | daily / weekly | Campsite availability from Recreation.gov and Missouri State Parks; NPS and USFS public-lands sync |
| Alerts & push | 3 | 5–15 min | Evaluate gauge thresholds against subscriber rules, drain the delivery queue to Expo push, reconcile receipts 4×/hour |
| Eddy updates | 3 | daily | Anthropic writes the river and gauge prose, gated by a knowledge base and a prose gate before it can publish |
| Social & media | 9 | 30 min → weekly | Post scheduler, preflight, clip brand-check by vision, clip posting, weekly blog, insight fetch, weekly review |
| Integrity | 1 | hourly | The trust tick — registered data checks, severity scoring, decay and remediation against a ledger |

### Two read paths are assembled ahead of the reader

The rule above has one shape of exception, and it is worth naming because both
instances degrade silently rather than breaking:

| Route | Assembled by | If it is not there |
| --- | --- | --- |
| `/api/dams`, `/api/dams/[damId]` | `/api/cron/sync-dam-snapshots` into `dam_snapshots`, hourly at `:35` | Falls back to reading CWMS and SWPA live — correct, and the 8s cold path it replaced |
| `/api/rivers` | `get_river_conditions()`, one call instead of one per river | Falls back to `get_river_condition` per river — correct, and the N+1 it replaced |

**Both must be live before the deploy that depends on them is judged.** Neither
failure is visible from the outside: the routes answer correctly either way and
only the latency moves, so a missing migration or a cron that never got
scheduled looks exactly like a successful deploy. Concretely, after shipping:

1. apply the migrations (`make check-db` reports drift). Both were applied on
   2026-09-02 as `20260902131041` and `20260902131340`; the ledger in
   `supabase/production-migrations.txt` is the record,
2. confirm `/api/cron/sync-dam-snapshots` appears in the Vercel project's cron
   list and has run once — its response carries `stored`, which should equal the
   registry's dam count, and `keptOnOutage`, which should be 0.

`keptOnOutage` equal to the dam count is an upstream outage, not a bad deploy:
nothing is written from a failed read, on purpose. See
`src/lib/data/dam-snapshot-store.ts`.

## What lives where

| Path | What it is | Consumed by |
| --- | --- | --- |
| `missouri-float-planner/` | The web app **and** the entire API. Vercel's Root Directory. Also hosts the Remotion video projects. | Browsers, the iOS app, embeds, MCP clients |
| `missouri-float-planner/shared/` | The canonical condition system: threshold ladder, condition codes, chart model, dam forecast copy. Pure TypeScript. | Web build, Expo bundle, Remotion |
| `missouri-float-planner/src/lib/` | 40 domain modules. | The 166 API routes and server components |
| `missouri-float-planner/scripts/` | 68 ingestion, validation and generation scripts. Guard levels per script in `docs/data-pipeline.md`. | Operators, by hand and in CI |
| `missouri-float-planner/supabase/` | 305 migrations plus seeds and SQL diagnostics. | The linked Supabase project |
| `eddy-ios/` | The Expo app: 19 screens, 68 components, Mapbox, RevenueCat, Expo push. Talks to the web app as a headless API. | TestFlight and the App Store |
| `packages/` | Four pure packages, no build step: `@eddy/types`, `@eddy/geo`, `@eddy/hazards`, `@eddy/sync`. | Both apps, via `file:` deps |
| `scripts/clipengine/` + `clipengine-local/` | ClipEngine: scan paddling channels, clip the most-replayed peak, brand with Remotion, gate with vision, auto-post. | 11 GitHub Actions workflows |

## Constraints that shape the tree

Each looks like an odd choice until you hit the failure it prevents. All four
are load-bearing; the full statements live in `CLAUDE.md` and `docs/decisions/`.

- **No root `package.json`, lockfile, or workspace.** `npx expo` from the root
  would fetch the latest Expo instead of the pinned SDK; workspaces break EAS
  archiving and Vercel's scoped install.
- **Shippable web code stays inside `missouri-float-planner/`.** Vercel builds
  only that directory — which is exactly why `shared/` lives there rather than
  in `packages/`. Tests may reach outside; they run under `tsconfig.test.json`,
  not the build.
- **`.easignore` is a security-critical allowlist.** While it exists, EAS ignores
  `.gitignore` entirely and defines the archive from the git root, so anything
  not denied gets uploaded — including `.env` files. Run
  `python3 eddy-ios/scripts/check-easignore.py` after every edit.
- **Never install `eddy-ios` with `--legacy-peer-deps`.** It silently drops
  shipped native packages and surfaces later as a native build failure that names
  anything but the install. Plain `npm ci` works; the `overrides` block is the
  correct fix.

## One test suite

Neither the Expo app nor `packages/` has its own runner. The 168 test files under
the web app deliberately cover iOS pure logic and the shared packages too, so a
mobile-only change can fail `make check-web`. That is by design, not flake — see
the comment block at the top of `.github/workflows/app-ci.yml`. Above it,
`make bundle-mobile` produces a credential-free production bundle, the step that
catches Metro and EAS breakage invisible in dev.
