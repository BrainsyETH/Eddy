# Float history card: condition stamp, river completed, otter moods, share

Status: plan. Nothing here is implemented yet.

Design mockup (private canvas, owner access): the "Float History Card" canvas
has four boards: the history list, the float recap, the 9:16 share image and
the otter mood sheet. Art prompts for the new moods are in
`design/eddy-emoji/float-mood-otters.md`.

## Goal

The history card and the recap read like a fitness log today: river, route,
date, minutes, miles. Most test entries show `0.0 mi tracked` and "Ended before
arrival was confirmed", which reads as an error. This plan makes each saved
float record **what the water was doing** and gives it Eddy's personality:

1. **Condition stamp.** The condition and flow at put-in, in the condition's
   own colours (`CONDITION_SYSTEM`), on the card and the recap. The recap also
   names the gauge and the reading's age.
2. **River completed.** The stretch floated as a share of the whole river
   ("5% of the Current"), drawn on a strip of the river from headwaters to
   mouth. Designed to grow into a lifetime total per river later.
3. **Otter moods.** One mood per float, chosen by ordered rules, drawn in the
   existing Eddy sticker style.
4. **Share.** A share action on each card and on the recap. It sends a
   server-rendered 9:16 image plus a link back to eddy.guide.

Out of scope for v1: Eddy Says one-liners on recaps, the river passport, and
lifetime coverage UI beyond one line on the recap (see phase 6).

## What the code does today

- `eddy-ios/src/lib/floatRecap.ts` builds `CompletedFloat` on the device from
  the session. It records `firstMile`, `lastMile`, `plannerMph`, the time split
  and `reachedTakeOut`. It records **no condition and no weather.**
- `missouri-float-planner/src/lib/float-archive/water.ts` adds `water` (gauge
  name, station id, observed time, ft, cfs) **on the server, on account
  backup only.** Guests never get it, and a backed-up float only gets it after
  the next sync. `floatArchiveUpload.ts` strips `water` before upload.
- `float-archive/validation.ts` is `.strict()`. An older server rejects any
  new client field, which is why `startNote` is gated behind
  `GET /api/me/float-archive` capabilities (`{ startNote: true }`). New fields
  must follow the same pattern.
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
suite can test it.

### Mood rules

`pickFloatMood(trip: CompletedFloat): FloatMood`. The rules are checked top to
bottom, and the first match wins.

| # | Mood | Rule | Data |
|---|------|------|------|
| 1 | `big-water` | start condition ∈ {`high`, `dangerous`} | phase 2 |
| 2 | `quick-dip` | `distanceMiles < 0.25` OR `elapsedMs < 10 min` | exists |
| 3 | `rain` | precipitation at start ≥ 0.05 in | phase 2 |
| 4 | `chilly` | air temp at start < 50 °F | phase 2 |
| 5 | `scrape` | start condition ∈ {`low`, `too_low`} | phase 2 |
| 6 | `speed-run` | `movingMph ≥ 1.3 × plannerMph` | exists |
| 7 | `lazy-river` | `stoppedMs ≥ 0.4 × elapsedMs` OR `movingMph ≤ 0.7 × plannerMph` | exists |
| 8 | `made-it` | `reachedTakeOut` | exists |
| 9 | `good-float` | otherwise | n/a |

Why this order:

- **Safety comes first.** A float started at High or Flood never gets a
  celebrating otter, however it went.
- **Quick dip cuts off everything below it.** On a few minutes of tracking,
  speed and break ratios are noise. It sits below Big water so high water
  still gets the cautious otter.
- **Weather comes before water level.** Rain or cold is what people remember
  about the day.
- **Speed and Lazy come before Made it!** Most good floats reach the take-out,
  so `made-it` would otherwise swallow them.

Rules 6 and 7 apply only when both `movingMph` and `plannerMph` are non-null,
except for the `stoppedMs` half of rule 7. **A rule whose data is missing does
not match.** It never guesses, so old floats fall through cleanly. Keep the
thresholds as named exports (`MOOD_THRESHOLDS`) so they can be tuned in one
place.

