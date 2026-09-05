# Eddy iOS — UI/UX review from the seat of a floater and angler

**Date:** 2026-09-05
**Scope:** the whole `eddy-ios/` app — Today, Map, Alerts, Favorites, Profile, and the
river, gauge, dam, access-point, plan, and saved-float screens, plus the theme system.
**Method:** every finding below is grounded in code that was read, cited as `path:line`
relative to the repo root. Contrast ratios were computed (WCAG 2.x relative luminance,
tints composited over the actual card colours from `eddy-ios/src/theme/palette.ts`), not
eyeballed. Where a finding needs a phone to be certain, it says **worth testing on device**.

**Persona held throughout:** an Ozarks smallmouth and trout angler who floats the
Current, Jacks Fork, Eleven Point, Meramec, Big Piney and North Fork, wades and floats
the tailwaters below Table Rock, Bull Shoals and Norfork, reads USGS gauges every
morning in both feet and cfs, and uses the app one-handed — at 5 a.m. in a dark truck,
at a gravel-bar put-in in sun glare, and on one bar of LTE.

Related, not repeated here: `docs/IOS_UX_FLOW_REVIEW_2026-08-27.md` (flow-breaking bugs
after the August branches) and `docs/INTERFACE_CRAFT_REVIEW_2026-09-05.md` (motion,
haptics, design-system drift). Where this review lands on the same thing it says so and
moves on.

---

## The verdict in one paragraph

This is an unusually honest app. It refuses to colour a reading it cannot trust, keeps
"observed" and "scheduled" apart on dams, never converts feet to cfs, asks for no
permission until a tap needs it, and opens on cached data at the put-in. Those are the
hard things and they are done. What lets the persona down is mostly the **last inch of
presentation**: the verdict is colour-only on the map and a 12pt word on the lists; every
condition chip in the app is unreadable in dark mode; the number an angler wants second
(rising or falling) is missing from the gauge card; the dam screen buries "generating
now" under a percentage; the float planner explains none of its assumptions and refuses
to estimate on the tailwaters this persona floats most; and the whole app is silent to
the hand — no haptics anywhere. None of these are architectural. Most are a day each.

---

## The ten to fix first

Ranked by (how badly it hurts the persona) × (how cheap it is).

| # | Finding | Where | Severity |
| --- | --- | --- | --- |
| 1 | **Condition chips are unreadable in dark mode (≈1.1–1.6:1).** `conditionInk()` is the light-scheme ink and is used unguarded on tinted chips in 15 files; `conditionText(code, isDark)` exists and is used in only 13 places. | `eddy-ios/app/river/[slug].tsx:1324` chip, `app/gauge/[siteId].tsx:610`, `src/components/FavoriteRiverCard.tsx:176`, `map-sheet/RiverHead.tsx:152`, `river/RiverReaches.tsx:113`, `EddyTake.tsx:425`, `app/river/[slug]/access/[accessSlug].tsx:313-322`, `app/(tabs)/alerts.tsx:846`, and more | High |
| 2 | **A stale gauge reading still wears a present-tense verdict.** The gauge screen prints "Good - Floatable" with a green number and a happy otter three days after the station went quiet; only the NWS line on the same card withholds. | `app/gauge/[siteId].tsx:411-414, :436-438, :611` | High |
| 3 | **The map's answer is colour-only and the key is two taps deep behind an ⓘ.** Seven hues, three of which collapse for deutan readers, on a 2.5px line over a green/tan basemap. | `eddy-ios/src/map/layers.ts:577-586`, `src/map/RiverMap.tsx:1608-1612, 2565-2584`, `app/(tabs)/index.tsx:2818-2828` | High |
| 4 | **Trend is missing from the gauge reading card.** Rising/falling appears only as a grey 12px pill in the chart title, only after history loads, only on 24h/7d. On weak signal it appears nowhere. | `app/gauge/[siteId].tsx:568-624`, `src/components/GaugeChart.tsx:416-423, :913` | High |
| 5 | **"Generating now" is the smallest text on the dam hero and the icon never changes.** 11pt caps under a same-teal `flash` icon whether units are on or off; the headline is "72% of full generation". No visible "about 6 of 8 units" for sighted users. | `src/components/dam/DamGenerationHero.tsx:135, 151-152, 230, 266-277` | High |
| 6 | **Quiet hours silently discard an overnight "dropped below X" forever, and the app promises a feed that no longer exists.** Server suppresses without re-firing; crossing state advances; the "Alerts feed" the copy points at was replaced by a high-water-only snapshot. | `app/alerts/quiet-hours.tsx:324-329`, `src/lib/notificationCopy.ts:35,38`, `missouri-float-planner/src/lib/alerts/quiet-hours.ts:23-29`, `gauge-delivery.ts:238-243`, `app/(tabs)/alerts.tsx:33-51` | High |
| 7 | **The Alerts tab says "watching" on phones iOS will never deliver to.** No banner for denied/opted-out/unregistered push; rows read "Never sent · watching since June" regardless. | `app/(tabs)/alerts.tsx` (no `usePush`), `src/lib/alertCopy.ts:71-74`, `src/hooks/useAlertGate.ts:105` | High |
| 8 | **The float time explains nothing and has no fishing pace; too-low water silently doubles it; tailwaters get no estimate at all.** | `src/components/PlanResult.tsx:132-183`, `missouri-float-planner/shared/float-time-format.ts:146-148`, `missouri-float-planner/src/lib/calculations/floatTime.ts:34, 96-99, 143-144, 172-178` | High |
| 9 | **Directions can route a trailer to the waterline without saying so.** When no driving coordinate exists the button silently targets the water; the seeded state withholds the button for exactly this reason, the loaded state does not. | `app/river/[slug]/access/[accessSlug].tsx:20-23, 122-126, 139-152, 648-663` | High |
| 10 | **No haptics anywhere.** `expo-haptics` is not a dependency; zero call sites. Star, bell, sheet detents, layer toggles, swipe-to-remove, put-in selection — all silent. (Also §3.2 of the Interface Craft review.) | `eddy-ios/package.json` | Medium, cheap |

