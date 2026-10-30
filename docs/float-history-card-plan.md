# Float history card: condition stamp, river completed, otter moods, share

Status: plan. Nothing here is implemented yet.

Design mockup (a private canvas, not in this repository; ask the owner for
access): the "Float History Card" canvas has four boards: the history list,
the float recap, the 9:16 share image and the otter mood sheet. Art prompts
for the new moods are in `design/eddy-emoji/float-mood-otters.md`.

## Goal

The history card and the recap read like a fitness log today: river, route,
date, minutes, miles. Most test entries show `0.0 mi tracked` and "Ended before
arrival was confirmed", which reads as an error. This plan makes each saved
float record **what the water was doing** and gives it Eddy's personality:

1. **Condition stamp.** The condition and flow at put-in, in the condition's
   own colours (`CONDITION_SYSTEM`), on the card and the recap. The recap also
   names the gauge and the reading's age.
2. **River completed.** The stretch floated as a share of the river's float
   miles ("5% of the Current's float miles"), drawn on a strip of the river
   from its first access point to its last, plus one lifetime line on the
   recap.
3. **Otter moods.** One mood per float, chosen by ordered rules, drawn in the
   existing Eddy sticker style.
4. **Share.** A share action on each card and on the recap. It sends a
   server-rendered 9:16 image plus a link back to eddy.guide.

Out of scope for v1: Eddy Says one-liners on recaps, the river passport, and
any lifetime coverage UI beyond the one recap line and the strip shading (see
phase 6).

## What the code does today

- `eddy-ios/src/lib/floatRecap.ts` builds `CompletedFloat` on the device from
  the session. It records `firstMile`, `lastMile`, `plannerMph`, the time split
  and `reachedTakeOut`. It records **no condition and no weather.**
- `missouri-float-planner/src/lib/float-archive/water.ts` adds `water` (gauge
  name, station id, observed time, ft, cfs) **on the server, on account
  backup only.** Guests never get it. `floatArchiveUpload.ts` strips `water`
  before upload.
- **Completed archive rows are immutable.** `writeArchiveBatch` looks up
  `water` only for ids it has not stored, and the `write_float_archive` RPC
  updates only `saved` rows on conflict. Anything the server adds to `water`
  reaches a float on its **first** upload only. A sync replaces every
  non-dirty local row with the server's payload
  (`floatArchiveCore.ts`), so a server-side change does reach devices.
- `float-archive/validation.ts` is `.strict()`. An older server rejects any
  new client field, which is why `startNote` is gated behind
  `GET /api/me/float-archive` capabilities (`{ startNote: true }`). New fields
  must follow the same pattern.
- On the device, `readableRow` in `floatArchiveCore.ts` ignores keys it does
  not know, and `readableArchive` refuses the **whole** archive when one row
  fails. New optional fields are therefore safe for old binaries, and must not
  be added to `readableRow`'s checks (see 2d).
- **The start screen already asks for the float's condition and throws it
  away.** `float-start.tsx` calls `/api/route-estimate` through
  `useStartEstimate` (refreshed every 5 minutes). `estimateRoute` computes the
  condition there: the gauge at or upstream of the put-in (or the GPS start
  mile), escalated by any worse gauge inside the stretch. The route returns
  only distance and speed. When the code is `dangerous`, float time is
  withheld (`floatTimeWithholding`), so `plannerMph` is null on exactly the
  floats Big water is about.
- The route index (`buildRouteIndex` in `packages/eddy-geo/river-progress.ts`)
  is calibrated between the outermost access points it keeps. Beyond them,
  `riverMileAt` extrapolates at the nearest pair's scale.
- `floatEnding.ts` `discardReason` names three kinds of short float: `young`
  (under 5 minutes), `unplaced` (never placed on the river) and `stationary`
  (under 0.1 mi of progress). Discard is offered, but the paddler may End
  instead, and then the float reaches history. An `unplaced` float has
  `firstMile: null` and `distanceMiles: 0`: those are the `0.0 mi tracked`
  rows.
- The history row lives inline in
  `eddy-ios/app/(tabs)/(today,map,floats,favorites,alerts)/floats.tsx`. The
  recap is `eddy-ios/src/float/FloatRecap.tsx`, with `<Otter size={72} />` in
  the standard mood.
