# Eddy 1.1 — release-readiness report

**Date:** 2026-08-16 · **Reviewed tree:** `origin/main` @ `f4adad6` (the code
that ships) · **Verification branch:** `claude/app-store-1-1-review-eolwh6`
(runbook evidence + migration repair)

> **Update 2026-08-16 (later):** every code finding below has been **fixed**
> on `claude/app-store-1-1-review-eolwh6` (commit `8aa53d5`), with tests
> pinning each one and `make check-web` / `check-mobile` / `bundle-mobile`
> all passing. Two migrations are written but **not applied** — see
> *Outstanding* at the end. The findings are kept in full because the
> reasoning is the record; each now carries its fix.

**Verdict as first written: not ready to cut the production build.** The
automated checks, migrations, and backend gates were green, but a
four-surface deep review of the 1.1 delta found two high-severity bugs, one
violated release gate on a web surface, and one safety-direction copy bug —
all fixable in code before the build is cut — plus the runbook's remaining
on-device and judgement gates.

The four review sweeps covered: the dam data pipeline, the dam console
(web + iOS), the map filter drawer + mobile map sheet (PRs #1196/#1197/#1199),
and search/captions/access services. Each finding below was verified against
the actual code path, not pattern-matched.

---

## Fix before the build is cut

Severity-ordered. "Binary" means compiled into the iOS build (fix must land
before the EAS cut); "server" means deployable independently afterward, but
all of these should land first anyway — the staggered-rollout smoke test is
only meaningful against the backend that will actually serve 1.1.

### 1. High — the dam pattern strip draws every observed hour one hour late (server)

**Fixed.** `bucketHourly` now takes the series' period and shifts the stamp back by it before flooring; the duration comes from `periodEndingMs`, which reads the CWMS *duration* field (not the interval, so `Inst.1Hour.0` is correctly left alone). Migration `20260816120000` moves the stored rows. Tests pin both conventions and the 15-minute case.

`missouri-float-planner/src/lib/data/dam-history.ts:89` (with
`dam-history.ts:225` and `src/app/api/cron/sync-dam-history/route.ts:121`).
Found independently by two reviewers.

CWMS hourly averages are stamped **period-ending** — a point stamped `t`
covers `[t−1h, t)`. The forecast builder honors this
(`dam-forecast.ts:66` maps stamp `t` to a window starting `t−1h`); the
history pipeline does not: `bucketHourly` floors the stamp and the wire
contract draws it as the hour **beginning** `t`. Every stored history series
is hourly `Ave` (SWL `Flow-Plant.Ave.1Hour` / `Flow-Res Out.Ave.1Hour`, LRN
`Flow-Turbine.Ave.1Hour`), so effectively the whole strip population shifts
one hour late — start *and* stop. On today's row the observed half sits
against the schedule half, which is placed correctly, so a schedule the repo
measured as "EXACT" visibly disagrees with its own observation by one hour
at the seam; and the forecast card, built from the byte-identical LRN
series, disagrees with the history strip on the same data. The dangerous
direction is the start side: the pattern reads "idle until 11" when units
actually start at 10.

Same root confusion, minor: the cron's "still filling" filter drops the
bucket stamped `currentHour`, which under period-ending semantics is the
*just-completed* hour — the freshest bar always lags one extra pass.

The test gap that enabled this: `dam-history.test.ts` pinned bucket
arithmetic with synthetic stamps but never pinned the CWMS stamp convention,
while `dam-forecast.test.ts` did. Both are pinned now.

*On the approach:* this report first suggested compensating at read time and
leaving the stored rows alone. That was wrong — it would have left the table
permanently in one convention and its readers in another, and every new
consumer would have had to know. The write side is fixed and the stored rows
are migrated, so `observed_hour` means one thing everywhere. Re-fetching
instead of migrating was not an option either: CWMS repairs only about a
week, and the backfill's oldest rows are already at that edge.

### 2. High — All-scope search paging silently skips rows (binary)

**Fixed.** `searchEddy` accepts per-kind offsets and the hook tallies rows by kind; the route reads `?offsets=river:12,gauge:20`, falling back to the flat `offset` for scoped and older callers.

`eddy-ios/src/hooks/useEddySearch.ts:327` with
`missouri-float-planner/src/app/api/search/route.ts:229` and
`eddy-ios/app/(tabs)/reports.tsx:1297`.

The server applies `offset` **per kind**; `loadMore` sends
`answer.results.length` — the total across all kinds. Scoped tabs are fine,
but the Today tab's default **All** scope (`kinds: ['river','access_point','gauge']`)
pages through the same footer: page 1 allocates ~16–18 rows per kind, then
`loadMore` sends `offset=50`, and the server skips the first 50 rows of
*each* kind. Rows ~17–49 of every kind are unreachable, with no visible
symptom.

### 3. Medium — the web plan map prints "USGS swl-clearwater-dam" — the exact string the release gate forbids (server)

**Fixed.** Both surfaces call `stationCaption`. `getGaugeStatus` now selects `provider` and `site_id_external`, and `AccessPointGaugeStatus.usgsId` is typed nullable, as it always was in fact.

`missouri-float-planner/src/components/map/GaugeStationMarkers.tsx:292`
hardcodes `USGS ${gauge.usgsSiteId}`; for the Black River plan page that
includes the curated Clearwater USACE station, whose `usgsSiteId` falls back
to `site_id_external`. The popup captions a Corps release as
"USGS swl-clearwater-dam". Same pattern at
`src/components/access-point/AccessPointGauge.tsx:83` ("USGS · Updated
12 min ago" under USACE data; the type at
`src/lib/access-points/detail.ts:404` asserts `string` for a field that is
null for Clearwater). The gate holds in iOS and in search — these two web
surfaces never adopted `shared/station-caption.ts`. Adopt it there.

### 4. Medium — "midnight ⟨weekday⟩" is still wrong beyond tomorrow, in the dangerous direction (binary)

**Fixed** in `moveClock` and `nextScheduleChangeSentence`: a midnight is named for the day it *closes* at every offset, which is the same rule that already produced "tonight". The forecast card additionally spells out the date past six days out.

`missouri-float-planner/shared/dam-generation.ts:546` (`moveClock`) and
`shared/dam-schedule-copy.ts:409` (`nextScheduleChangeSentence`). PR #1196
fixed the "wrong midnight" only for `dayOffset === 1`. A start at hour
ending 1 two-plus days out renders "midnight Monday" — which reads as the
midnight that *closes* Monday, but the release starts 00:00 Monday, Sunday
night. A weekend-idle schedule showing generation resuming Monday hour
ending 1 tells a wading angler they have until Monday night; the units start
24 hours earlier. Reachable today: SWPA posts several days at once and
`scheduleOutlook` walks all of them.

### 5. Medium — the iOS pattern strip freezes "now" at mount (binary)

**Fixed.** The strip keeps its own minute clock, as the web one does, so it is correct whoever mounts it.

`eddy-ios/src/components/dam/DamPatternStrip.tsx:53` memoizes
`patternRows(...)` on props only, so the strip ignores the screen's minute
tick (added expressly so the measured→scheduled handoff wouldn't freeze).
Hours after mount, the now-marker and the outlined "scheduled" cells for
already-elapsed hours sit stale while every other surface on the screen has
moved. The web strip does this correctly (`now` is ticked state and a memo
dep).

### 6. Medium — dams with no posted schedule render the rest of today as "No reading" (binary)

**Fixed.** A fourth cell kind, `future`, is drawn as an empty slot and spoken as "still to come, with no schedule published". Rows keep their 24-cell width so the days stay aligned.

`missouri-float-planner/shared/dam-generation.ts:1163` fills today's
post-split hours with `scheduledCell(undefined)` → `missing` — the
feed-outage treatment — whenever the schedule array is empty. That is every
LRN dam always (SEPA — no SWPA schedule exists) and any SWPA dam with an
unrefreshed file. Wolf Creek at 8 AM shows ~16 dashed "No reading" cells for
hours that haven't happened, directly above a forecast card that says what
those hours hold; VoiceOver states "16 hours with no observation" as a
coverage fact about the future. End today's row at the split for
schedule-less dams, or add a fourth cell treatment for future-unknown.

### 7. Medium — a dead LRN forecast job would render a days-old plan as fresh (server)

**Fixed.** `forecastPlanStale` reads the plan's own remaining horizon — the only signal that can catch a dead writer, since CWMS publishes no write time — and both cards now say "Planned through ⟨date⟩".

`missouri-float-planner/src/lib/data/dams.ts:509` /
`src/components/dam/GenerationForecast.tsx:98`. The only freshness signal on
the generation forecast is `retrievedAt` — the `Date` header of *Eddy's own
fetch* — so if LRN's daily forecast-write job dies, the still-readable series
keeps producing windows for up to ~9 days under a fresh "refreshed daily"
badge, on a card people wade against. Add a content-age guard (e.g. last
point's write horizon shrinking below ~7 days).

### 8. Medium — each typed-search page silently loses one arbitrary row (server)

**Fixed.** `pageOf` drops the probe row in the source's order and only then applies the display order. Tested for the page-boundary invariant.

`missouri-float-planner/src/app/api/search/route.ts:595–620`. The route
fetches `limit+1` rows in stable DB order, then re-sorts by relevance and
slices — so the row cut is the relevance-worst row, not the 51st. That row
never reappears on any page (page 2 starts at DB row 51), and the client's
"should never fire" dedupe fires on every page boundary. Drop the probe row
(the 51st in DB order) *before* the relevance sort.

### 9. Medium — the web river page renders permanently-closed businesses (server)

**Fixed.** `serviceEligible` added to the web mirror and applied before counting or grouping; the parity test now sweeps eligibility as well as tiers.

`missouri-float-planner/src/components/river/NearbyServices.tsx:345` groups
services with no eligibility check and the route never filters `status`;
iOS applies `serviceEligible` on the same data. A `permanently_closed`
outfitter disappears from the app but keeps a tappable phone number on
eddy.guide — the exact case the service-model docs call out. Apply
`serviceEligible` (or filter in the route).

### 10. Medium — the layer sheet's ⓘ button is unreachable by VoiceOver (binary)

**Fixed.** The row exposes an `info` custom action; the nested pressable no longer claims a stop it cannot hold.

`eddy-ios/src/components/MapLayersSheet.tsx:247`. The info `Pressable` is
nested inside the row `Pressable` (an accessible container with
`accessibilityRole="switch"`), so iOS subsumes it: the Public land row is a
single VoiceOver stop and the "About Public land" control does not exist
non-visually. The public-land ownership caveat partially survives in the
row's hint; the IEM radar attribution — previously an always-visible
`LayerNote` — is now unreachable for screen-reader users entirely.

## Fix when convenient (low severity)

- **Provider defaults to USGS on a failed sub-query** —
  `src/app/api/gauges/[siteId]/route.ts:266` never checks
  `stationResult.error`; a transient failure makes Clearwater answer
  `provider: 'usgs'` with a 404 `publicUrl` for the cache window. The
  provider is a claim; don't default it on error.
- **`hasMore` unsatisfiable at the advertised `limit=100`** — the probe asks
  for 101 rows but the RPC clamps at 100
  (`search_gauges` migration, `least(p_limit, 100)`); API consumers using
  the documented max get a silently truncated corpus. iOS (page size 50) is
  unaffected.
- **Gauge→river attribution coin-flips in search** —
  `src/app/api/search/route.ts:497` orders by `is_primary` only, ignoring
  `orderRiverLinks`; USGS 07014000 can subtitle as Courtois or Huzzah
  per-request while the detail route resolves it deterministically. Worth
  fixing before `river_gauges.role` lands on the same path.
- **Ameren fall-back night** — `src/lib/ameren/osage.ts:95`: the repeated
  1 AM hour maps both rows to the same instant; one real reading a year is
  shadowed. Unhandled rather than the documented trade-off.
- **SWPA fall-back day fetched twice** — `src/lib/usace/swpa.ts:428`:
  during the 25-hour day the schedule payload carries duplicate
  `scheduleDate` entries → duplicate React keys in both schedule components.
- **Settled-empty campground card drops its VoiceOver attribution** —
  `eddy-ios/src/components/map-sheet/CampgroundAvailability.tsx:238` returns
  before the element carrying `waterSpoken`; the corner reading is announced
  as bare "540 cfs, Good" with no "at ⟨gauge⟩".
- **Latent cron filter shape-blindness** —
  `src/app/api/cron/sync-dam-history/route.ts:176` repeats the singular
  `cdaLocation` shape `hasCwmsMetricsPath` was created to fix; a future dam
  with plural `cdaLocations` and no declared `generationFlow` would silently
  get no history. No offline test pins the cron's dam set.
- **Dead `total` prop on `GaugeFilterBar`** (`eddy-ios/src/components/GaugeFilterBar.tsx:129`).
- **Design note:** LRN dams have no `generationReference`, so their pattern
  bars all collapse to minimum height — on/off is preserved (the load-bearing
  rule) but the magnitude axis is silently dead on exactly the dams with the
  most units.

## Verified green (evidence, not inference)

- `make check-web`, `make check-mobile`, `make bundle-mobile` all pass.
- Migration history reconciled two-way with production;
  `tailwater_gauge_roles` adopted into the repo; the
  `access_point_services` RLS repair is **live** — `pg_policy` shows all
  three write policies calling `is_admin()`. The trust finding was still
  `open` at review time only because the daily 18:00 UTC run predates the
  fix; it should auto-resolve at the next run (verify after today's run).
- `search_gauges` 4-arg and 5-arg overloads both present in production;
  overload discipline in the route is correct (never a defaulted
  `p_offset`), and provider threads through both.
- `usgs_site_drift` green since 2026-08-11 (`scope_count` 43).
- Clearwater gates hold where `stationCaption` is used: live search returns
  "USACE release" / `provider: "usace"`; the detail qualifier says
  "Provisional USACE data"; iOS never leaks the slug, and a 1.0 star falls
  back to the site number, never bare "Gauge". (The two web surfaces that
  bypassed the helper are finding 3.)
- Dam pattern-strip history: all 18 hourly dams (15 SWL/SWT + 3 LRN) hold
  190–193 rows per metric spanning 2026-08-07/08 → now, seamless with the
  cron's rows. (The stamps are raw CWMS — see finding 1 for how they must
  be read.)
- The access-point badge rule matches the runbook gate exactly and is
  test-pinned (`placeSymbol.ts:107`, `map-sheet-place-symbol.test.ts`).
  One nuance for the on-device check: an unknown future DB type also
  suppresses the generic "Access" badge.
- PR #1197's declutter left no dangling references; the inverted-guard
  copy test is real; the two-neighbors change is safe in all four consumers;
  `patternRows` DST split math is correct through both transitions.
- Honestly-null contract end-to-end: gap days ship as nulls, render as
  distinct "No reading" treatment, never coerce to zero (the placement
  shift, finding 1, is orthogonal to the nullness).
- Cron robustness: per-dam isolation, idempotent upserts matching the
  composite PK, prune every pass, lock released in `finally`.
- Bagnell/Ameren: `generating` stays `null` end-to-end, release-only
  console renders correctly, fail-closed parsing, honest staleness bands.

## Production state (queried 2026-08-16, read-only)

- **Services:** 154 eligible (was 153 on Aug 11 — Silver Mines Campground
  added Aug 15), 138 mapped, 16 missing coordinates (all directory-only:
  list not map), 27 mapped without geocode provenance (unchanged). The
  formal authenticated `db:check-services` run remains open — it needs the
  service-role environment and additionally checks place-ID/embedded drift.
- **Trust Ledger open findings:**
  - **Critical — Jacks Fork threshold order:** snoozed until **2026-08-22**.
    `level_low = level_optimal_min = 100` on 07065200. Needs the data
    judgement (nudge `level_optimal_min` above 100), not another snooze.
    This is the ledger's top release blocker.
  - **High — Courtois gauge proximity:** open. Encode or accept the
    governed Huzzah proxy (five miles) instead of re-snoozing.
  - **High — `admin_policies_use_is_admin`:** fixed in production; awaiting
    the next trust run to auto-resolve.
  - **Medium — War Eagle Creek length** (33.17 vs 68.1 mi): open.
  - **Medium — Niangua access point not snapped:** open (only Niangua
    remains listed; run `npm run db:snap-access-points`).

## Still open from the runbook (not closable from a checkout)

1. On-device: saved-USGS-gauge caption before any account sync (1.0 star,
   signed out); access-point badge exercise.
2. Smoke-test the 1.0 production app against the deployed 1.1 backend
   before TestFlight.
3. Authenticated `npm run db:check-services` against production.
4. `make check-db` from a linked checkout (post hand-applied repairs).
5. The Jacks Fork judgement and Courtois decision above.
6. The Apple / App Store Connect / EAS / RevenueCat dashboard blocks
   (runbook sections 1+).

## Outstanding

**Two migrations are written but NOT applied.** Both are ordinary
`supabase/migrations/` files and go out on the normal path; neither was run
against production from this session.

- `20260816120000_dam_history_period_ending_shift.sql` — moves every
  `dam_metric_readings` row back one hour. **Not idempotent by
  construction**, so it is guarded on a marker row in a new
  `dam_history_backfill_marks` table; re-running is a no-op. It drains and
  reinserts in one statement rather than issuing an `UPDATE`, because the
  shift moves each row onto its earlier neighbour's primary key and a
  row-by-row check would trip on a collision that does not exist once the
  statement finishes.
- `20260816121000_search_gauges_probe_headroom.sql` — raises the
  `search_gauges` row cap from 100 to 101 so the API's `hasMore` probe fits
  at the advertised maximum page size. Signature, ordering and grants
  unchanged.

Apply both before the backend smoke test — the strip will read an hour late
until the first one lands, and the deployed code assumes it has.

Everything else outstanding is unchanged from the sections above: the Jacks
Fork and Courtois judgements, Niangua snapping, the authenticated
`db:check-services` run, `make check-db`, the on-device checks, and the
dashboard blocks.

## Suggested order from here

1. ~~Land fixes for findings 1–10~~ — done on
   `claude/app-store-1-1-review-eolwh6`; review and merge to main.
2. Apply the two migrations above.
3. Make the Jacks Fork data judgement; decide Courtois; snap Niangua.
4. Deploy web/API; verify the trust run auto-resolved the RLS finding;
   run authenticated `db:check-services` and `make check-db`.
5. Smoke-test 1.0 against the deployed backend; then cut the preview build
   and run the on-device checks (captions, badges, and the dam strip — worth
   an extra look, since the hour shift moved every bar on it).
6. TestFlight → store metadata → production build → submit.
