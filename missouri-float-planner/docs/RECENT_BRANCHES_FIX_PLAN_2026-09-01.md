# Fix plan — the last ten merged branches, 2026-09-01

Companion to the review delivered on 2026-09-01 of PRs #1253 through #1266
(branches `rivers-dams-review`, `trust-center-issues`,
`purchase-restoration-diagnosis`, `tailwater-thresholds-review`,
`echo-bluff-jacks-fork`, `tailwater-conditions-feedback`,
`ios-app-ux-ui-review`, `gauge-chart-layers-gradient`,
`page-latency-optimization`, `gauge-recalibration-notes`). This file is only
the work: **what to change, in what order, and what proves it.** Evidence is
summarised per item; where a finding was only read, not reproduced, it says so.

**State of `main` at `fdda70f0`:** web typecheck clean, lint 0 errors,
2491/2491 tests pass, iOS typecheck and lint clean. Nothing below is a CI
failure. Everything below is behaviour or deployment.

| In scope | Out of scope — separate session |
|---|---|
| Three merged migrations not applied to production | Importing the 36 tailwater access-point pins |
| Six migration filenames drifted from recorded versions | The two percentile-anchored ladders the ingestion README flags for an owner call |
| Guards so neither recurs | Any new river, dam, or feature |
| Five confirmed iOS defects from the same branches | The iOS keychain re-add migration (decide in 2.6, do later) |
| Four server hardening items | Vercel/Upstash provisioning beyond verifying it exists |
| Chart and tailwater UI papercuts | |
| Comment and doc drift the review found | |
| Data follow-ups that need a production query | |

Phases are ordered by what unblocks what. Phase 0 is one sitting. Phases 2,
3 and 4 are each one PR and are independent of each other once Phase 0 lands.

**Status, 2026-09-02** (all on `claude/review-recent-branches-6v7r29`):

| Phase | State |
|---|---|
| 0 | **Done.** The three migrations were applied to production on 2026-09-02 (recorded as `20260902125655`, `20260902131041`, `20260902131340`), the files renamed to match, the ledger's pending section is empty, and the rivers function's own invariants passed against the live rows. |
| 1 | Done: ledger + test, drift workflow (needs two Actions secrets), CLAUDE.md rule, the comment sweep except the two migration comments (6.1 corrects them with the data). 1.4's executing tests are **not** done. |
| 2 | Done, one commit. 2.6 took the comment fix; the keychain re-add migration is filed, not done. |
| 3 | **Done.** 3.2 needed no schema change after all: the row already carries `last_event_at`, so the function now refuses a forward move from a snapshot older than the row's newest event. Applied as `20260902132840`. |
| 4 | Done, one commit. |
| 5 | Not started — needs the device pass. |
| 6 | 6.1 and 6.2 done: the Current's miles recomputed from the line (`20260902132921`, plus `20260902134206` for two outfitters the first predicate missed). The six guide-scale rivers are untouched and filed for their own review. 6.3 to 6.5 untouched. |

---

## Phase 0 — production alignment (do this first, one sitting)

Three merged migrations are absent from production's migration history
(checked read-only against project `ilefwfpvphadsbptiaur`), and three more
were applied under a different version than their filename. Until this phase
lands, PR #1256's restore fix and PR #1265's latency work are not live, and
`make check-db` fails on six rows.

### 0.1 Apply the three missing migrations

| File | Ships | While missing |
|---|---|---|
| `20260826112559_reconcile_entitlement_can_only_move_forward.sql` | `reconcile_entitlement()` for `/api/me/entitlement/refresh` and the webhook TRANSFER path | Every refresh returns `status:'error'`, which `eddy-ios/src/api/client.ts` swallows; a TRANSFER with no source row 5xxes until RevenueCat exhausts retries |
| `20260831120000_the_rivers_list_asks_once_not_once_per_river.sql` | `get_river_conditions()` | `/api/rivers` still runs the per-river N+1 |
| `20260831130000_dam_snapshots_are_assembled_before_a_reader_asks.sql` | `dam_snapshots` table | `/api/cron/sync-dam-snapshots` upserts into a missing table hourly, logs a warning, returns `{ok:true, stored:0}` |

**Order:** entitlement first (its header says "land this first" and it is the
one with user-visible breakage), then the August 31 pair.