- `Otter.tsx` maps condition moods to seven bundled PNGs. The reaction stickers
  (`celebrate`, `laugh`, `thumbs-up`, `campfire-chill`, …) exist as masters in
  `design/eddy-emoji/`, but most are not bundled in `eddy-ios/assets/`.
- Share images already have a stateless pattern: ADR 0015 and
  `ChartShareControl.tsx` (render a PNG on the server via `next/og`, hand the
  file and the link text to the system share sheet). No new native dependency.

## Phase 1: pure logic in `shared/`

New file `missouri-float-planner/shared/float-recap.ts`, consumed by iOS as
`@eddy/conditions/float-recap`. It stays React- and native-free so the web
suite can test it. Add phase 2's optional fields to `CompletedFloat` in
`shared/float-archive.ts` now, as types only, so these functions and their
tests come first.

### Which condition

`floatCondition(trip)` returns
`{ code, gaugeName, usgsSiteId, heightFt, dischargeCfs, observedAt } | null`, from
**one** source per float:

1. `startCondition`, the condition the planner gave this float at Start (2a);
2. otherwise `water`, when it carries a `conditionCode` (the server fallback);
3. otherwise null.

The stamp and the mood rules both read this function, so they can never
disagree. It returns null for a malformed sub-object rather than throwing,
because rows on disk are not checked that deeply (2d).

### Mood rules

`pickFloatMood(trip: CompletedFloat): FloatMood | null`. The rules are checked
top to bottom, and the first match wins. Null means "untracked": the standard
otter and no mood headline.

| # | Mood | Rule | Data |
|---|------|------|------|
| 1 | `big-water` | `floatCondition` code ∈ {`high`, `dangerous`} | phase 2 |
| 2 | none (untracked) | `firstMile == null` | exists |
| 3 | `quick-dip` | `elapsedMs < 10 min` | exists |
| 4 | `rain` | precipitation at start ≥ 0.05 in | phase 2 |
| 5 | `chilly` | air temp at start < 50 °F | phase 2 |
| 6 | `scrape` | `floatCondition` code ∈ {`low`, `too_low`} | phase 2 |
| 7 | `speed-run` | `movingMph ≥ 1.3 × plannerMph` | exists |
| 8 | `lazy-river` | `stoppedMs ≥ 0.4 × elapsedMs` OR `movingMph ≤ 0.7 × plannerMph` | exists |
| 9 | `made-it` | `reachedTakeOut` | exists |
| 10 | `good-float` | otherwise | n/a |

Why this order:

- **Safety comes first.** A float started at High or Flood never gets a
  celebrating otter, however it went. The condition does not depend on GPS, so
  this holds for an untracked float too.
- **Untracked comes next.** A float Eddy never placed on the river
  (`discardReason` `unplaced`) has no distance, speed or position. It gets the
  standard otter and an honest line, not a mood that implies a trip it did not
  measure.
- **Quick dip is time only.** A distance test would call a four-hour float
  under weak GPS, or an out-and-back fishing trip, a quick dip. On a few
  minutes of tracking, speed and break ratios are noise, so it still cuts off
  everything below it.
- **Weather comes before water level.** Rain or cold is what people remember
  about the day, and Low is not a safety state. A cold float on low water gets
  Chilly on purpose.
- **Speed and Lazy come before Made it!** Most good floats reach the take-out,
  so `made-it` would otherwise swallow them.

Rules 7 and 8 apply only when both `movingMph` and `plannerMph` are non-null,
except for the `stoppedMs` half of rule 8. **A rule whose data is missing does
not match.** It never guesses, so old floats fall through cleanly. Keep the
thresholds as named exports (`MOOD_THRESHOLDS`) so they can be tuned in one
place.

Open decision: should `dangerous` (Flood) get its own mood with a plain
"Flood stage · glad you're off the water" line and **no share action**? The
recommendation is yes; it reuses the `big-water` art with different copy. The
share route enforces the high-water rule on the server either way (phase 5).

### River completed

