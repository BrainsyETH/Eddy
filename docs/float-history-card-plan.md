# Float history card: conditions at start, river explored, otter moods, share

Recap presentation was revised on 2026-10-31: the individual route map/progress
replaces the recap's whole-river strip/lifetime panel, and starting weather is
shown with water conditions. See ADR 0012 and the iOS README for current display
and archive-capability rules. The phase notes below describe the earlier rollout;
history/share measurement and mood rules still apply.

Status: phases 1a to 5 implemented, with phase 4's existing stickers bundled
and stand-ins for the five moods whose art is not drawn yet. The canvas is in
`design/float-history-card/`, with where this plan overrides it; the
device-state screenshots and the share-sheet checks are still to do.

Design mockup (a private canvas, not in this repository; ask the owner for
access): the "Float History Card" canvas has four boards: the history list,
the float recap, the 9:16 share image and the otter mood sheet. Exports go
into the repository before phase 3 starts (see *Order and validation*). Art
prompts for the new moods are in `design/eddy-emoji/float-mood-otters.md`.

## Goal

The history card and the recap read like a fitness log today: river, route,
date, minutes, miles. Most test entries show `0.0 mi tracked` and "Ended before
arrival was confirmed", which reads as an error. This plan makes each saved
float record **what the water was doing** and gives it Eddy's personality,
without claiming more than the tracker measured:

1. **Conditions at start.** The condition and flow the planner gave the float
   at Start, in the condition's own colours (`CONDITION_SYSTEM`), on the card
   and the recap. The recap names the gauge and the reading's age.
2. **River explored.** The river miles the tracker credited, drawn on a strip
   of the river from its first access point to its last, with the share of
   the river's float miles as a secondary figure and one lifetime line.
3. **Otter moods.** One mood per measured float, chosen by ordered rules,
   drawn in the existing Eddy sticker style. A float with nothing measured
   gets the standard otter.
4. **Share.** One share action on the recap (and one on each card). It sends
   a server-rendered 9:16 image plus a link back to eddy.guide.

Out of scope for v1: Eddy Says one-liners on recaps, the river passport, and
any lifetime UI beyond the one recap line and the strip shading (phase 6).

## What the code does today

- `eddy-ios/src/lib/floatRecap.ts` builds `CompletedFloat` on the device from
  the session. It records `firstMile`, `lastMile`, `plannerMph`, the time split
  and `reachedTakeOut`. It records **no condition and no weather.**
- **`lastMile − firstMile` is not distance travelled.** In
  `packages/eddy-geo/float-totals.ts`, `accumulateFloat` moves `last` to every
  new sample, including after a gap longer than `MAX_CREDITED_GAP_MS` (2 h)
  and after a relocation (a wrong match corrected), both of which credit
  nothing. `distanceMiles` respects those rules but is gross: an out-and-back
  counts twice. Neither says which river miles were covered.
- `missouri-float-planner/src/lib/float-archive/water.ts` adds `water` (gauge
  name, station id, observed time, ft, cfs) **on the server, on account
  backup only.** Guests never get it. `floatArchiveUpload.ts` strips `water`
  before upload.
- **Completed archive rows are immutable.** `writeArchiveBatch` looks up
  `water` only for ids it has not stored, and the `write_float_archive` RPC
  updates only `saved` rows on conflict. Anything the server adds to `water`
  reaches a float on its **first** upload only. A sync replaces every
  non-dirty local row with the server's payload (`floatArchiveCore.ts`), so a
  server-side change does reach devices.
- `float-archive/validation.ts` is `.strict()`. An older server rejects any
  new client field, which is why `startNote` is gated behind
  `GET /api/me/float-archive` capabilities (`{ startNote: true }`). New fields
  must follow the same pattern.
- On the device, `readableRow` in `floatArchiveCore.ts` ignores keys it does
  not know, and `readableArchive` refuses the **whole** archive when one row
  fails. New optional fields are therefore safe for old binaries, and must not
  be added to `readableRow`'s checks (see 2e).