**The trap:** production already holds `20260901180642`, which is newer than
all three. `supabase db push` refuses to apply older-than-remote files without
`--include-all`. Apply with that flag, or apply through the same API path
`0627a9f0` used, then read the version the recording assigned.

**Before applying**, read each file's DO-block assertions against the live
rows the way `0627a9f0` and `9cff8da9` did, and record the outcome in the
file header. Production writes need explicit authorization per `CLAUDE.md`;
this plan does not grant it.

### 0.2 Rename six files to the versions production recorded

**Three of six done 2026-09-02, on this branch:** the Echo Bluff, Van Buren
and Echo Bluff coordinates files now carry their recorded versions, every
reference to the old versions is updated (the OSM migration's prose, the
seed, the September header), the README citation is fixed, and the four
headers production contradicted now say APPLIED. The remaining three wait on
0.1.

Migrations are applied through the Supabase API, which stamps its own
timestamp. The filename is the only place the version is checkable from the
repo, so a file that is not renamed after applying is drift forever.

| Local filename | Recorded version | Source of the record |
|---|---|---|
| `20260826130000_echo_bluff_is_on_sinking_creek.sql` | `20260826174017` | production list; noted in `20260901180642` header |
| `20260826190000_van_buren_has_a_river_mile.sql` | `20260826210200` | same |
| `20260826200000_echo_bluff_coordinates_from_osm.sql` | `20260826223527` | same |
| the three files in 0.1 | whatever 0.1 assigns | 0.1 |

**Do in the same commit as each rename:**

- `src/lib/revenuecat/api.test.ts:235` pins the entitlement migration's
  filename verbatim. Move the pin or CI breaks on the rename. Check the other
  three tests that reference `supabase/migrations/2026*` paths
  (`reports/gauge-derivation`, `trust/checks/validate-river-data`,
  `feedback-types`) — none pin these six today, but confirm after renaming.
- Replace each `NOT YET APPLIED` header with an `APPLIED … RECORDED as …`
  header in the form `20260901180642` uses.
- `scripts/ingestion/README.md:57` cites `20260901143000`, the pre-rename
  name of the September migration. Change it to `20260901180642`.
- Remove the "three earlier migrations were not renamed and are drifted
  today" sentence from `20260901180642`'s header once they are.

### 0.3 Verify Phase 0

1. `make check-db` reports zero drift rows.
2. `GET /api/cron/sync-dam-snapshots` with the cron bearer: `stored` equals
   the registry's dam count, `keptOnOutage` is 0 (`docs/architecture.md:136`).
3. `POST /api/me/entitlement/refresh` as a signed-in test account returns a
   `status` other than `error`.
4. `/api/rivers` cold latency drops; the route logs no fallback warning.

---

## Phase 1 — guards so Phase 0 does not recur

The pattern across these ten branches is process, not code quality:
migrations merge unapplied, or apply unrenamed, and the repo's only record is
a comment in an unrelated file. Nothing hermetic catches it, and `make
check-db` is outside `make check` on purpose (it needs credentials).

### 1.1 A hermetic ledger, and a test that holds it to the files

The first draft of this item was a test over header comments. A survey of
the headers killed it: four files still said `NOT YET APPLIED` over
migrations production had held for weeks, most files carry no marker at
all, and the markers that exist use four spellings. A comment is not a
record.

**Done 2026-09-02, on this branch:** `supabase/production-migrations.txt`
lists every version production recorded after the legacy baseline, under
`[applied]`, plus a `[pending]` section for merged-but-unapplied files.
`scripts/migration-ledger.test.ts` enforces three rules without credentials:

1. every `[applied]` version has a local file with that exact version
   (otherwise the file was applied under another version — rename it);
2. every local file older than the newest `[applied]` version is listed
   under `[applied]` or `[pending]` (otherwise it is in the `--include-all`
   trap and nothing else says so);
3. every `[pending]` line names a file that exists and is not applied (a
   stale line fails).

`make check-db` now also cross-checks the ledger against the live project in
both directions, so the ledger cannot quietly disagree with production
either. The three 0.1 files sit under `[pending]` today; applying them means
moving each line to `[applied]` under the recorded version.

### 1.2 A scheduled, non-blocking drift report

PR CI stays hermetic. Add a scheduled GitHub workflow (daily, or on push to
`main`) that runs `npm run db:check-migrations` with the linked-project
secrets and, on drift, opens or updates a single pinned issue naming the
rows. Non-blocking: it reports, it does not gate. This would have surfaced all
six rows the day they drifted.