Open decision: should `dangerous` (Flood) get its own mood with a plain
"Flood stage · glad you're off the water" line and **no share action**? The
recommendation is yes; it reuses the `big-water` art with different copy.

### River completed

`riverCoverage(trip, riverLengthMiles)` returns
`{ fraction, startFraction, endFraction } | null`.

- `fraction = (lastMile − firstMile) / riverLengthMiles`, clamped to 0–1.
  It returns null when any input is missing, or when `lastMile ≤ firstMile`.
- The strip position uses `startFraction = firstMile / riverLengthMiles`.
- Copy: `percentLabel(fraction, riverName)` gives "5% of the Current". Under
  1% it reads "Under 1% of the Current"; with no coverage it reads "Barely got
  wet".

**Risk: the two kinds of mile.** `src/lib/geo/mile-index.ts` documents that
some rivers carry editorial miles that diverge from geometry miles (Meramec,
St. Francis, Bourbeuse, Niangua). Then `rivers.length_miles` (geometry) and
`firstMile`/`lastMile` (route index) are not the same unit.

- **v1:** use the length of the route index's own mile range (the river's last
  editorial mile minus its first) as the denominator, captured at start with
  the route. Numerator and denominator then share one mile system on every
  river.
- **Test:** pin the Meramec and the Current, one editorial and one geometric
  river, with fixtures.
- **Fallback:** if the route index cannot supply the whole river's range, fall
  back to `length_miles` only for rivers whose miles are geometric, and show no
  percentage otherwise.

### Condition stamp

`floatStamp(trip)` returns `{ code, label, cfsLabel, ftLabel } | null`. It
uses `CONDITION_SYSTEM` for the label and colours, and **never hardcodes
condition hex** (see the header of `condition-system.ts`).

Tests: `missouri-float-planner/shared/float-recap.test.ts`, registered in the
web `test` script (otherwise `registered-tests.test.ts` fails). Cover every
mood rule, the order (Flood beats Quick dip, Quick dip beats Rain, Speed beats
Made it!), missing-data fallthrough, and the coverage edge cases.

## Phase 2: record the data the rules need

All new fields are optional on `CompletedFloat` so existing rows stay valid.

### 2a. Condition at start (required for the stamp, Big water and Scrape)

- **Server.** In `waterAtStart`, also select the `river_gauges` threshold
  columns. Compute the code with `computeConditionFromDbRow` and
  `applyFloodStageOverride`, the same single source of truth as
  `/api/plan` and `/api/conditions`. Add `conditionCode` to `water`. No
  client change is needed, and backed-up floats gain it on their next sync.
- **Device, for guests and before sync.** At start, `useStart.ts` already has
  the route loaded. Capture the condition code the start screen shows into the
  session (`startCondition: { code, cfs, ft, gaugeName, observedAt } | null`),
  and copy it into `CompletedFloat` in `recapFloat`.
- **Precedence.** Show the server `water` when present; otherwise show
  `startCondition`.
- **Validation and upload.** Add `startCondition` to `validation.ts` as an
  optional, strict sub-object. Gate it behind a new capability flag
  (`startCondition: true`) in `GET /api/me/float-archive`, exactly as
  `uploadFloatArchive` gates `startNote`. Deploy the web first.

### 2b. River length (required for river completed)

Snapshot the denominator from phase 1 into the session at start as
`riverMiles: { first, last }`. Copy it into `CompletedFloat`, and validate and
gate it with the same capability. A snapshot keeps old recaps stable if river
data is corrected later.

### 2c. Weather at start (required for Rain and Chilly)

- At start, best-effort and non-blocking: call the existing
  `/api/weather/forecast` (OpenWeather) with the start fix. Store
  `startWeather: { tempF, precipIn1h, observedAt } | null`. **Never block or
  delay the start on this call.**
- **Privacy.** Store only the values, never the coordinates. The request is
  already covered by the Sentry scrubber in `shared/float-search-privacy.ts`.