- **The start screen already asks for the float's condition and throws it
  away.** `float-start.tsx` calls `/api/route-estimate` through
  `useStartEstimate` (refreshed every 5 minutes). `estimateRoute` computes the
  condition there: the gauge at or upstream of the put-in (or the GPS start
  mile), escalated by any worse gauge **inside the stretch**, so possibly
  below the put-in. The anchor reading carries `accuracy_warning` (stale or
  suspect) and `reading_age_hours`; an escalating reading may be up to 12 h
  old, past the shared 6 h line in `shared/reading-staleness.ts`. The route
  returns only distance and speed. When the code is `dangerous`, float time is
  withheld (`floatTimeWithholding`), so `plannerMph` is null on exactly the
  floats a high-water rule is about.
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
  file and the link text to the system share sheet). No new native
  dependency. `ChartShareControl` treats **any** `200` `image/png` response as
  the image it asked for.
- Theme: `accent[700]` is 3.16:1 on the dark `card` (`#242423`), and the
  light theme's `accent` role (`accent[500]`) is 2.94:1 on white. Neither
  passes as text on both themes.

## Phase 1a: credited river intervals in the tracker (`packages/eddy-geo`)

River explored needs the river miles the tracker **accepted**, under the same
rules that decide `distanceMiles`. Clamping a first and last mile cannot
recover that.

- Add `coveredMiles?: [number, number][] | null` to `FloatTotals`: a sorted,
  merged list of disjoint river-mile intervals.
- Track the current run's mile range (lowest and highest `riverMile`, starting
  from the run's anchor) beside `runDistanceMiles`. When `closeRun` credits a
  run's distance as moving, add its range. A run classified as a stop adds
  nothing, as it adds no distance.
- When `gapMiles` credits a gap, add `[last, sample]` (in mile order). A gap
  it refuses (too long, too fast, inside the stay radius, or a relocation)
  adds nothing.
- The short unresolved final run is excluded, as `finishFloatTotals` excludes
  its distance.
- Merge only intervals that overlap or touch (`start ≤` the previous `end`).
  Merging across a gap, even one inside `STAY_RADIUS_METERS`, would add river
  nobody was credited for. The strip may draw near segments as one, but that
  is drawing, never arithmetic. Keep at most 32 intervals. Past that, set
  `coveredMiles` to null rather than truncating: no figure is better than a
  wrong one.
- Absent on sessions started by an older build (like `totals` itself). Those
  floats show no river explored.
- `recapFloat` copies `coveredMiles` into `CompletedFloat`.

**Tests**, in `src/lib/float-archive.test.ts` beside the existing
`accumulateFloat` cases: a three-hour gap and a relocation each add **no**
interval, although `last` moves and `lastMile − firstMile` would report river
covered; a credited gap adds one; an out-and-back yields one interval, not
double; a stop's drift adds nothing; overflow gives null.

## Phase 1b: pure logic in `shared/`

New file `missouri-float-planner/shared/float-recap.ts`, consumed by iOS as
`@eddy/conditions/float-recap`. It stays React- and native-free so the web
suite can test it. Add phase 2's optional fields to `CompletedFloat` in
`shared/float-archive.ts` now, as types only, so these functions and their
tests come first.

### Tracking

`floatTracking(trip)` returns `'none' | 'partial' | 'measured'`, decided
before and independently of mood:

- `none`: `firstMile == null`. Eddy never placed the float on the river.
- `partial`: placed, but `unknownMs > 0.5 × elapsedMs`. Most of the session
  was unobserved.
- `measured`: otherwise.

The card, the recap, the mood rules and the share image all read this one
function.

### Conditions at start

`floatCondition(trip)` returns
`{ code, gaugeName, usgsSiteId, heightFt, dischargeCfs, observedAt, current } | null`,
from **one** source per float:

1. `startCondition`, the condition the planner gave this float at Start (2a);
2. otherwise `water`, when it carries a `conditionCode` (the server fallback);
3. otherwise null.

`current` is true only when the reading was at most `STALE_READING_HOURS`
older than `startedAt` (`isReadingStale`) and carried no accuracy warning. It
returns null for a malformed sub-object rather than throwing, because rows on
disk are not checked that deeply (2e).

### Mood rules

`pickFloatMood(trip: CompletedFloat): FloatMood | null`. The rules are checked
top to bottom, and the first match wins. Null means the standard otter and no
mood line.