**Done 2026-09-02, on this branch:** `.github/workflows/migration-drift.yml`,
daily at 12:17 UTC and on pushes to `main` that touch migrations or the
ledger. It needs `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` in Actions
secrets; without them it warns and exits green rather than crying drift.

### 1.3 Definition of done for a migration PR

Add one line to the Database row of `CLAUDE.md`'s task-routing table: a PR
carrying a migration is done when the file header records the applied
version and the filename matches it. Both `0627a9f0` and `9cff8da9` already
follow this; write it down so it is the rule and not the habit.

**Done 2026-09-02, on this branch**, worded for the ledger: named for the
recorded version, and that version in `production-migrations.txt`.

### 1.4 Tests that execute behaviour instead of grepping source

Three new suites assert with regexes over source text. A rename keeps them
green; a behaviour change can too. Replace or supplement each with a test
that runs the code:

| Suite | Currently greps for | Should execute |
|---|---|---|
| `src/lib/request-timing.test.ts:432-503` | `outlookInFlight.current.get(key)` | Two callers with different slugs joining one in-flight request; a rejection evicting the entry; a caller's abort not cancelling another's wait |
| `src/lib/data/dam-snapshot-store.test.ts:227-266` | `if (!isFresh(row.built_at, now)) continue;` | `readStoredSnapshots` on an empty and on a missing table → empty map; `pruneStoredSnapshots` filter string for two and for zero ids |
| `src/lib/revenuecat/api.test.ts` | the migration filename and SQL fragments | The forward-only rule under a later, an equal, an earlier, and a NULL expiry (a pure TS mirror of the WHERE clause is acceptable if the SQL cannot run in CI) |

The outlook-keying defect in 2.1 sits inside the first suite's coverage and
was not caught, which is the argument.

### 1.5 Comment truth sweep

Four comments assert behaviour the code does not have. Fix the comment or the
code; do not leave both.

| Where | Says | Reality |
|---|---|---|
| `eddy-ios/app/river/[slug].tsx:836-839` | an in-flight request "settles into ITS OWN entry" per river | key is `''` for every river's primary case (see 2.1) |
| `20260825224950_the_current_starts_at_montauk.sql:105-110`, `20260826014051_the_niangua_reaches_the_lake.sql:77-80` | re-snapping "recomputes … the mile columns" | the trigger (`00121_resnap_access_points.sql:38-59`) writes only `location_snap` and `snap_distance_m`; miles are preserved (see 6.1) |
| `shared/dam-schedule-copy.ts:514-520` | movement prose "carries no age" | its only caller `shared/tailwater-status.ts:153-172` appends one; `tailwater-status.test.ts:249` also says "no age" one test below the one asserting every line is dated |
| `eddy-ios/src/lib/secure-session-store.ts:30-39` | existing items "migrate on the next write" | expo-secure-store's update path rewrites only `kSecValueData`; accessibility class is unchanged until the item is deleted and re-added (see 2.6) |

Also stale: `shared/chart-model.test.ts:255` and
`eddy-ios/src/components/GaugeChart.tsx:1021` still say "168px" after the
200px / 4-tick change; `RiverGaugeDetail.tsx:394` says "Not pulsing" over a
row that pulses (4.1).

---

## Phase 2 — iOS fix batch (one PR)

All five are small, touch code these branches just wrote, and were confirmed
by reading. Validate with `make check-mobile` and `make bundle-mobile`; the
web suite covers the pure parts.

### 2.1 Outlook in-flight map is keyed without the river

**Done 2026-09-02.** Items 2.1 through 2.6 landed in one commit; 2.7 was left.

**File:** `eddy-ios/app/river/[slug].tsx:844`

```ts
const key = askedFor ?? '';
```

Every river's primary-gauge request shares key `''`. The `[slug]` effect
clears `outlookCache` but deliberately not `outlookInFlight`. If the screen
instance is re-pointed at another slug while a request is in flight
(`router.navigate`, `setParams`, a universal link), the new run joins the old
promise, its `.then` writes river A's payload into the freshly cleared cache
under `''`, and `current` is true for river B's run, so B renders and caches
A's outlook. Before #1265 the cleanup's abort prevented this.

**Change:** key by `` `${slug}|${askedFor ?? ''}` ``, and fix the comment.
Reachability is plausible rather than reproduced; the fix is one line and the
comment above it is wrong regardless.