---

## 1. Cross-cutting findings

These apply to every surface and are worth fixing once, in the theme.

### 1.1 Dark mode: the verdict chip pattern is broken app-wide — **High**

`missouri-float-planner/shared/condition-system.ts:70-161` defines each condition with a
`solid`, a translucent `bg`, and an 800-level `ink` chosen for white. In dark mode the
card is `primary[900]` `#0F2D35` (`palette.ts:268`). Composited:

| Code | ink on tint, light card | ink on tint, dark card | `solid` on dark card |
| --- | --- | --- | --- |
| dangerous | 6.8 | **1.6** | 3.9 |
| flowing | 6.6 | **1.5** | 5.7 |
| good | 6.4 | **1.5** | 7.3 |
| high | 6.0 | **1.5** | 5.2 |
| low | 6.2 | **1.6** | 7.6 |
| too_low | 8.5 | **1.2** | 3.0 |
| unknown | 9.1 | **1.1** | 5.7 |

`conditionText(code, isDark)` in `eddy-ios/src/theme/conditions.ts` already solves this
for plain text and is used by `RiverRow`. Nothing solves it for chips. Because the theme
follows the system (`ThemeProvider.tsx:21-24`) and the persona launches at dawn, this is
the first thing many users see.

**Fix:** add `conditionChipInk(code, isDark)` returning `ink` on light and `solid` on dark
(with a 300-level shade for `dangerous` and `too_low`, whose solids only reach 3.9 and
3.0), migrate every `conditionInk(` call on a tinted background, and add a test in the
web suite that composites each ink over its tint on both card colours and asserts 4.5:1.
The same test would have caught `PlanResult.tsx:176` and `FirstRunPicker.tsx:420`, which
paint `conditionColor` (the solid) as text on a white card at 1.9–2.8:1.

### 1.2 The verdict word is 12pt on every list row — **Medium**

`RiverRow.tsx` puts the condition word in `t.xs` semibold (12pt) beside a 16pt name; the
4pt stripe and the reading's ink carry the rest. In sun glare, and for anyone who cannot
separate lime from yellow, the 12pt word is the only unambiguous carrier and it is the
smallest text on the row. Same size on `FavoriteRiverCard`, the map heads, and the access
screen chips.

**Fix:** verdict word at `t.sm` (14pt) minimum; on Favorites, where the whole point is
glanceability, `t.base`.

### 1.3 Muted text in light mode sits just under AA — **Medium**

`textSubtle` light = `neutral[500]` `#857D70`: **4.07:1 on white, 3.76:1 on the canvas**.
It carries 12pt content that matters — "Updated 3 days ago", "Mile 47.2 · Boat ramp ·
Private", the dam safety footer, chart axis labels, ReadingScale end labels. `warm`
`#B89D72` (the filled star, and the text of "Unmaintained gravel"/"4WD required" chips on
the access screen) is **2.59:1** on white. Light `error` `#DC2626` on the canvas is
4.47:1 at 14pt for the safety disclaimer.

**Fix:** move reading-age and provenance lines to `textMuted` (5.9:1); add a `warmInk`
role (a 700-level tan) for text and keep `warm` for borders and fills; light `error` to
red-700 `#B91C1C`.

### 1.4 Dynamic Type is unmanaged — **Medium, worth testing on device**

There is no `maxFontSizeMultiplier` anywhere and one `allowFontScaling={false}`
(`CampgroundAvailability.tsx:188`). Meanwhile `numberOfLines={1}` appears 111 times,
including on the gauge headline number (`app/gauge/[siteId].tsx:574-583`), plan
breadcrumbs and Save/Share buttons (`PlanSheet.tsx:271, 297, 428`), and the 42pt-tall
search field (`SearchBar.tsx:90`). At AX3 and above the number that is the product will
ellipsize. The onboarding legal pane is a centred non-scrolling `View`
(`OnboardingGate.tsx:127-160`).