| # | Result | Rule | Data |
|---|------|------|------|
| 1 | null | `floatTracking` is `none` | exists |
| 2 | `big-water` | condition ∈ {`high`, `dangerous`} and `current` | phase 2 |
| 3 | null | condition ∈ {`high`, `dangerous`}, not `current` | phase 2 |
| 4 | `quick-dip` | `elapsedMs < 10 min` | exists |
| 5 | `rain` | precipitation at start ≥ 0.05 in | phase 2 |
| 6 | `chilly` | air temp at start < 50 °F | phase 2 |
| 7 | `scrape` | condition ∈ {`low`, `too_low`} and `current` | phase 2 |
| 8 | `speed-run` | `measured`, `movingMs ≥ 20 min`, `movingMph ≥ 1.3 × plannerMph` | exists |
| 9 | `lazy-river` | `measured`, and `stoppedMs ≥ 0.4 × elapsedMs` OR (`movingMs ≥ 20 min` and `movingMph ≤ 0.7 × plannerMph`) | exists |
| 10 | `made-it` | `reachedTakeOut` | exists |
| 11 | `good-float` | otherwise | n/a |

Why this order:

- **Nothing measured, no mood.** A float Eddy never placed on the river has
  no distance, speed or position. It keeps its condition badge, but gets the
  standard otter, so a session started beside a high river and never placed
  on it does not get the wave-riding otter either.
- **High water never celebrates.** A float started at High or Flood never gets
  a celebrating otter. Only a current reading earns the Big water mood. A
  stale or suspect high reading, including an escalation from a reading up to
  12 h old, still blocks every mood below it.
- **Quick dip is time only.** A distance test would call a four-hour float
  under weak GPS, or an out-and-back fishing trip, a quick dip.
- **Weather comes before water level.** Rain or cold is what people remember
  about the day, and Low is not a safety state. A cold float on low water gets
  Chilly on purpose.
- **Speed needs enough measured moving time.** One brief usable segment does
  not characterise a mostly untracked afternoon, so the speed rules need a
  `measured` float and 20 minutes of moving time.
- **Speed and Lazy come before Made it!** Most good floats reach the take-out,
  so `made-it` would otherwise swallow them.

Rules 1 to 3 are their own export, `moodGate({ tracking, code, current })`,
which returns `'standard'`, `'big-water'`, or `'open'` (go on to the other
rules). `pickFloatMood` calls it first, and the share route (phase 5) calls
the same function, so the recap and its shared image can never disagree
about the otter.

A rule whose data is missing does not match; it never guesses, so old floats
fall through cleanly. Rules 8 and 9 need both `movingMph` and `plannerMph`,
except for the `stoppedMs` half of rule 9. Keep the thresholds as named
exports (`MOOD_THRESHOLDS`) so they can be tuned in one place.