### 2.2 Public-lands containment early-return leaves `loading` true

**File:** `eddy-ios/src/hooks/usePublicLands.ts:156-167`

The containment branch aborts the in-flight request and returns without
resetting state; the `!enabled` and `belowMinZoom` branches both reset.
Scenario: last fetch for box B returned zero parcels; pan to A (fetch out,
`loading: true`); pan back inside B before A answers → abort, return,
`loading` stays true, and `index.tsx:2014` reports the public-land count as
"not answered yet" until the camera leaves B's padded box.

**Change:** mirror the other two branches — set `loading: false` (keep the
parcels already held) before returning.

### 2.3 Today tab never revalidates after an offline cold start

**File:** `eddy-ios/app/(tabs)/reports.tsx:588, 629`

`riversAt.current` is set only on a successful fetch; the foreground handler
returns when it is null. `load` has three callers (mount, foreground, pull)
and no focus retry, so a user who opened Today offline gets no reload when the
app returns on a working network.

**Change:** in the foreground handler, treat `riversAt.current === null` as
"never succeeded, try now" rather than "not armed". Keep the 300 s throttle
for the non-null case.

### 2.4 Dam screen can spin forever with no retry

**File:** `eddy-ios/app/dam/[damId].tsx` (around `loadedFor.current = damId`
and the `detailSettledFor` guard)

`loadedFor` is set before the primary load settles. Blur during a
summary-seeded first load aborts it and `finally` skips `setDetailSettledFor`;
the next focus is classified as non-primary, which on failure neither settles
the pending row nor sets `failed`. The pending row spins indefinitely and the
"Try again" branch is unreachable. Plausible by reading; reproduce by tapping
the tailwater river link while the body is still loading, then returning.

**Change:** set `loadedFor` only when a primary load actually settles, or let
a non-primary load settle `detailSettledFor` when nothing has.

### 2.5 A 304 on the offline bundle is recorded as `failed`

**File:** `eddy-ios/src/api/client.ts:262` via `seedOfflineBundle`

The outcome is `response.ok ? 'ok' : 'failed'`; `Response.ok` is false for
304, which the PR itself calls the overwhelmingly common case. Not reported to
Sentry today, but the outcome is wrong for any future consumer.

**Change:** treat `response.status === 304` as `ok` in `fetchOnce`.

### 2.6 Keychain accessibility hardening — decide, do not leave the comment

**File:** `eddy-ios/src/lib/secure-session-store.ts:30-39`

The new accessibility class applies only to fresh installs. No logout or
token-loss risk. Two honest options:

- **Now:** correct the comment to say existing sessions keep the old class
  until sign-out. Zero risk.
- **Later, separate PR:** remove-then-add behind a one-time flag, with the
  crash-between-the-two case handled (write the new item under a temp key,
  delete old, rename). Needs a device test on an upgraded install.

This plan does the first and files the second.

### 2.7 Optional in the same PR

- `eddy-ios/src/lib/gaugeCache.ts:22, 88-92`: the LRU indexes only keys
  written from this build on; earlier per-gauge keys stay until a
  `CACHE_VERSION` sweep. Growth has stopped; do not bump the version (that
  wipes everything). Note it in the file and leave it.
- `useStatewideNetwork.ts:130-132`: a failed foreground revalidation shows the
  "readings did not come back" pill over colours still painted from held
  readings. Focus retry heals it. Cosmetic; fix if touching the file.

---

## Phase 3 — server hardening (one PR)

### 3.1 Confirm the refresh endpoint's limiter is global

**Done 2026-09-02, with a decision to know about.** Rather than change what
`failClosed` means for every route, a new `requireGlobalLimiter` option
answers 503 in production when Upstash is not configured, and only the
refresh route asks for it. If the Vercel project has no Upstash variables,
that route is dead until they are set — loudly, in the logs — and Restore
falls back to the profile poll and the webhook path, as before #1256. Check
the Vercel environment before the next deploy.

**File:** `src/app/api/me/entitlement/refresh/route.ts:48-55`,
`src/lib/rate-limit.ts:141-171`

`failClosed: true` still falls back to a per-lambda in-memory map when
`UPSTASH_REDIS_REST_URL`/`TOKEN` are unset; it only warns once. This is the
first route that spends a paid third-party call per request, so
"per-instance only" means "unbounded across instances".