**Fix:** `adjustsFontSizeToFit` with `minimumFontScale={0.7}` on the mono readings only;
drop `numberOfLines` from button text; let crumbs wrap; wrap the legal pane in a
`ScrollView`; test onboarding, access chips, and the gauge card at AX3.

### 1.5 No haptics — **Medium, cheap**

Already argued in `INTERFACE_CRAFT_REVIEW_2026-09-05.md` §3.2. From the persona's seat the
three that matter most: a light impact when the map sheet settles on a detent, a selection
tick on star/bell/layer toggles, and a warning on "Remove" (which today has no undo and
no confirmation — §5.4).

### 1.6 Touch targets under 44pt — **Medium**

Confirmed from style values: layer tier chips 32pt (`MapLayersSheet.tsx:576-587`);
comparator, unit, and mode chips ≈33pt (`app/alerts/configure.tsx:823`,
`app/alerts/[id].tsx:610`); the 48 quiet-hours hour chips (`quiet-hours.tsx:412`);
feedback type chips (`FeedbackSheet.tsx:595`); the access screen's "Something here out of
date?" is a bare 12pt line with no `hitSlop` (`[accessSlug].tsx:1002-1014`); dam-row and
search-clear targets land at 39–42pt. `FilterChips` already fixed this
(`FilterChips.tsx:146`) — apply the same `minHeight: 44`.

### 1.7 Copy vocabulary drift

- Five phrasings for "not generating": "Idle" (`DamRow.tsx:118`), "Not generating"
  (`DamStateCard.tsx:371`), "Units idle" (`damCatalog.ts:214`), "No turbine generation
  observed" (`shared/dam-generation.ts:269`), "Scheduled off now" (`DayBars.tsx:440`).
- Two alert-latency promises: "up to about an hour" (`profile.tsx:793-795`) vs "roughly
  20–75 minutes" (`PushPrimer.tsx:103-104`).
- "cfs" is never expanded anywhere; "stage" appears as a filter chip
  (`GaugeFilterBar.tsx:169-170`). The persona knows "feet at the gauge".
- The safety disclaimer says "check with local authorities" (`safetyCopy.ts:1-2`). A
  floater calls the outfitter or the park, not the sheriff.
- "Flowing" outranks "Good - Floatable" on the ladder (`condition-system.ts:92,106`) and
  nothing on the phone explains that ordering.

---

## 2. Today tab (`app/(tabs)/reports.tsx`)

**How it feels.** The right screen to open on. Headline count, Eddy's paragraph, a
sensible default order, filters that are questions, and the whole list works offline with
an honest "Offline — showing the last conditions Eddy saw". The engineering notes in the
file show almost every UX regression here was caught and reversed; what remains is
presentation.

- **Medium — The verdict is a 12pt word.** See §1.2. The row leads with the name; the
  answer trails it in the smallest type on the row (`RiverRow.tsx`, `conditionWord: t.xs`).
- **Medium — Nothing on the row tells a fisherman about clarity or temperature.** The
  row shows stage/flow, trend, and age. Water temperature is on the wire for stations
  that publish it (`gaugeSeed.ts:117`, served by `api/gauges/[siteId]/route.ts:178-184`)
  and appears nowhere on Today or Favorites. Turbidity is not modelled at all. For a
  smallmouth angler "is it clear enough to fish" is the question after "is it floatable".
  Worth a data-model note even if the answer is "not yet".
- **Low — "Near me" measures to the gauge, not the put-in.** The note says so honestly.
  For the persona the number that matters is the drive to the nearest access; the access
  points do carry coordinates. Consider distance to the nearest access point when the
  river's points are cached (they are, via the launch bundle).
- **Low — The back fallback lands on Map, not Today.** `nav.ts` `goBack` replaces to `/`
  (the Map tab) when the stack is empty, although the app launches on Today. Already
  noted as 3.6 in the August flow review.
- **Done well:** local search and filter (no round trip), the seeded "Loading
  conditions…" strip instead of a screen of "unknown", chip counts off the unfiltered
  set, the sort menu spelled out in words, and the location-denied line that opens
  Settings.

---

## 3. River screen (`app/river/[slug].tsx`)

**How it feels.** The best single screen in the app for a floater: gauge picker on top,
verdict chip with the otter, reading, scale, trend, hydrograph with NWS stages, Eddy's
take, then hazards (never fully hidden), access points, campgrounds, outfitters. The order
argues its case well.

- **High — Dark-mode chip.** `styles.conditionChipText` uses `conditionInk(shownCode)`
  on `conditionBg(shownCode)` over the dark card — §1.1. The one chip on the screen that
  says "Do Not Float" is the one that vanishes.
- **High — No way into the float planner from here.** `PlanSheet` is mounted only by the
  Map tab (`app/(tabs)/index.tsx`). The natural path — Favorites → river → "looks good,
  plan it" — dead-ends; the user backs out to Map, taps "Plan a float", and re-picks the
  river. Add "Plan a float on the {name}" as a button beside the bell that routes to `/`
  with a `planRiver` param the map consumes the way it consumes `focusAccess`
  (`index.tsx:1435`).