- **Limitation.** This captures rain at put-in, not rain during the float. v1
  accepts that. A later version can take a second reading at finish and use
  the maximum of the two.
- Validate and gate it with the same capability as 2a.

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
  breaking out of the top edge.
- **Mood headline** in Fredoka, using `accent[700]` for contrast, not
  `accent[500]`. Below it, stats in Geist Mono: "9.8 mi · 4h 12m · 2.3 mph".
- **Quick dip** shows "Under a minute on the water" or "Under 10 min on the
  water" instead of zeros.
- **River strip:** an 8pt track with the floated segment (minimum 8pt wide),
  plus the percentage label and the mile range.
- **Share button:** 44 × 44, `accessibilityLabel="Share this float"`. Hidden
  for Flood if the open decision above lands that way.

Accessibility: the card's `accessibilityLabel` should read the content in
order, for example "Current River, Oct 26. Akers Ferry to Pulltite. Flowing,
412 cfs. Made it. 9.8 miles, 4 hours 12 minutes. 5% of the Current." The
stamp and otter are decorative (`accessibilityElementsHidden`), as `Otter`
already is.

### Recap (`FloatRecap.tsx`)

- **Hero:** the mood sticker at about 150pt breaking out of a condition-tinted
  panel, the mood headline, the river, the route, the date and the boat.
- **Stamp card:** stamp plus a plain sentence about the water at put-in,
  "<gauge name> · USGS <id>", and the reading's time relative to the start.
  This replaces the current "Water at the start" card.
- **River completed card:** the large percentage, the strip with headwaters
  and mouth labels, the mile range, and one lifetime line (phase 6).
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
- **Query:** river slug, put-in and take-out ids, date (no time of day), mood,
  condition code, cfs, distance, duration and coverage. Validate every field
  with a strict schema. On an invalid field, render a generic Eddy card; never
  echo raw text.
- **Names:** the server resolves names from ids. Free text from the client is
  never drawn, which closes the route off as a way to render arbitrary text.
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

## Phase 6 (later): lifetime coverage

`riverLifetimeCoverage(trips, riverSlug)` merges the `[firstMile, lastMile]`
intervals and divides by the river's mile range. It is pure and goes in
`shared/float-recap.ts`. v1 shows a single recap line ("You've floated 33.4 of
the Current's 184 mi") and the earlier-floats shading on the strip. Later
steps: a river passport (stamps per river), and an "X of N Ozark rivers" stat
for influencers to post.

## Order and validation

| Step | Ships | Validate with |
|------|-------|---------------|
| 1. `shared/float-recap.ts` + tests | web + iOS bundle | `make check-web` + `make bundle-mobile` |
| 2a server `conditionCode` | web | `make check-web`; dry run `writeArchiveBatch` with fixtures |
| 2a–c client fields + capability | web first, then iOS | `make check-web` + `make check-mobile` + `make bundle-mobile` |
| 3. card + recap UI | iOS (OTA-eligible) | the above, plus device check in light, dark and Increase Contrast |
| 4. art | iOS | icon build script, PNG budget |
| 5. share route + control | web first, then iOS | `make check`; share sheet on a device |

Describe status in the three states from the root guide: **implemented**,
**device-verified**, **released**.

## Open questions

1. Does Flood get its own mood with no share action? (Recommended: yes.)
2. The thresholds (0.25 mi, 10 min, 0.05 in, 50 °F, 1.3×, 0.7×, 40%) are
   starting guesses. After phase 2, run `pickFloatMood` over real archive rows
   (read-only, through the guarded client in `scripts/lib/db.ts`) and tune the
   rule frequencies before release.
3. Should the river strip use the route index's mile range everywhere, or
   `length_miles` where miles are geometric? Decide when writing the phase 1
   tests.
4. Should old floats, recorded before phase 2, be backfilled with the
   condition code? The server could compute it from stored `water` cfs/ft on
   read. Without a backfill they show no stamp, and their moods fall through.