**Do:** `make check-eas-env` does not cover Vercel; check the Vercel project
for the two Upstash variables. If absent, provision them before or with 0.1.
Then make `failClosed` mean it: in production with no global limiter, refuse
the request with 503 rather than fall through. The existing warn is the
signal that this is the intended semantics.

### 3.2 Forward-only reconcile can re-grant a refund in a race

**Done 2026-09-02, applied as `20260902132840`.** No new column: the webhook
already stamps `last_event_at` with each event's own time, refunds
included. The reconcile now passes the moment its REST read started as
`p_observed_at`, and the write is refused when the row has learned something
since. Adding a parameter meant DROP then CREATE (a new signature under
CREATE OR REPLACE is a second overload); the argument defaults to null so the
deployed client kept working until this branch ships.

**File:** `20260826112559_…sql:110`, `src/app/api/me/entitlement/refresh/route.ts`

"Later expiry wins" is correct against a stale reconcile but not against a
legitimate backward move (refund, expiration) that lands between the
RevenueCat REST read and the RPC write. Window is one round trip, user-timed.

**Change (design call, small):** have the webhook handler record
`last_event_at` per user; carry the REST fetch start time into the RPC and
refuse the write when it predates the newest webhook event. Alternative: skip
the RPC when the REST snapshot's expiry is later than the row's but the row
was written by a webhook in the last N seconds. Pick one; add the test 1.4
describes.

### 3.3 Flood-stage stamp clearing uses the ungated reading

**Done 2026-09-02.** 3.4 and 3.5 as well, in the same commit.

**File:** `src/app/api/cron/update-gauges/route.ts:503-538` vs the
`gateReading` at `:544`

`aboveFloodStage` reads `reading.gaugeHeightFt` before gating. An unrated
gauge stamped `dangerous` from a real flood, then one pass with a null or
equipment-flagged height, returns `unknown`, clears the stamp, and the next
clean reading re-emits `unknown → dangerous` as a duplicate push. Latent:
`20260824232949` inserts the three tailwaters without `flood_stage_ft`. Live
the day one is backfilled.

**Change:** compute `aboveFloodStage` from the gated reading. Add a case to
`src/lib/conditions/unrated-gauge.test.ts`.

### 3.4 Dam detail route serves a stored row for a dam no longer in the registry

**File:** `src/app/api/dams/[damId]/route.ts` (the stored-row branch)

The index route's `summaryOf` refuses unknown dams; the detail route does not
check `getUsaceDam` before serving a stored snapshot, so a removed dam stays
servable for up to an hour until the cron prunes it.

**Change:** check the registry first, as the index route does.

### 3.5 Minor

- Webhook TRANSFER with zero source rows and `reconciled.status === 'none'`
  returns `applied` with only a `console.log` (`webhooks/revenuecat/route.ts:238-255`).
  Correct retry decision; log at warn so the one silent outcome in a path
  built to be loud is visible.
- `GET /v1/subscribers/{id}` creates the subscriber on miss (201), so the
  `not_found` branch in `src/lib/revenuecat/api.ts:205` is dead and every
  never-purchased Restore creates a RevenueCat record. Harmless to
  entitlement. Either delete the branch and its test or document why it stays.

---

## Phase 4 — UI papercuts, batch A: visible on every load, mechanical (one PR)

Validate with `make check-web` (chart-model, chart-parity and tailwater-status
suites) plus a look at one river page and one river card.

### 4.1 The tailwater row pulses while the gauge loads

**Done 2026-09-02.** 4.1 through 4.6 in one commit. 4.2 measures the plot
with a ResizeObserver and falls back to the old percentage where there is
none (SSR, the OG renderer). 4.4 adds a `minStep` floor to the shared tick
ladder, passed as 1 for cfs by both renderers, and widens a flat series'
domain to its synthetic range. 4.5 dropped the row's own border: the card
above already ends in one.

**File:** `src/components/gauge/RiverGaugeDetail.tsx:385-395`

`animate-pulse` is on the parent `<section>`; it animates opacity, and the
child's `animate-none` cannot opt out of an inherited opacity animation.
Confirmed in source. Permanently visible on first paint for the three
inactive tailwaters, which hit this branch on SSR.

**Change:** move `animate-pulse` onto the skeleton `<div>`s and delete the
"Not pulsing: it is real" comment.