- **Medium — The one-tap bell subscribes to safety only.** "Alert me about this river"
  means high/flood (`BELL_KIND = 'safety'`, line 146). The persona's number-one ask —
  "tell me when it's back in shape after rain" — is behind "Or set your own level" and a
  form. Offer a second one-tap: "Tell me when it's floatable again" (`kind: floatable`).
- **Medium — Two mileage references.** Hazards say "Mile 42", access rows say "Mile
  38.1", and nothing says from where. The persona thinks in "below Akers", not river
  miles from the mouth. Print "RM 42" with a one-time tooltip, or "Mile 42 · below
  Pulltite" using the nearest upstream access.
- **Low — Tailwater rivers wear `unknown` grey on the row and stripe.** Already the
  subject of 3.13 in the August flow review; the `damControlledLabel` word fixes the
  list, not the colour.
- **Done well:** hazards collapsed but never silent (count and severity dots in the
  header), "Last known:" prefix on cached verdicts, the accuracy caveat, `AccessRow`
  as a destination with directions as a sibling control, and the "Didn't match the
  river? Tell Eddy" recalibration path directly under the disclaimer.

---

## 4. Gauge screen (`app/gauge/[siteId].tsx`, `GaugeChart.tsx`)

**How it feels.** Number first, big, mono, verdict chip beside it — right. But it shows
one unit when the angler thinks in two, trend is not on the card, a dead station still
claims "Floatable", and "Provisional USGS data" is painted in the error colour on nearly
every USGS gauge, so red stops meaning anything.