The denominator is the **calibrated span** of the route index: the river miles
of the first and last access points `buildRouteIndex` keeps (`index.anchors`,
after it drops inconsistent ones). This is what Eddy can measure. Inside the
span, miles are interpolated between real access points. Outside it, they are
extrapolated, and on a river with editorial miles (`src/lib/geo/mile-index.ts`:
Meramec, St. Francis, Bourbeuse, Niangua) that is a guess. `firstMile` and
`lastMile` come from the same index, so numerator and denominator share one
mile system on every river, editorial or geometric. `rivers.length_miles` is
never used: it is in geometry miles and covers the whole line.

So the percentage is of the river's **float miles**, not headwaters to mouth,
and the copy says so: "5% of the Current's float miles". The strip's ends are
labelled with the first and last access names, never "headwaters" and "mouth".

`riverCoverage(trip)` returns `{ fraction, startFraction, endFraction } | null`
from `trip.riverSpan` (2b):

- Clamp `[firstMile, lastMile]` to the span first. A quick start just upstream
  of the first access point reads an extrapolated mile outside it.
- `fraction = (end − start) / (span.lastMile − span.firstMile)`;
  `startFraction` and `endFraction` place the segment on the strip.
- Null when the span, `firstMile` or `lastMile` is missing, or when the
  clamped end is not past the clamped start. Null hides the strip and the
  label; there is no "barely got wet" copy.
- `percentLabel(fraction, riverName)`: whole percents, "Under 1% of the
  Current's float miles" below 1%.

`riverLifetimeCoverage(trips, riverSlug)` merges the clamped intervals of
every completed float on that river and divides by the span of the most recent
one. A later correction to access-point miles can shift older intervals
slightly; the lifetime line is a summary, not a survey.

**Tests:** fixtures for the Current (geometric miles) and the Meramec
(editorial), each built through `buildRouteIndex`, so the span is the one the
device would snapshot. Cover a start upstream of the first access point
(clamped, never over 100%), an out-and-back (`lastMile ≤ firstMile`, null), and
overlapping lifetime intervals.

### Condition stamp

`floatStamp(trip)` returns `{ code, label, cfsLabel, ftLabel } | null` from
`floatCondition`. It uses `CONDITION_SYSTEM` for the label and colours, and
**never hardcodes condition hex** (see the header of `condition-system.ts`).

Tests: `missouri-float-planner/shared/float-recap.test.ts`, registered in the
web `test` script (otherwise `registered-tests.test.ts` fails). Cover every
mood rule, the order (Flood beats untracked, untracked beats Quick dip, Quick
dip beats Rain, Speed beats Made it!), missing-data fallthrough, the condition
source order, malformed sub-objects (null, not a throw), and the coverage edge
cases above.

## Phase 2: record the data the rules need

All new fields are optional on `CompletedFloat` so existing rows stay valid.

### 2a. Condition at start (required for the stamp, Big water and Scrape)

**The condition is the one the planner gave this float at Start.** It is the
code that withheld the float time and the one the paddler saw, it uses the
worst gauge on the stretch rather than one point, and it is frozen into the
float so a recap never changes after backup.

- **Server: return it.** `/api/route-estimate` gains an optional `condition`
  object: `{ code, gaugeName, usgsSiteId, heightFt, dischargeCfs, observedAt }`,
  taken from the gauge that set the code: the last `contributingGauges` entry
  with `effect: 'escalated'` if there is one, otherwise `anchorCondition`. Do
  not read the merged `condition` object: after an escalation it carries the
  escalated code with the anchor gauge's name and reading. Omit the field when
  the code is `unknown`. This is additive: old binaries ignore it, and an old
  server omits it, so the device stores null. Test it in
  `src/lib/calculations/route-estimate.test.ts`: anchor only, escalated, and
  unknown.
- **Device: capture it.** `fetchFloatStartEstimate` and `useStartEstimate`
  return `condition` beside `speed`, under its own freshness rule
  `currentStartCondition(result, now)` in `src/lib/floatStart.ts`: basis
  `today`, under 5 minutes old, code not `unknown`. It must not reuse
  `currentMovingSpeed`, which returns null whenever float time is withheld,
  which is always the case at Flood and on dam tailwaters. `float-start.tsx`
  passes it to `useStart` next to `plannerMph`. `useStart` applies the same
  quick-start guard as `plannerMph` (the GPS mile still within 0.1 mi of the
  estimated mile), `startSession` stores `startCondition` on the session, and
  `recapFloat` copies it. Test the helper from the web suite, beside
  `float-session.test.ts`.