### 4.2 Threshold labels collide on the card sparkline

**File:** `src/components/ui/FlowTrendChart.tsx:420` (`MIN_LABEL_GAP = 12`)

The gap is a percentage of plot height; labels are now two lines of 9px text
(~22px). At the river card's `h-32` (128px), 12% is 15px, so High and Flood
~200 cfs apart on a 0–1,600 domain overprint.

**Change:** make the gap pixel-aware (measure from container height) or scale
it so the minimum clearance is ~24px at the smallest surface.

### 4.3 Threshold number reads "1.4k" while the tooltip reads "1,400"

**File:** `src/components/ui/FlowTrendChart.tsx:1223`

Uses `formatVal` (k-abbreviated) for the number the commit says people open
the chart for; `formatTooltipVal` two lines away prints the full value. The
label column is `whitespace-nowrap` and 48px wide, which fits five characters.

**Change:** use `formatTooltipVal` here.

### 4.4 Duplicate axis ticks on a flat low-flow week

**File:** `shared/chart-model.ts:271`

A flat cfs series gets a synthetic 10-cfs range, so a week at 5 cfs yields a
4.2–5.8 domain, ticks 4.5/5.0/5.5, and both renderers print **5, 5, 6**.

**Change:** either widen the synthetic cfs range to a whole-number step or let
the cfs formatter show one decimal when the tick step is below 1. Add the
case to `shared/chart-model.test.ts`.

### 4.5 Double rule under the summary card

**File:** `src/components/dam/TailwaterStatusRow.tsx:47`

`border-t` sits flush under `GaugeSummary`'s `rounded-xl border` card, so
the two borders stack into a 2px line that runs past the rounded corners.

**Change:** drop the `border-t` (the card already separates) or add the
`pt-3` gap the comment argues against.

### 4.6 Doc and comment updates from 1.5 that live in these files

The "168px" comments in `chart-model.test.ts:255` and `GaugeChart.tsx:1021`.

---

## Phase 5 — UI judgment calls: look on a device first, then decide

Each is a real observation, but the right fix is a product call. Spend ten
minutes on a simulator with a stale gauge, a fresh install, and airplane mode
before writing any of these.

| # | Where | Observation | Suggested direction |
|---|---|---|---|
| 5.1 | `FlowTrendChart.tsx:1167-1179`, `GaugeChart.tsx:1197-1230` | The "Now" label marks the last observation; a gauge that stopped two days ago labels a point two days old "Now", with a hole before the forecast | Gate the word on reading staleness both renderers already have: "Now" fresh, "Last reading" past a few hours |
| 5.2 | `eddy-ios/app/(tabs)/reports.tsx:102-110, 1528-1533` | Fresh install: seeded index makes `rivers` non-null, so the spinner is skipped and 25 rows read "unknown" for seconds while `/api/rivers` loads, with nothing saying "loading" | A one-line "Loading conditions…" strip when `cached.seeded && !riversAt.current` |
| 5.3 | `eddy-ios/app/(tabs)/favorites.tsx:156-168` | Cached conditions inside the 6 h window render in full colour with no offline marker; Today at least writes the error slot | Render the offline glyph `offline-cache.ts:386` describes for the fresh band |
| 5.4 | `eddy-ios/app/(tabs)/index.tsx:2361-2386` | Locate button: the new alert fires only on `denied`; `unavailable` (permission granted, no fix) still spins then does nothing | Alert for `unavailable` too, with "no location fix" wording |
| 5.5 | `useEddySearch.ts:430`, `index.tsx:2669`, `client.ts:1291-1298` | Any non-cancel search failure, including 5xx and the 404 from older deploys, shows "Check your connection" | Distinguish network from server in `searchEddy`'s `available:false` reason and word the empty state accordingly |
| 5.6 | `eddy-ios/app/(tabs)/profile.tsx:115, 532, 548` | `confirmPending` hides "Get Eddy Premium" until `entitlement.isActive` flips; if the server never catches up it stays hidden all session, contrary to the comment | Time-box it (a few minutes) then fall back to the button with the "catching up" copy beside it |
| 5.7 | `GaugeChart.tsx:166, 512-516, 613, 1302` | Six-digit cfs (Arkansas floods past 100k) runs off the Svg edge; a single-observation series maps every x to 0 and emits three identical time labels, where web refuses that case | Widen `PAD_RIGHT` or k-abbreviate above 99,999 as web does; refuse the one-point plot as web does |
| 5.8 | `FlowTrendChart.tsx:1140-1179`, `GaugeChart.tsx:1143-1160, 1214-1228` | "Now" label and a top-of-domain NWS stage label can share a baseline on a 24h range with a multi-day forecast | Nudge one when both are within one line height |
| 5.9 | `scripts/ingestion/access-points/white.json`, `norfork-tailwater.json`, `taneycomo.json` | "Norfork Access" is in two files at the same coordinates (legitimate for a confluence ramp, but two overlapping pins); `ownership` casing (`state_park`, `county`, `city`) drifts from siblings (`State Park`, `County`, `City`) | Fix casing in the JSON before import; decide whether the confluence pin lives on one river or both — out-of-scope import, in-scope edit |