There is no separate Flood mood. When a `dangerous` reading earns Big water
(tracked, and current), the mood line states the condition plainly ("Flood
stage"), with no editorial line. Otherwise the badge alone carries it.

The mood never replaces the arrival: rain or speed outranks `made-it`, so
`reachedTakeOut` is shown on its own wherever the route is (phase 3, phase 5).

### River explored

The denominator is the **calibrated span** of the route index: the river miles
of the first and last access points `buildRouteIndex` keeps (`index.anchors`,
after it drops inconsistent ones). Inside the span, miles are interpolated
between real access points. Outside it they are extrapolated, which on a river
with editorial miles (`src/lib/geo/mile-index.ts`: Meramec, St. Francis,
Bourbeuse, Niangua) is a guess. `coveredMiles` comes from the same index, so
the figures share one mile system on every river. `rivers.length_miles` is
never used.

`riverExplored(trip)` returns
`{ miles, fraction, segments: { start, end }[] } | null`:

- Clamp each `coveredMiles` interval to `trip.riverSpan` (2b). `miles` is the
  clamped total, `fraction` is `miles / span length`, and `segments` place
  each interval on the strip as fractions.
- Null when `coveredMiles` is missing or null, `riverSpan` is missing, or no
  clamped interval remains. Null hides the strip and the figures.
- Copy leads with miles: "9.6 river miles explored". The percentage is
  secondary: "5% of the Current's float miles", or "Under 1% …" below 1%.
- Explored miles are unique river covered, and distance is what was paddled.
  An out-and-back has more distance than explored miles. The recap labels both
  and never presents one as the other.

`riverLifetimeExplored(trips, riverSlug)` uses one common boundary:

- **Eligible floats** are the completed floats on that river with both
  `riverSpan` and a non-null `coveredMiles`. Others contribute nothing.
- **The boundary** is the `riverSpan` of the eligible float with the latest
  `startedAt`. A newer float without a span cannot supply it, so it never
  leaves the lifetime line without a denominator while older floats have one.
- Merge every eligible float's intervals (overlapping or touching only), then
  clamp the merged list to that boundary, and only then sum and divide. Each
  float's own clamp is to its own span, which can be wider: an older span of
  miles 0–100 and a newer one of 10–90 would otherwise give 100 miles explored
  out of 80.
- No eligible float, no line. A later correction to access-point miles can
  still shift older intervals slightly; the line is a summary, not a survey.

**Tests:** Current (geometric miles) and Meramec (editorial) fixtures built
through `buildRouteIndex`, so the span is the one the device would snapshot.
Cover clamping at both ends, an interval wholly outside the span, missing
`coveredMiles`, intervals a few metres apart staying separate, and overlapping
lifetime intervals. For the lifetime line: a narrower newer span (0–100 then
10–90) never exceeds 100%, and the newest float lacking a span takes the
boundary from the latest one that has it.

### Badge

`floatBadge(trip)` returns `{ code, label, cfsLabel, ftLabel, current } | null`
from `floatCondition`. It uses `CONDITION_SYSTEM` for the label and colours,
and **never hardcodes condition hex** (see the header of `condition-system.ts`).

Tests: `missouri-float-planner/shared/float-recap.test.ts`, registered in the
web `test` script (otherwise `registered-tests.test.ts` fails). Cover every
mood rule; the order (no tracking beats High, High beats Quick dip, Quick dip
beats Rain, Speed beats Made it!); a stale High blocking every mood; the speed
rules refusing a `partial` float or under 20 minutes of moving time;
`moodGate` with tracking `none` and a current High and a current Flood
(standard otter, not Big water), and with `partial` and a current High (Big
water); missing data falling through; the condition source order; malformed
sub-objects (null, not a throw); and the three tracking states.

## Phase 2: record the data the rules need

All new fields are optional on `CompletedFloat` so existing rows stay valid.

### 2a. Conditions at start (required for the badge, Big water and Scrape)

**The condition is the one the planner gave this float at Start.** It is the
code that withheld the float time and the one the paddler saw, it uses the
worst gauge on the stretch rather than one point, and it is frozen into the
float so a recap never changes after backup. Because an escalation can come
from a gauge below the put-in, it is labelled "Conditions at start", never
"water at put-in", with the gauge that set it named beneath.

- **Server: return it.** `/api/route-estimate` gains an optional `condition`
  object:
  `{ code, gaugeName, usgsSiteId, heightFt, dischargeCfs, observedAt, accuracyWarning }`,
  taken from the gauge that set the code: the last `contributingGauges` entry
  with `effect: 'escalated'` if there is one, otherwise `anchorCondition`.
  `usgsSiteId` is null for a gauge that is not a USGS site (dam tailwaters,
  migration 00198), never a reason to drop the condition: tailwaters are
  where float time is withheld and the condition is all the recap has. Do
  not read the merged `condition` object: after an escalation it carries the
  escalated code with the anchor gauge's name and reading. `accuracyWarning`
  is the anchor row's `accuracy_warning`, or, for an escalation, whether its
  reading was past `STALE_READING_HOURS`. Omit the field when the code is
  `unknown`. This is additive: old binaries ignore it, and an old server
  omits it, so the device stores null. Test it in
  `src/lib/calculations/route-estimate.test.ts`: anchor only, escalated, a
  stale escalation, and unknown.
- **Device: capture it.** `fetchFloatStartEstimate` and `useStartEstimate`
  return `condition` beside `speed`, under its own rule
  `currentStartCondition(result, now)` in `src/lib/floatStart.ts`: basis
  `today`, the estimate under 5 minutes old, code not `unknown`. It must not
  reuse `currentMovingSpeed`, which returns null whenever float time is
  withheld, which is always the case at Flood and on dam tailwaters. The
  reading's own age and quality are not judged here: they travel with the
  snapshot, and `floatCondition` decides `current` against `startedAt`.
  `float-start.tsx` passes it to `useStart` next to `plannerMph`. `useStart`
  applies the same quick-start guard as `plannerMph` (the GPS mile still
  within 0.1 mi of the estimated mile), `startSession` stores `startCondition`
  on the session, and `recapFloat` copies it. Test the helper from the web
  suite, beside `float-session.test.ts`.
- **Server fallback** for floats without it (started offline, or the estimate
  failed or went stale): in `waterAtStart`, also select from the same
  `river_gauges` link the threshold columns `computeConditionFromDbRow` reads
  and `flood_stage_ft`, plus `gauge_stations.usgs_site_id` (`water` holds only
  the internal station id today). Compute the code with
  `computeConditionFromDbRow` and `applyFloodStageOverride`, and add
  `conditionCode` and `usgsSiteId` to `water`. `waterAtStart` already skips
  suspect readings and keeps only one within 30 minutes of the start, so it is
  `current` by construction. This is the anchor gauge only, without the
  in-stretch escalation, so the badge names that gauge. Like all of `water`,
  it applies on a float's first upload only.
- **Display.** The recap shows one reading: `floatCondition`'s source; failing
  that, a `water` reading with no condition label (as today's "Water at the
  start" card); failing that, nothing. Never two readings. A reading that is
  not `current` shows its value and age with no condition label or colour:
  a confident chip on a stale reading is the screen arguing with itself.
- **A float can change mood once.** A float with no `startCondition` gets its
  condition when its first backup adds `water.conditionCode`, and never again
  after that.
- **Floats already backed up: no backfill in v1.** They keep today's reading
  without a label, and their moods fall through. Computing the code on read was
  rejected: it would apply today's ladders to an old reading, and ladders are
  recalibrated (`20260803170000_recalibrate_ozark_float_ladders.sql`), so an
  old float's badge and mood would shift under it. If a backfill is wanted
  later, it is a one-time script through `scripts/lib/db.ts`, run as a dry run
  first, and it is a production write the owner authorises. Devices pick it up
  on the next sync.

### 2b. River span (required for river explored)

At start, snapshot the denominator into the session as
`riverSpan: { firstMile, lastMile, firstName, lastName, calibration }`: the
lowest and highest `index.anchors` miles (the index accepts anchors whose
miles run either way along the line, so "first" is the lowest mile, not the
first in line order), with the names of the `route.anchors` at those miles
for the strip labels, and `calibration`, a hash of the river's access-point
ids and miles (`spanCalibration`) naming the mile system. Copy it into
`CompletedFloat`. A snapshot keeps old recaps stable if river data is
corrected later; the calibration lets the lifetime line merge only floats
that share a mile system, since access-point miles do get recalibrated and
intervals from two systems do not lie on one strip.

### 2c. Covered intervals (required for river explored)

`coveredMiles` from phase 1a, copied by `recapFloat`.

### 2d. Weather at start (required for Rain and Chilly)

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

### 2e. Validation, upload and reading back

- **Server schema.** Add the fields to the `completed` schema in
  `validation.ts` as optional, strict sub-objects with bounds:
  - `startCondition`: `code` from `ConditionCode` without `unknown`;
    `gaugeName` (the existing `name`); `usgsSiteId` (the existing `id`);
    `heightFt` finite, −50 to 200, nullable; `dischargeCfs` finite, 0 to
    2,000,000, nullable; `observedAt` an ISO datetime; `accuracyWarning`
    boolean.
  - `riverSpan`: `firstMile` and `lastMile` as the existing `mile`, non-null,
    with `lastMile > firstMile`; `firstName` and `lastName` as `name`.
  - `coveredMiles`: null, or at most 32 `[start, end]` pairs of the existing
    `mile`, each with `start < end`, sorted and disjoint.
  - `startWeather`: `tempF` −60 to 140; `precipIn1h` 0 to 10; `observedAt` an
    ISO datetime.
- **One capability.** `GET /api/me/float-archive?capabilities=1` adds
  `recapContext: true`, covering all four fields. Today `uploadFloatArchive`
  asks only when a row carries `startNote`, and caches only a positive
  `startNote` answer. Generalise it: work out the flags this batch needs
  (`startNote`, `recapContext`), require each, and cache an answer that has
  them. Extend `float-archive.test.ts` for a batch that needs only
  `recapContext`. **Deploy the web first.**
- **Reading on the device.** Do **not** add the new fields to `readableRow`.
  `readableArchive` refuses the whole archive when one row fails, so a strict
  check would turn one malformed field into an unreadable history. The phase 1b
  readers return null for a malformed sub-object instead.

## Phase 3: UI

### Before starting

Export the mockup boards into `design/float-history-card/`, covering a long
route name, the missing-data states (no condition, a reading that is not
current, tracking `none` and `partial`), dark mode, and the largest Dynamic
Type size. The layout below is written against those states.

### History card (`floats.tsx`)

Extract the inline row into `eddy-ios/src/float/FloatHistoryCard.tsx`. The
river is the card's identity; the otter and mood are secondary.

- **Title:** the river.
- **Route:** "Put-in → Take-out". With no put-in, "To <take-out>", plus a
  muted "Started on the water" line only when a river position was confirmed
  (tracking is not `none`); an untracked session gets no such line. This
  replaces the repeated "On-river start →".
- **Date**, then **stretch · duration** in Geist Mono: the river miles
  explored ("9.6 river mi"), never a distance "paddled", and the recorded
  duration as it is ("6 min", "4h 12m"), never a band like "Under 10 min".
  Distance is gross and includes credited gaps nobody observed; the stretch
  the paddler took is what matters. Only a float whose credited river cannot
  be placed (an older build, too many intervals, no span) falls back to its
  tracked distance, named "Tracked distance" (`floatStretch`).
- **Tracking:** with `none`, the stretch is replaced by "GPS tracking
  unavailable", never "0.0 mi". With `partial`, the stretch carries "Limited
  GPS tracking": an unobserved interval is not always lost signal.
- **Condition badge:** a straight, flat badge (condition ink on its tint),
  label and cfs. Hidden when there is no condition. A reading that is not
  current shows no badge on the card; the recap explains it.
- **Otter:** small, about 40pt, beside the text, not a hero tile. The mood
  line sits under the title in a theme text role (`textMuted`), never a fixed
  accent step (see *What the code does today*, Theme).
- **Share button:** 44 × 44, `accessibilityLabel="Share this float"`, on every
  card that can produce an image, Flood included.

Accessibility: the card's `accessibilityLabel` reads the content in order, for
example "Current River. Akers Ferry to Pulltite. October 26. 9.6 river miles,
4 hours 12 minutes. Flowing, 412 cfs." The badge and otter are decorative
(`accessibilityElementsHidden`), as `Otter` already is. At the largest Dynamic
Type sizes the stats wrap below the title rather than truncating it.

### Recap (`FloatRecap.tsx`)

- **Hero:** the mood sticker at about 150pt, the mood line in `text`, the
  river, the route, the date and the boat. The standard otter when the mood is
  null.
- **Arrival:** keep the existing line, worded as what was confirmed: "Reached
  Pulltite" or "Arrival at Pulltite not confirmed". The mood never stands in
  for it.
- **Conditions at start card:** the badge, then the name of the gauge that set
  it and the reading's age relative to the start. No sentence that repeats the
  badge. The USGS station id goes in the card's info tip (`FloatInfoTip`), not
  the line. A reading that is not current shows its value and age without a
  condition label. It replaces the current "Water at the start" card and shows
  the one reading 2a chooses.
- **River explored card**, only when `riverExplored` is not null: "9.6 river
  miles explored" first, then the percentage of the river's float miles, the
  strip with the first and last access names at its ends, earlier floats on
  this river shaded on it, and one lifetime line from `riverLifetimeExplored`
  ("33.4 of the Current's 134 float miles explored"). Lifetime counts the
  floats in this phone's history only.
- **Keep the existing stats and the time breakdown.**
- **Actions:** one primary "Share float" button (teal CTA per ADR 0007), "Your
  float history" demoted to secondary, and Delete unchanged. No second share
  action in the header.

Dark mode: use theme roles for the card surfaces and the condition chip roles
for the badge (`conditions.ts`), with neutral charcoal per ADR 0016. Check the
badge's tint and ink on both `card` and `cardRaised` in dark mode.

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
art is not a blocker; until a sticker exists, its mood uses the stand-in the
design's mood board names (`design/float-history-card/README.md`). Big water's
stand-in is the cautious high-water otter, never a celebrating one. The nine
moods use eight stickers, about 154 KB at 300px.

## Phase 5: share

Follow ADR 0015's pattern: stateless, server-rendered, with no account data
stored.

- **Route:** `GET /api/share/float/image?v=1&…`, rendering 1080 × 1920 PNG
  through `next/og`.
- **Query:** river slug, put-in id (optional: a float can start on the water)
  and take-out id, date (no time of day), mood, `reachedTakeOut`, tracking
  state, condition code and whether its reading was current, cfs and the
  USGS gauge that set it, duration, and explored miles and percentage (only
  when river explored exists). No distance: the image shows the stretch the
  float took, as the card does. Validate every field with a strict schema.
- **The stamp is verified, not trusted.** Anyone can build the query, and
  the stamp is Eddy's condition language, so the server checks the named
  gauge is the river's and that one of its recorded readings for that day
  rates as the claimed code at the claimed cfs (`float-share/verify.ts`)
  before drawing it. Unverified: drawn without the stamp and without a water
  mood, never refused. ADR 0015 records the rule.
- **Invalid input is an error, not a picture.** Return `400` with a JSON
  error for any invalid or inconsistent field, never a generic image:
  `ChartShareControl` treats any `200` PNG as the image it asked for, so a
  fallback would be shared as if it were the float. The device reports a
  failure to prepare the image. The link it shares is the river's own page,
  whose link preview already has its own image; this route never serves
  previews.
- **Names:** the server resolves names from ids. Free text from the client is
  never drawn, which closes the route off as a way to render arbitrary text.
- **Planned route versus confirmed arrival.** The image shows the route and,
  separately, "Reached <take-out>" or "Arrival not confirmed". Tracking
  `none` shows the duration and "GPS tracking unavailable", as the card does.
- **The otter is decided by the same rule as the recap.** Anyone can call the
  route with any query, so the server does not trust the client's mood. It
  calls `moodGate` with the tracking state, condition code and `current`
  flag from the query: `'standard'` draws the standard otter and
  `'big-water'` the Big water art, whatever mood the client sent; only
  `'open'` lets the client's mood through. Tracking `none` therefore gets the
  standard otter even at a current High or Flood, as in the recap. Flood
  floats can be shared; the image states the condition plainly. Test the
  route with tracking `none` and a current High and Flood.
- **What it never includes:** start and end times, the GPS track, the account,
  or `startNote`. The shared file is named by the day, never by the session
  id, which encodes the start time.
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
influencers to post. Both build on `riverLifetimeExplored` from phase 1b.

## Order and validation

| Step | Ships | Validate with |
|------|-------|---------------|
| 1a. `coveredMiles` in `@eddy/geo` + tests | web + iOS bundle | `make check-web` + `make bundle-mobile` |
| 1b. `shared/float-recap.ts` + types + tests | web + iOS bundle | `make check-web` + `make bundle-mobile` |
| 2a server: route-estimate `condition`, `water.conditionCode` | web | `make check-web` (`route-estimate.test.ts`; `float-archive.test.ts` with an injected `lookupWater`) |
| 2a–e client fields, schema and capability | web first, then iOS | `make check-web` + `make check-mobile` + `make bundle-mobile` |
| Mockup exports in `design/float-history-card/` | n/a | the states listed in phase 3 |
| 3. card + recap UI | iOS (OTA-eligible) | the above, plus device check in light, dark, Increase Contrast and the largest Dynamic Type size |
| 4. art | iOS | icon build script, PNG budget |
| 5. share route + control | web first, then iOS | `make check`; share sheet on a device, including an invalid request reporting a failure |

Describe status in the three states from the root guide: **implemented**,
**device-verified**, **released**.

## Open questions

1. The thresholds are starting guesses: 10 min (Quick dip), 0.05 in (Rain),
   50 °F (Chilly), 1.3× and 0.7× (speed), 40% stopped, 20 min of moving time,
   50% unobserved (`partial`), and 32 intervals. After phase 2, run
   `floatTracking` and `pickFloatMood` over real archive rows (read-only,
   through the guarded client in `scripts/lib/db.ts`) and tune the rule
   frequencies before release.

Settled here, for the record: the condition source, its freshness and its
fallback (2a); no backfill of floats already backed up (2a); river explored
from credited intervals over the calibrated span (phase 1a, 1b); no separate
Flood mood, and Flood floats can be shared (phase 1b, phase 5).