- **High — Stale reading keeps its verdict** (top-ten #2). Past `STALE_READING_HOURS`
  (6h, `shared/reading-staleness.ts:41`) drop to `conditionShortLabel`, outline the chip,
  swap the otter for `flag`, and promote the age to a visible caveat. `gaugeCache.ts:53-61`
  already applies this rule to cached data; apply it to a live fetch too.
- **High — One unit only.** `displayUnit` (lines 112-129) picks one; `allReadings()` in
  `readingCopy.ts:70-89` was written to print both and is not imported here. Print the
  secondary small and uncoloured: "944 cfs · 2.31 ft".
- **High — Trend missing from the card** (top-ten #4). Compute server-side into
  `GaugeDetail` or from the 24h history and print it beside the age with the delta:
  "Falling slowly · −0.3 ft / 6h".
- **High — "Provisional USGS data" in red** (line 630-631, unconditionally
  `colors.error`). Branch on `readingSuspect`: suspect → error; provisional-only → fold
  into the age line in `textSubtle`.
- **Medium — Offline stale cache relabels a rated river as "Not rated by Eddy".**
  `gaugeCache.ts:53-61` nulls thresholds when not fresh; `stationTier` then returns
  `unknown`; the screen prints "Not rated by Eddy" / "No comparison" (lines 549-556,
  651-653) for the Current River. Carry a `verdictWithheld: 'stale'` marker and say so.
- **Medium — Chart bands are colour-only.** Six bands at 13% opacity, no band named on
  the plot (`GaugeChart.tsx:1108-1131`); NWS stage lines *are* labelled (`:1191-1220`).
  Label bands the same way, or add a legend row like the forecast one (`:1418-1453`).
- **Medium — Chart text is fixed 9–10px in ~4:1 grey** (`:1206, 1296, 1381, 1398`).
  Bump to 11–12 and scale by `PixelRatio.getFontScale()`.
- **Medium — Locked "Bottom line" placeholder is a fabricated go-signal.**
  `EddyTake.tsx:163` `'Good day to be on this river.'` at 50% opacity under a blur whose
  radius is a hint (`:112-120`). With Reduce Transparency on a flood day this is the
  wrong sentence to half-show. Use a neutral shape.
- **Medium — Eddy's written report has no age.** `generatedAt` is on the wire
  (`packages/eddy-types/index.ts:2014-2016`); `writtenAge()` exists (`eddySays.ts:79-87`);
  `EddyTake` never renders it. After overnight rain the reader cannot tell whether the
  paragraph predates the rise.
- **Medium — Water temperature is a footnote.** One `t.sm` muted line at the bottom
  (lines 700-708), °F only, not charted, absent on the seeded first frame. For a trout
  angler it is a headline stat; promote it beside the reading and consider it as a third
  chart unit on stations that publish it.
- **Low — "Alert me about this gauge" never reflects an existing rule.** No
  `useAlertRules` in the file; the button reads the same after you set one.
- **Done well:** `strictUnit` everywhere a colour is painted; suspect readings never
  graded; outages drawn as holes; "Now" becomes "Last reading" past 6h; forecast labelled
  with its NWS issue time; the plot is a real VoiceOver `adjustable`; the reference-gauge
  vocabulary shares no hue with the verdict system.

---

## 5. Map tab (`app/(tabs)/index.tsx`, `src/map/`, `map-sheet/`)

**How it feels.** At 5 a.m. it is genuinely good: every river in its condition colour,
put-ins and hazards from disk before any network, search that finds a gauge by town. At
the put-in it gets harder: the colour of the line is the whole verdict and nothing says
what the colours mean, labels are 10–11px, and the basemap is the same bright
`outdoors-v12` in a dark truck.

- **High — Colour-only network with a hidden key** (top-ten #3). (a) Draw the short
  condition word in the line label at ≥ `ZOOM.names` with a `symbolPlacement: 'line'`
  layer; (b) add a pattern channel to the two ends that matter — dashed casing for
  `dangerous`, dotted for `too_low`; (c) a one-row collapsible Key beside Locate; (d) move
  the ⓘ sentence (`layers.ts:577-586`) to the top of the layers sheet.
- **High — Tailwater generation is not readable from the map.** The dam pin has no
  state colour (`index.tsx:1202-1229`, `RiverMap.tsx:955-956`); the callout has no
  schedule or next-change; tailwater reaches draw in the same grey as "request failed"
  and "no gauge" (`index.tsx:2607-2614`). Give the pin a ring state (the badge circle
  exists at `RiverMap.tsx:1994-2010`), draw `dam_tailwater` reaches with their own dash,
  and add "Next change" to the dam callout.
- **High — Sheet content scrolls only at the tallest detent** (`SheetPager.tsx:180-184`,
  `sheetScroll.ts:8-12`). At `half`, trying to read the Overview lurches the sheet to
  `full`. Enable page scrolling at `half` when content exceeds the viewport, keeping the
  existing top-of-content hand-off (`MapSheet.tsx:282-296`).
- **High — Tabs (Float trips, Camping) are below the fold at peek with no cue**
  (`PinSheet.tsx:347-366, 462-673`). A first-time user sees no way to plan from a put-in
  except "Use as put-in". Render `SheetTabBar` as the last row of the peek, or a one-line
  "Float trips · Camping ▴" hint that retires once the user has dragged.
- **Medium — Boat ramp vs carry-down is invisible until z10.5 or the sheet.** `boatRamps`
  defaults off (`layers.ts:226`); the ramp mark is the only difference and only at the
  marker rung (`RiverMap.tsx:1126-1148, 2739-2741`). Default it on, give the ramp overview
  dot a distinct shape, and surface `AccessTypeBadges` (`sections.tsx:268-292`) in the peek.
- **Medium — After "Use as put-in" you are dropped into a modal.** Two modal round-trips
  per plan (`index.tsx:2998-3009`). Stay on the map with a "Put-in: Akers. Tap your
  take-out." banner; open `PlanSheet` once both ends exist; draw the endpoint marker
  immediately (`plan-endpoints` source exists at `RiverMap.tsx:2872-2909`).
- **Medium — Map text is 10–11px fixed and the basemap is light in dark mode**
  (`RiverMap.tsx:1958, 2074, 2194, 2264, 2647, 2664`; `runtime.ts:36`). Scale `textSize`
  by font scale, step up at `ZOOM.names`, and offer a night basemap when
  `scheme === 'dark'`.
- **Medium — Layers is the only top-right control** (`MapLayersSheet.tsx:603-612`); the
  bottom `controlRow` has room (`index.tsx:3305-3311`). Move it down beside Locate.
- **Medium — Hazards and rated gauges share red/orange circles at overview zoom**
  (`RiverMap.tsx:750-762, 1983-1985, 2868-2870`). Use an SDF triangle for the hazard
  overview rung and a distinct mark for low-water dams.
- **Medium — Overlapping features resolve to an arbitrary winner** (`RiverMap.tsx:
  1802-1811`). At Akers a put-in, an outfitter, a gauge and a spring share a bank. When
  `features.length > 1`, offer a chooser in the peek.
- **Medium — Shuttle logistics are absent from the map surface.** `driveBetweenUrl`
  exists (`directions.ts:69-78`) and no map sheet calls it. Add "Shuttle drive" to the
  plan cluster and "drive back ~X min" to Float trips rows.
- **Medium — Radar says nothing when it cannot load; the rivers error renders under the
  sheet** (`layers.ts:705-712`, `RiverMap.tsx:2534-2549`, `index.tsx:3076-3080`).
- **Low — No scale bar, no compass, no heading on the puck** (`RiverMap.tsx:2375, 2459`).
  A wader wants to know which way is downstream.
- **Low — The puck shows only after tapping Locate each visit** (`index.tsx:664-692`).
  When permission is already granted, show it on tab open.
- **Done well:** offline-first opening state; worst-of clustering for rated gauges; the
  peek that never moves under the thumb; real 44pt heads and an accessible grabber;
  safety copy that says "unavailable right now" and never "no gauge here"; Directions
  never offered on a hazard.

---

## 6. Float planning and Favorites

**How it feels.** Picking river → put-in → take-out is fast and the answer calculates
itself. The answer is where it fails the angler.

- **High — Tailwaters never get a float time** (`floatTime.ts:172-178` returns
  `'regulated'` unconditionally; `PlanResult.tsx:156-173`). For someone who floats the
  White weekly the planner is useless on home water. Estimate at the current generation
  state with a hard caveat, and make "Check the dam's schedule" a tappable row into
  `/dam/`.
- **High — No assumptions, no fishing pace** (`float-time-format.ts:146-148` is a
  constant; `speedMph`, `basis`, `timeRange.min`, `vessel` are on the wire and unrendered).
  Anglers float at 1.5–2× the paddling estimate and will guess short. Print the inputs
  ("≈2.1 mph in today's water") and add a client-side Paddle / Relaxed / Fishing control.
- **High — Too-low water silently doubles the time** (`floatTime.ts:34, 143-144`); the
  server warns only for `dangerous` and `high` (`api/plan/route.ts:680-685`). Render a
  warning row: "Below floatable level — expect to walk riffles."
- **Medium — Shuttle drive time is computed and withheld; handoff is Apple Maps only**
  (`PlanResult.tsx:280-307`; `driveBack` on the wire; `installedNavLinks` in
  `directions.ts:116-137` never called from PlanResult). The loading copy even promises
  it ("driving the shuttle…", `PlanSheet.tsx:218`).
- **Medium — What the buddy receives differs from the screen.** Share uses
  `plan.floatTime.formatted`; the screen shows the ceiling (`PlanSheet.tsx:77-84,
  116-118` vs `PlanResult.tsx:140-144`); the saved-float share drops the time
  (`app/float/[shortCode].tsx:74-80`); neither passes `url` to `Share.share`.
- **Medium — Favorites cards are ~240pt each.** Five rivers is three screens. Add a
  compact density (name, chip, reading, trend, track) as the default past three
  favorites; keep the band track, it is the best thing on the card.
- **Medium — Remove is instant with no undo, confirm, or haptic** (`favorites.tsx:
  387-394`, `SwipeRow.tsx:158-167`, `floats.tsx:126-133`). A 5-second Undo toast is
  trivial with a local-first store.
- **Medium — Saving a float needs the network; starring does not** (`PlanSheet.tsx:
  146-161` vs `useStarredRivers.tsx:318-338`). Store the stub locally with
  `shortCode: null` and mint the code on next connectivity.
- **Medium — The private-access confirmation guards the pin but not the picker**
  (`sheetActions.ts:57-80` vs `PlanSheet.tsx:589-599, 647`).
- **Medium — "Where to camp" stops at a name.** Along-the-way rows are plain `View`s
  (`PlanAlongRoute.tsx:67-97`); no availability, no tap-through, no directions.
- **Low — Two mileage bases on one plan** (river mile vs miles-into-float with no unit,
  `PlanResult.tsx:229, 334`, `PlanAlongRoute.tsx:65-71`).
- **Low — Take-out rows show length, not time** (`PlanSheet.tsx:643-659`); the pin
  sheet's Float trips rows do show it (`AccessTabs.tsx:546-548`).
- **Done well:** headwaters-first ordering with impossible floats unreachable; two honest
  refusals (dangerous vs regulated) rather than a number beside "do not float"; saved
  floats as stubs re-read against today's water; the offline Favorites story; sibling star
  and open targets; shares that survive without the app or an account.

---

## 7. Alerts and notifications

**How it feels.** The builder is better than most weather apps: thresholds in the gauge's
own unit, plain "Rises above / Drops below", a live "Right now" anchor with its age, and
sign-in and the iOS prompt both after the rule is written. Note: alerts are **not**
premium-gated (`premiumCopy.ts:37-41`); the only wall is Sign in with Apple as the push
address. What undercuts it is what happens after Save.

- **High — Quiet hours discard a falling-river crossing forever and the copy points at a
  removed feed** (top-ten #6). Fix the copy now. At window end, re-check suppressed rules
  and deliver one "crossed overnight — now 2.87 ft" for a state that still holds. Add a
  per-user "Recent" section under Mine fed by the outbox rows already written.
- **High — "Watching" on phones that cannot receive** (top-ten #7). One banner above
  Mine with the right action (Open Settings / Turn on / Retry); change the row line to
  "Never sent — notifications are off on this phone".
- **High — "Let safety warnings through" does not apply to custom levels.**
  `QUIET_BREAKTHROUGH_KINDS = {'warning'}` (`quiet-hours.ts:44`); threshold events are
  `'threshold'`. On a national gauge, custom is the only option, so a self-set flood line
  is silenced while the screen says "High and dangerous water still wakes you"
  (`quiet-hours.tsx:309-314`). Per-rule "wake me for this one" switch, or classify an
  above-`levelHigh` crossing as warning-class.
- **High — Generation alerts: one dam, raw cfs, no explanation elsewhere.** Only
  Clearwater has a release station wired (`app/dam/[damId].tsx:636-661`); Beaver and
  Greers Ferry have no `tailwater` block (`usace-registry.ts:355-364, 417-426`); the
  push says "Black River is at 1,850 cfs", not "started releasing". Offer preset chips
  seeded from `generationFloorCfs` ("Generation starts / stops") and a push title that
  names the dam; render a disabled "not available for this dam yet" row so absence reads
  as deliberate.
- **Medium — A threshold push cannot say which gauge on a multi-gauge river**
  (`gauge-threshold.ts:263`; `describeAlertRule` excludes the station by design). Append
  "at {station}" for gauge-scope rules.
- **Medium — Default threshold is "Rises above ⟨the current reading⟩"** and Eddy's own
  ladder lines are fetched (`configure.tsx:106-116`) but never offered as presets. Show
  the ladder as tappable chips; use the current reading as placeholder, not value.
- **Medium — VoiceOver hears only the river name on an alert row**
  (`AlertRuleRow.tsx:116-117`); switch rows lack `role="switch"`; Save buttons omit
  `accessibilityState.disabled`.
- **Medium — Delete from the edit screen omits the cascade the swipe confirms**
  (`[id].tsx:229-243` vs `alerts.tsx:634-640`).
- **Low — Hour picker is 2×24 horizontal chips with no initial scroll to the selected
  hour** (`quiet-hours.tsx:208-245`); a native wheel or 6×4 grid would be faster.
- **Low — `decimal-pad` with no Done key and no `KeyboardAvoidingView`**
  (`configure.tsx:503`). Worth testing on an SE.
- **Done well:** value before the ask; edge trigger + hysteresis + cooldown with the
  "already at 3.20 ft — stays quiet until it leaves and comes back" disclosure; units
  treated as physics; a three-line row that says a lot; three distinct empty states;
  quiet hours on the Alerts tab with the timezone-mismatch fix.

---

## 8. Dam and tailwater screens

**How it feels.** Unusually honest — every plan string says "scheduled", every
observation carries an age, hour-ending and Central-time math live in one place, and "No
generation scheduled" never becomes "water off". But the on/off fact the wader opens the
app for is the smallest text in the hero, units are expressed in MW and %, and from Bull
Shoals, Norfork or Table Rock there is no tap to the river or gauge below.

- **High — No path from the three flagship dams to their tailwater or gauge.** The
  "Open the river below this dam" button is gated on active rivers
  (`app/dam/[damId].tsx:595`) and the three tailwaters landed inactive
  (`supabase/migrations/20260824232949_three_tailwaters_land_inactive.sql`). No
  `/gauge/` link exists on the screen at all. Always render a secondary link to the
  release station's gauge screen when `tailwater` exists. **Worth checking** whether
  production has since flipped `active`.
- **High — "Generating now" is the least visible thing on the hero** (top-ten #5). Make
  the state the headline in sentence case, pair `flash` with `flash-off-outline`, draw
  an empty rack for the off state, and print `generatorEquivalentPhrase` ("about 6 of 8
  generators' worth") as a visible line — today it reaches only VoiceOver.
- **High — Staleness warnings are coral at ≈2.9:1 in light mode** ("may have been
  revised since", the "stale" tag, the "Now" bar label: `GenerationSchedule.tsx:191-193`,
  `DamPatternStrip.tsx:246-251`, `DayBars.tsx:369-378`; `accent[500]` `#F07052`, which
  `palette.ts:125` itself records as 2.9:1). Use `error` or `text`; keep coral for the
  2pt marker line.
- **High — List rows say "Generating / Idle" with no age from a server-frozen flag**
  (`DamRow.tsx:105-126`), while the hero revokes tense past two hours. Derive via
  `generationNow(dam)` and print the age.
- **Medium — Schedule magnitude is MW and % of capacity, not units** (`DayBars.tsx:
  156-168, 311-316`). Add per-unit gridlines and "≈ 4 of 8 units" to the readout.
- **Medium — Time-to-arrival downstream is hedged, not answered** (`GenerationCard.tsx:
  65`). Until lag calibration ships (`TAILWATER_PLAN.md:109-179`), say so plainly and
  spell out the stop-side asymmetry: "After a stop, the river stays up for hours."
- **Medium — The wading/siren line is 12pt grey fine print after the SWPA attribution**
  (`GenerationCard.tsx:64-68, 144`), and nothing on screen changes when a start is
  scheduled within the hour although `scheduleOutlook` already yields it. Add a
  bordered callout: "Units scheduled to start at 3 PM. Water rises fast below the dam;
  listen for the siren."
- **Medium — No pull-to-refresh** on a screen someone checks every ten minutes from the
  river (`app/dam/[damId].tsx`, refresh only on focus).
- **Medium — VoiceOver never hears the observation age; the section label hides the
  "Scheduled on now" chips** (`DamGenerationHero.tsx:158-162, 202`;
  `CollapsibleSection.tsx:58`).
- **Medium — The red "may have been revised" can fire during normal operation.**
  `SCHEDULE_STALE_AFTER_MINUTES = 90` versus a worst-case cache chain of ~120 minutes
  (SWPA revalidate 30 + route 15 + CDN 60 + app 15). Worth measuring; define staleness
  against the publication rhythm instead.
- **Low — No persisted last-known snapshot offline**; **Low — Central time named only on
  the pattern strip**; **Low — `RiverDamPanel` is dead code with stale copy**.
- **Done well:** observed vs scheduled as an enforced grammar; tense revoked on the
  reader's clock; the bounded stop sentence; loading, partial, failed and not-found as
  four distinct honest states; the pattern strip's legend.

---

## 9. Access point, onboarding, profile, paywall, photos

**How it feels.** Two panes and you're in; the legal screen is one tap; the picker has a
real "Not now"; nothing asks for a permission until a tap needs it. The access page opens
instantly off cache with Directions under the thumb. But the answers the persona drove
here for — ramp or gravel bar, whose land, what it costs, is it open — are the smallest
grey chips on the screen.

- **High — Directions to the waterline without saying so** (top-ten #9). Change the
  label to "Directions to the water", add "No parking coordinate recorded — stop where the
  road ends", and print the coordinates as a copyable line for GPS users.
- **High — Fee amount vanishes when there are no facilities.** `feeNotes` renders only
  inside the `hasFacilities` section (`[accessSlug].tsx:573-575, 836-853`). A "$5 launch,
  cash" outfitter ramp shows the chip and no number.
- **Medium — Ramp vs carry-down, ownership, agency are the quietest text; `ownership`
  is never rendered; type `access` prints as the word "Access"** (`:626-641,
  1057-1064`; `packages/eddy-types/index.ts:270-277`). A one-line verdict row under the
  name at `t.base`: "Boat ramp · MDC · Free" / "Gravel bar carry-down · Private · Fee".
  No field models hours or seasonal closure — "is it open" is unanswerable; a data-model
  gap worth logging.
- **Medium — The paywall shows no price until you sign in with Apple**
  (`PaywallSheet.tsx:152-169, 476-497`). Fetch offerings anonymously; gate the buy
  button, not the number.
- **Medium — Photo submission has no draft, retry queue, or progress** on the gravel bar
  where signal is worst (`PhotoSubmitSheet.tsx:481-505, 789-793`; 3.5 MB ceiling in
  `uploadPrep.ts:145` although the server re-downscales to 2400px). Persist and retry on
  next connectivity; default to ~1800px.
- **Medium — Reporting a locked gate requires an email address** (`FeedbackSheet.tsx:
  401-404`). Make it optional when the report carries an entity id.
- **Low — The green otter is used as decoration** on the picker, paywall, and Premium
  profile against the component's own rule (`Otter.tsx:3-8`).
- **Low — Sharing an access point yields a link the app won't open** (AASA claims only
  `/plan/*`). Deliberate; note it if universal links are revisited.
- **Low — No in-app appearance override** (`ThemeProvider.tsx:21-24`). A dawn launch with
  the system in light mode has no way to go dark.
- **Done well:** cache-first access screen that withholds Directions in the seeded state
  for a stated safety reason; exemplary permission discipline with honest usage strings;
  a paywall that sells only what is gated and a test that enforces it; restore and delete
  account both real; EXIF stripped by re-encoding; nav-app handoff shows only what is
  installed; storage and feedback copy that tell the truth.

---

## 10. What the persona is still missing entirely

Things no screen answers today. Listed so they are decisions, not oversights.

1. **Clarity / turbidity.** Not modelled. For smallmouth this decides the day.
2. **Water temperature as a first-class stat** on river and gauge cards, with a trend.
3. **Wading safety outside the dam screen.** The word "wade" appears only in dam
   components. A rising trend on a wadeable river deserves the same sentence.
4. **Time for water to reach a downstream access** after a generation change.
5. **A fishing pace** in the float planner.
6. **Sunrise/sunset** for a float that has to be off the water by dark.
7. **Regulations pointers** (trout park hours, special-management areas). Even a link
   to MDC/AGFC from the river screen would do.

---

## 11. Suggested order

1. **Theme day:** `conditionChipInk(code, isDark)` + migration + contrast test (§1.1);
   `textSubtle`/`warm`/`error` adjustments (§1.3); verdict word to 14pt (§1.2);
   `expo-haptics` with a four-event module (§1.5). One PR, no product decisions.
2. **Gauge card:** stale-verdict rule, both units, trend on the card, provisional in
   grey, temperature promoted (§4).
3. **Alerts truth:** fix the quiet-hours copy, the push-disabled banner, and the custom-
   level breakthrough (§7). The copy fix alone is an hour.
4. **Dam hero:** state as headline, icon pair, unit phrase visible, staleness ink,
   gauge link on every dam (§8).
5. **Map legibility:** condition word on the line label, pattern channel for the two
   dangerous ends, key beside Locate, dam pin state (§5).
6. **Planner honesty:** basis line, pace control, too-low warning, tailwater estimate,
   shuttle time shown, "Plan a float" from the river screen (§6).
7. **Access verdict row** and the Directions label (§9).
8. **Dynamic Type pass** at AX3 on the six screens named in §1.4.

Everything in 1–4 is presentation over data the phone already holds.