---

## Phase 6 — data follow-ups needing a production query or an owner call

Read-only queries first. No production write without explicit authorization.

### 6.1 Newly snappable Niangua points and Montauk were never mile-checked

The Montauk and Niangua migrations touched `location_orig` expecting the
trigger to recompute miles; it preserves them (1.5). Whistle Bridge, Mother
Nature's, Ha Ha Tonka and Montauk therefore carry whatever mile they had
before the line changed. The Van Buren sweep found no NULL-mile endpoints, so
they are non-null, but nothing checked they are on the new line's scale.

**Do:** query `length_miles * ST_LineLocatePoint(geometry, location_snap)`
for the four points against their stored mile. Correct in a migration if any
differ by more than the snap tolerance; then fix the two comments.

**Queried 2026-09-02, read-only.** The four points are not the finding. The
scale is.

| River | Approved points | Median (geometry − stored) | Range |
|---|---|---|---|
| Bourbeuse | 18 | +29.5 mi | +26.0 to +34.2 |
| Niangua | 18 | +25.2 mi | +23.6 to +33.4 |
| St. Francis | 9 | +23.5 mi | +22.4 to +23.8 |
| Meramec | 29 | +22.8 mi | +21.8 to +26.6 |
| Buffalo | 21 | +15.7 mi | +15.0 to +17.3 |
| Black | 8 | −7.8 mi | −10.6 to −5.8 |
| Courtois | 6 | +7.0 mi | +6.4 to +7.2 |
| Eleven Point | 17 | +4.7 mi | +3.0 to +6.4 |
| Gasconade | 19 | +3.9 mi | −0.3 to +8.2 |
| Current | 33 | +0.6 mi | −0.7 to +3.1 |

Points within 500 m of the line only. A uniform offset per river means the
stored miles are a published guide's scale — mile 0 at a conventional put-in
or a county line — and the geometry's scale starts at the NHD headwaters.
Neither is wrong; they are different rulers. Differences between two access
points on the same river agree to within a mile, so float time, which
subtracts, is unaffected. Anything that derives a mile FROM geometry and
compares it to a stored one — POI placement (`00040`), a gauge's mile, a
future "where am I" — is off by the river's offset. Whistle Bridge, Mother
Nature's and Ha Ha Tonka sit on the Niangua's guide scale like their
neighbours (+26.0, +25.6, +27.4): no per-point bug. This is older than the
ten branches and larger than this plan; it wants its own review.

**The Current is the one live regression.** Its stored miles are guide
miles too, but the guide's mile 0 was near the old line's start, so the
offsets are small. Montauk's `0.10` is hand-maintained and predates the
extension (`20260823192151:45`). Freeing Montauk as a put-in against a Tan
Vat still at guide mile `0.90` makes the Montauk → Tan Vat reach 0.8 stored
miles; the geometry says 2.38. A float plan for the first reach on the
river computes at a third of its length. Downstream the stored miles drift
0.4 to 3.1 below geometry (Big Tree +3.1, Clubhouse +2.9, Powder Mill +2.0),
and the geometry values sit closer to NPS's published mileposts than the
stored ones do (Akers 17.2 vs 16.7; Cedargrove 9.6 vs 9.0).

**Done 2026-09-02, applied as `20260902132921`.** Every access point, gauge
and POI on the Current within 500 m of the line is measured from Montauk on
the line's ruler; rows farther off are untouched. Montauk → Tan Vat reads
2.38. The gauges were worse than the access points (Van Buren 100 → 86.63,
Doniphan 134 → 125.13) and three POIs were 13–21 miles off (Big Spring
69.2 → 90.89, which is the four miles below Van Buren the NPS quotes). Two
outfitter POIs with only a snapped location were missed by the first
predicate and fixed by `20260902134206`.