- **Server fallback** for floats without it (started offline, or the estimate
  failed or went stale): in `waterAtStart`, also select from the same
  `river_gauges` link the threshold columns `computeConditionFromDbRow` reads
  and `flood_stage_ft`, plus `gauge_stations.usgs_site_id` (`water` holds only
  the internal station id today). Compute the code with
  `computeConditionFromDbRow` and `applyFloodStageOverride`, and add
  `conditionCode` and `usgsSiteId` to `water`. This is the
  anchor gauge only, without the in-stretch escalation, so the stamp names
  that gauge. Like all of `water`, it applies on a float's first upload only.
- **Display.** The recap shows one reading: `floatCondition`'s source; failing
  that, a `water` reading with no condition label (as today's "Water at the
  start" card); failing that, nothing. Never two readings.
- **A float can change mood once.** A float with no `startCondition` gets its
  condition when its first backup adds `water.conditionCode`, and never again
  after that.
- **Floats already backed up: no backfill in v1.** They keep today's reading
  without a label, and their moods fall through. Computing the code on read was
  rejected: it would apply today's ladders to an old reading, and ladders are
  recalibrated (`20260803170000_recalibrate_ozark_float_ladders.sql`), so an
  old float's stamp and mood would shift under it. If a backfill is wanted
  later, it is a one-time script through `scripts/lib/db.ts`, run as a dry run
  first, and it is a production write the owner authorises. Devices pick it up
  on the next sync.

### 2b. River span (required for river completed)

At start, snapshot the denominator from phase 1 into the session as
`riverSpan: { firstMile, lastMile, firstName, lastName }`: the first and last
`index.anchors` miles, with the names of the `route.anchors` at those miles for
the strip labels. Copy it into `CompletedFloat`. A snapshot keeps old recaps
stable if river data is corrected later.

### 2c. Weather at start (required for Rain and Chilly)

- **Where.** Use the put-in's coordinates from `route.anchors`, not a GPS fix.
  At Start there is often no confirmed fix yet (`recordedStart` is null until
  GPS confirms one), and an access point is public. For a start with no
  put-in, wait for the first confirmed position and call then, but only within
  30 minutes of `startedAt`; otherwise record nothing.
- **What.** Call `fetchLocationWeather` (the existing
  `/api/weather/forecast`; the client already rounds coordinates to 0.05°) and
  keep only the `current` observation:
  `startWeather: { tempF: current.temp, precipIn1h: current.rain1hInches, observedAt: current.fetchedAt }`.
  `current` is null when OpenWeather's current call fails; then store null.
  Never take a forecast period as an observation. The route caches for an
  hour, so `observedAt` can be up to an hour before the start. The rules
  ignore a reading taken more than 2 hours before `startedAt`.
- **When.** Best-effort and non-blocking: **never block or delay the start on
  this call.** Write the result through a session-store setter (like
  `setFloatReminders`). A response that arrives after the float ended is
  dropped.
- **Privacy.** Store only the values, never the coordinates. The request is
  already covered by the Sentry scrubber in `shared/float-search-privacy.ts`.
- **Limitation.** This captures rain at put-in, not rain during the float. v1
  accepts that. A later version can take a second reading at finish and use
  the maximum of the two.

### 2d. Validation, upload and reading back

- **Server schema.** Add the three fields to the `completed` schema in
  `validation.ts` as optional, strict sub-objects with bounds:
  - `startCondition`: `code` from `ConditionCode` without `unknown`;
    `gaugeName` (the existing `name`); `usgsSiteId` (the existing `id`);
    `heightFt` finite, −50 to 200, nullable; `dischargeCfs` finite, 0 to
    2,000,000, nullable; `observedAt` an ISO datetime.
  - `riverSpan`: `firstMile` and `lastMile` as the existing `mile`, non-null,
    with `lastMile > firstMile`; `firstName` and `lastName` as `name`.
  - `startWeather`: `tempF` −60 to 140; `precipIn1h` 0 to 10; `observedAt` an
    ISO datetime.
- **One capability.** `GET /api/me/float-archive?capabilities=1` adds
  `recapContext: true`, covering all three fields. Today `uploadFloatArchive`
  asks only when a row carries `startNote`, and caches only a positive
  `startNote` answer. Generalise it: work out the flags this batch needs
  (`startNote`, `recapContext`), require each, and cache an answer that has
  them. Extend `float-archive.test.ts` for a batch that needs only
  `recapContext`. **Deploy the web first.**
- **Reading on the device.** Do **not** add the new fields to `readableRow`.
  `readableArchive` refuses the whole archive when one row fails, so a strict
  check would turn one malformed field into an unreadable history. The phase 1
  readers return null for a malformed sub-object instead.

## Phase 3: UI

### History card (`floats.tsx`)

Extract the inline row into `eddy-ios/src/float/FloatHistoryCard.tsx`. Layout,
per the mockup:

- **Eyebrow:** river · short date.
- **Title:** "Put-in → Take-out". With no put-in, "To <take-out>" plus a muted
  "Started on the water" line. This replaces the repeated "On-river start →".
- **Stamp:** top right, rotated about −5°, condition ink on its tint, a double
  ring. It shows the label and cfs, and is hidden when there is no condition.
- **Otter tile:** a 72pt tile on the condition tint, with the mood sticker
  breaking out of the top edge. An untracked float shows the standard otter.
- **Mood headline** in Fredoka, using `accent[700]` for contrast, not
  `accent[500]`. Below it, stats in Geist Mono: "9.8 mi · 4h 12m · 2.3 mph".
- **Untracked** (`pickFloatMood` null because `firstMile` is null): no mood
  headline, the duration alone, and "Not placed on the river", in line with
  `discardCopy('unplaced')`. Never "0.0 mi".
- **Quick dip** shows "Under a minute on the water" or "Under 10 min on the
  water" instead of zeros. Both are true by construction, since the rule is
  time only.
- **River strip:** an 8pt track with the floated segment (minimum 8pt wide),
  plus the percentage label and the mile range. Hidden when `riverCoverage`
  is null.
- **Share button:** 44 × 44, `accessibilityLabel="Share this float"`. Hidden
  for Flood if the open decision above lands that way.

Accessibility: the card's `accessibilityLabel` should read the content in
order, for example "Current River, Oct 26. Akers Ferry to Pulltite. Flowing,
412 cfs. Made it. 9.8 miles, 4 hours 12 minutes. 5% of the Current's float
miles." The stamp and otter are decorative (`accessibilityElementsHidden`), as
`Otter` already is.

### Recap (`FloatRecap.tsx`)

- **Hero:** the mood sticker at about 150pt breaking out of a condition-tinted
  panel, the mood headline, the river, the route, the date and the boat.
- **Stamp card:** stamp plus a plain sentence about the water at put-in,
  "<gauge name> · USGS <id>", and the reading's time relative to the start.
  It replaces the current "Water at the start" card and shows the one reading
  2a chooses.
- **River completed card:** the large percentage, the strip with the first and
  last access names at its ends, the mile range, earlier floats on this river
  shaded on the strip, and one lifetime line from `riverLifetimeCoverage`
  ("You've floated 33.4 of the Current's 134 float miles"). Lifetime counts
  the floats in this phone's history only.
- **Keep the existing stats and the time breakdown.**
- **Actions:** the primary "Share float" button (teal CTA per ADR 0007), a
  share button in the header, "Your float history" demoted to secondary, and
  Delete unchanged.

Dark mode: use theme roles for the card surfaces and the condition chip roles
for the stamp (`conditions.ts`), with neutral charcoal per ADR 0016. Check
the stamp's tint and ink in dark mode.

## Phase 4: mood art

Bundle the moods at 300px through `python3 eddy-ios/scripts/build-eddy-icons.py`.
Masters go in `design/eddy-emoji/`; the prompts go in
`design/eddy-emoji/float-mood-otters.md`, in the template format of
`dam-metric-icons.md`.

| Mood | Art |
|------|-----|
| `made-it` | existing `eddy-celebrate.png` (bundle it) |
| `good-float` | existing `eddy-thumbs-up.png` (bundle it) |
| `quick-dip` | existing `eddy-laugh.png` (bundle it); optional new "toe dip" |
| `lazy-river` | existing `eddy-campfire-chill.png` (bundle it); optional new "tube float" |
| `big-water` | **new**: bracing in a kayak on a wave train |
| `rain` | **new**: coral poncho, paddle as umbrella |
| `chilly` | **new**: beanie, scarf, steaming mug |
| `scrape` | **new**: hauling a kayak over gravel |
| `speed-run` | **new**: speed lines, wind-swept fur |

Extend `Otter.tsx` with a `FloatMood → require()` map (static requires, as its
header explains). Ship phase 3 with the existing stickers standing in, so new
art is not a blocker; until a sticker exists, its mood falls back to the
nearest existing one. Check the size of the PNG set, since the header records
193 KB for the condition otters.

## Phase 5: share

Follow ADR 0015's pattern: stateless, server-rendered, with no account data
stored.

- **Route:** `GET /api/share/float/image?v=1&…`, rendering 1080 × 1920 PNG
  through `next/og`.
- **Query:** river slug, put-in id (optional: a float can start on the water)
  and take-out id, date (no time of day), mood, condition code, cfs, distance,
  duration and coverage. Validate every field with a strict schema. On an
  invalid field, render a generic Eddy card; never echo raw text.
- **Names:** the server resolves names from ids. Free text from the client is
  never drawn, which closes the route off as a way to render arbitrary text.
- **High water is enforced here, not only on the device.** Anyone can call the
  route with any query. When the condition is `high` or `dangerous`, the
  server ignores the client's mood and draws `big-water`; if the open decision
  lands as recommended, `dangerous` renders the generic Eddy card.
- **What it never includes:** start and end times, the GPS track, the account,
  or `startNote`.
- **Link text:** the river's eddy.guide page from the server-supplied path,
  per `eddy-ios/src/lib/share.ts`. App routes and web routes differ.
- **iOS:** reuse the `ChartShareControl` flow. Prepare the image (network
  needed), then pass the file and the link text to the system share sheet.
  Report a failure to *prepare*; stay quiet on a cancel. Pull the shared parts
  into a small `useShareImage` helper rather than copying them.
- **Native fingerprint:** unchanged, because `expo-file-system` and `Share`
  are already shipped. This can go out as an OTA update once the web route is
  deployed. Confirm with the fingerprint check in `eddy-ios-release-prep`.
- **Decision record:** add a short ADR, or extend ADR 0015, recording what a
  float share may contain.

## Phase 6 (later): passport

A river passport (stamps per river) and an "X of N Ozark rivers" stat for
influencers to post. Both build on `riverLifetimeCoverage` from phase 1.

## Order and validation

| Step | Ships | Validate with |
|------|-------|---------------|
| 1. `shared/float-recap.ts` + types + tests | web + iOS bundle | `make check-web` + `make bundle-mobile` |
| 2a server: route-estimate `condition`, `water.conditionCode` | web | `make check-web` (`route-estimate.test.ts`; `float-archive.test.ts` with an injected `lookupWater`) |
| 2a–d client fields, schema and capability | web first, then iOS | `make check-web` + `make check-mobile` + `make bundle-mobile` |
| 3. card + recap UI | iOS (OTA-eligible) | the above, plus device check in light, dark and Increase Contrast |
| 4. art | iOS | icon build script, PNG budget |
| 5. share route + control | web first, then iOS | `make check`; share sheet on a device |

Describe status in the three states from the root guide: **implemented**,
**device-verified**, **released**.

## Open questions

1. Does Flood get its own mood with no share action? (Recommended: yes.)
2. The thresholds (10 min, 0.05 in, 50 °F, 1.3×, 0.7×, 40%) are starting
   guesses. After phase 2, run `pickFloatMood` over real archive rows
   (read-only, through the guarded client in `scripts/lib/db.ts`) and tune the
   rule frequencies before release.

Settled here, for the record: the condition source and its fallback (2a), no
backfill of floats already backed up (2a), and the coverage denominator
(phase 1, river completed).