### 6.2 Geometry-derived miles outside `access_points` on the Current

`points_of_interest`/campground miles were assigned from the old Tan-Vat line
(`00040_assign_rivers_to_pois.sql`). Extending the Current ~2.4 miles upstream
shifts the correct value for every stored POI mile on the river. The War Eagle
migration enumerated tables; the Current one did not.

**Do:** count rows in each mile-carrying table for the Current. If any, one
migration that recomputes them from geometry, with an assertion on the
Montauk-to-Tan-Vat delta.

**Queried 2026-09-02, read-only.** Five tables carry a river mile besides
`access_points`: `points_of_interest.river_mile`, `river_gauges.river_mile`,
`river_hazards.river_mile_downstream`, `community_reports.river_mile`,
`river_sections.river_mile_start/end`. On the Current: 8 of 16 POIs and 4 of
5 gauges carry one; hazards, reports and sections carry none. Twelve rows.
Fold them into the 6.1 migration if the geometry option is taken.

**Done, in the 6.1 migration.**

### 6.3 Migrations that abort a from-scratch `supabase db reset`

`20260901180642:239-254` raises "expected 2 recalibrated ladders, found 0" on
empty tables; `20260803170000:229-230` already did. The Echo Bluff, Van Buren
and #1254 migrations use a `populated` guard. Optional: retrofit the guard to
the two ladder migrations so a reset succeeds. Only matters for local resets.

### 6.4 Backfill status for the three Cumberland dams

`docs/RIVERS_AND_DAMS_FIX_PLAN_2026-08-24.md:332-336` says the 192-hour
backfill was still owed. Nothing in the repo records it running. If it was not
run inside CWMS's ~15-day window the 53 hours are gone; either way, record
the outcome in that doc.

### 6.5 Seeds after Echo Bluff

`seed/access_points.sql` has no `echo-bluff-state-park` row and no seed sets
Montauk `is_float_endpoint`. A reset yields corrected `nearby_services`
coordinates but no Echo Bluff access point or `same_place` link. Consistent
with prior practice; fix only if local resets are meant to mirror production.

---

## Sequencing

```
Phase 0  ── apply + rename + verify ──────────────────────────► unblocks 2, 3, 4
Phase 1  ── guards; 1.1 and 1.3 can land in the Phase 0 PR
Phase 2  ── iOS batch ──┐
Phase 3  ── server ─────┼── independent once Phase 0 is in; one PR each
Phase 4  ── UI batch A ─┘
Phase 5  ── device pass, then one PR per accepted item or one batch
Phase 6  ── read-only queries, then migrations as findings warrant
```

Phase 0 and 1.1/1.3 together are one PR plus one production session. Do not
start Phase 2–4 PRs from a branch that predates Phase 0's renames, or every
one of them will carry the rename conflict.

## Validation

| Phase | Proves it |
|---|---|
| 0 | `make check-db` zero rows; cron `stored` = dam count; refresh endpoint not `error`; the three headers say APPLIED |
| 1 | The new ordering test fails when a `NOT YET APPLIED` file is moved below an `APPLIED` one, passes otherwise; the drift workflow posts on a deliberately unrenamed file in a test branch |
| 2 | `make check-mobile` + `make bundle-mobile`; simulator: pan A→B→A with the layer on, open Today offline then foreground online, blur the dam screen mid-load |
| 3 | `unrated-gauge.test.ts` new case; a 503 from the refresh route with Upstash unset in a preview deploy; the refund-race test from 1.4 |
| 4 | Chart suites; one river page and one card screenshot at 128px with two thresholds ~200 cfs apart; a 5-cfs week fixture |
| 5 | The device pass itself |
| 6 | The queries; assertions in any resulting migration |

## What the review found solid, so nobody re-litigates it

Request-dedup memory handling and rejection sharing; cron auth, locking and
`never cache an outage`; RLS and grants on `dam_snapshots`; the unrated-gauge
guard and its flood bypass; hook ordering across every edited iOS screen; the
chart tick ladder and the gradient z-order fix on both renderers; the scoping
of every data-correction UPDATE; the forward-only reconcile as a fix for the
read-then-upsert race it was written for.
