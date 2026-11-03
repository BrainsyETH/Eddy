# National Live River Map (`/river-map`)

> **Status: implemented.** Device
> verification and the long-session soak are **unconfirmed** — see
> [Open gates](#open-gates). Decisions: [ADR 0018](../../docs/decisions/0018-national-river-map.md).

A national river dashboard: every USGS gauge in the 50 states and DC, opened on
the whole country, explorable down to a gauge, and presentable as a
fullscreen wall display that can run for hours — with a persistent legend by
default, a featured story on request, or no text at all. Three views: **Flow**
(compared with usual for the time of year), **Flooding** (official NWS
categories) and **Change** (what moved over the last 6 or 24 hours, against
the recorded frame that far back — see [Change](#change); its flow thresholds
are provisional until calibrated).

## How it fits together

```
sync-gauge-latest (:05/:20/:35/:50)      NOAA riv_gauges layers 0 + 15
        │ gauge_latest (overwritten)              │ observed + forecast status
        └──────────────┬──────────────────────────┘
       record-river-map-frame (:12/:27/:42/:57)
                       │ one frame per capture
               national_map_frames ── retention: every capture 26 h, hourly 8 days
                       │
  /api/river-map/frame (CDN 5 min; ?since= → 204; ?at= → historical;
                        ?meta=1 → history span; ?trend=1 → 24 h flooding trend)
  /api/river-map/stations (CDN 6 h)        public/river-map/geometry/*.json
                       └───────────── browser ─────────────┘
```

| Piece | Where |
| --- | --- |
| Composite projection (geoAlbersUsa parameters, geographic inset routing, portrait layout) | `src/lib/national-map/projection.ts` |
| Change: classification against the frame a window back, provisional thresholds; calibration evidence | `src/lib/national-map/change.ts`, `change-calibration.ts`, `scripts/calibrate-change-thresholds.ts` |
| Frame format, builder, decoder, retention | `src/lib/national-map/frame.ts` |
| Places: states and USGS water-resources regions — membership, framing, outlines, river-line regions | `src/lib/national-map/places.ts` |
| Story card: lead, standing against flood stage, calm summary; locator map | `src/lib/national-map/stories.ts`, `locator.ts`, `src/components/national-map/WallStory.tsx` |
| National 24 h flooding trend (counted from recorded frames) | `src/lib/national-map/trend.ts`, `src/components/national-map/TrendStrip.tsx` |
| River trails (particles bound to the river lines) | `src/components/national-map/trails.ts` |
| NWS flood vocabulary (quoted, never computed) | `src/lib/national-map/flood-status.ts`, `noaa-flood.ts` |
| What each mark means per view (freshness, comparison, flood rules), Explore and wall styles | `src/lib/national-map/marks.ts` |
| Palettes: light / dark, the wall variant, the opt-in vivid Flow colours | `src/lib/national-map/theme.ts` |
| "Follow the river" routes (downstream walks over the geometry's links) | `src/lib/national-map/journeys.ts` |
| Map scope (50 states + DC; territories out) | `src/lib/national-map/scope.ts` |
| Recorder cron | `src/app/api/cron/record-river-map-frame/route.ts` |
| Canvas renderer, stage, UI | `src/components/national-map/` |
| Geometry build | `scripts/build-national-map-geometry.ts` |
| Coverage audit (read-only) | `scripts/audit-national-coverage.ts` |
| Browser smoke | `scripts/national-map-smoke.ts` (River Map Smoke workflow) |

The curated Ozarks observatory moved to `/river-map/ozarks` unchanged; Eddy's
float verdicts stay there. The national map never issues one for an unrated
gauge — a flow band is a hydrological comparison, not a recommendation.

## Data rules

- **Flow** uses `gauge_latest.flow_percentile`, which `sync-gauge-latest`
  computes only for records long enough to grade (`seasonalBandEligible`), and
  the shared five bands in `shared/flow-band.ts` (10/25/75/90). A reading older
  than 6 hours, or carrying a USGS suspect qualifier, is drawn as a small
  neutral × (unavailable data). A current reading without a percentile is a
  hollow ring — never "normal", and never the same mark as unavailable. Stations silent for 30+ days stay in search and totals but are drawn
  only once zoomed in.
- **Flooding** quotes NOAA's own observed category. Action stage is shown and
  counted separately and is never flooding. `not_defined` is "no flood
  threshold", never "no flooding"; `obs_not_current` / `out_of_service`, and any
  NWS observation older than 6 hours, are "not current" (a ×). If NOAA cannot be read
  for a capture, the frame records `noaaOk=false` and the map says flood status
  is unavailable. Forecast status is detail-panel text with its valid and issue
  times; the map draws observed status only.
- **One identity per gauge.** A USGS station and its NWS forecast point
  (`gauge_stations.nws_lid`) are one site, drawn once. NWS points no USGS
  station claims are drawn on their own in Flooding.
- **Freshness ages against the wall clock**, so a frame that stops updating
  goes neutral by itself. Data-driven motion runs only while the newest frame is
  under 2 hours old, the last refresh succeeded, and something is current.
- **Geometry is context.** River lines come from the USGS 1:1M national
  streams (digitized downstream); trails show direction only, never velocity.
  No reading is spread along a river.

## Presentations

| | Explore | Legend (default fullscreen) | Story | Map only |
| --- | --- | --- | --- | --- |
| Header, panel, search, controls | yes | none | none | none |
| Labels, tooltips, cursor | state labels at regional zoom; hover tip | none; cursor hides after 3 s | same | same |
| Marks | every class | the wall hierarchy (below) | same | same |
| Text | everything | the wall legend: the view's symbols and one update / source line | the legend, plus one featured event with its 24-hour water level (and, in Flooding, the national 24 h trend) | none |
| Reveal controls | — | tap, click or any key → tray for ~8 s (Legend · Story · Map only) | same | same |

The wall legend is a compact panel in the composition's open left margin (the
Pacific above Alaska), sized for room distance; narrower than ~1.45:1 it
becomes a bottom strip and the map refits above it. Flooding · Observed lists
major / moderate / minor, then — set apart — action stage (NWS's preparation
stage, not flooding) and below flood stage; Flow · Versus usual lists the
active palette's bands. Its symbols come from the same `wallStyle` table the
canvas draws with.

One explicit action enters fullscreen (Fullscreen API where available, the same
layout over the page where not — iPhone Safari). Escape exits. Fullscreen fits
the whole country in the wall layout (Alaska and Hawaii enlarged into the
Pacific corner, clear of the border) unless the reader had zoomed into a region
(≥ 1.6×), which then stays centred; leaving restores the Explore view. Resizes
and layout changes keep the centre as a PLACE (component + projected
coordinates, `locate` in projection.ts) and the zoom — the wall moves and
enlarges the insets, so a layout point would name a different place. A
shared view (`?at=`) applies whenever it arrives, unless the reader has
already moved the map. A wake lock is requested while presenting, and
the composition drifts a few pixels over 12 minutes (OLED care; off with motion
off). The camera never moves on its own.

Preferences (`eddy-river-map-prefs-v1`): view, appearance (default **system**),
motion, what fullscreen shows (`wallText`: **legend** by default, story, or
none — a stored `displayDetails: true` from before reads as story), Flow
colours (default **Eddy**; Vivid is an opt-in prototype). Never fullscreen, a tour, location or replay.
Share links carry `?view=`, `?at=lng,lat,zoom` and `?region=` (a place —
below) only; the place is not stored, so a fresh visit shows the country.

## Phase 1 coverage snapshot (production, 2026-11-02 ~04:40 UTC)

Active USGS stream stations by state, from `gauge_stations` joined to
`gauge_latest`. Fresh = observed within 6 hours. "Percentile held" counts any
stored percentile regardless of age. "NWS crosswalk" counts stations carrying
`nws_lid`. Rerun with `npx tsx scripts/audit-national-coverage.ts --out report.md`
for the full report (it adds dormancy, NWS points per state with and without
thresholds, regional-seam gaps and the Aleutians).

| State | Stations | Latest row | Fresh discharge | Fresh stage | Percentile held | NWS crosswalk |
| - | -: | -: | -: | -: | -: | -: |
| AK | 264 | 264 | 59 | 88 | 102 | 106 |
| AL | 220 | 220 | 143 | 182 | 129 | 114 |
| AR | 238 | 238 | 100 | 144 | 99 | 48 |
| AZ | 267 | 267 | 159 | 174 | 145 | 89 |
| CA | 615 | 615 | 422 | 463 | 339 | 291 |
| CO | 577 | 577 | 261 | 274 | 343 | 141 |
| CT | 79 | 79 | 70 | 70 | 67 | 25 |
| DE | 43 | 43 | 17 | 21 | 19 | 7 |
| FL | 669 | 669 | 282 | 410 | 333 | 290 |
| GA | 393 | 393 | 285 | 325 | 274 | 286 |
| HI | 145 | 145 | 76 | 89 | 90 | 57 |
| IA | 234 | 234 | 133 | 178 | 149 | 171 |
| ID | 389 | 389 | 189 | 194 | 193 | 149 |
| IL | 298 | 298 | 186 | 230 | 190 | 193 |
| IN | 308 | 308 | 175 | 233 | 208 | 209 |
| KS | 259 | 259 | 176 | 208 | 177 | 158 |
| KY | 252 | 252 | 144 | 199 | 148 | 149 |
| LA | 300 | 300 | 58 | 231 | 57 | 134 |
| MA | 165 | 165 | 109 | 116 | 95 | 64 |
| MD | 206 | 206 | 128 | 137 | 152 | 129 |
| ME | 96 | 96 | 58 | 64 | 71 | 55 |
| MI | 311 | 311 | 193 | 210 | 203 | 153 |
| MN | 171 | 171 | 102 | 124 | 112 | 111 |
| MO | 305 | 305 | 221 | 237 | 227 | 141 |
| MS | 176 | 176 | 80 | 113 | 102 | 89 |
| MT | 231 | 231 | 122 | 123 | 145 | 120 |
| NC | 405 | 405 | 220 | 268 | 222 | 238 |
| ND | 172 | 172 | 101 | 121 | 84 | 78 |
| NE | 212 | 212 | 112 | 143 | 138 | 147 |
| NH | 66 | 66 | 54 | 57 | 57 | 50 |
| NJ | 214 | 214 | 114 | 153 | 132 | 127 |
| NM | 254 | 254 | 137 | 139 | 147 | 74 |
| NV | 248 | 248 | 135 | 138 | 143 | 88 |
| NY | 285 | 285 | 186 | 209 | 192 | 126 |
| OH | 385 | 385 | 207 | 292 | 203 | 243 |
| OK | 219 | 219 | 141 | 161 | 143 | 128 |
| OR | 404 | 404 | 228 | 248 | 278 | 169 |
| PA | 478 | 478 | 304 | 355 | 284 | 272 |
| RI | 50 | 50 | 35 | 36 | 35 | 16 |
| SC | 333 | 333 | 134 | 201 | 144 | 148 |
| SD | 218 | 218 | 99 | 128 | 120 | 144 |
| TN | 254 | 254 | 102 | 127 | 125 | 117 |
| TX | 786 | 786 | 541 | 703 | 385 | 428 |
| UT | 315 | 315 | 153 | 158 | 206 | 68 |
| VA | 322 | 322 | 189 | 213 | 200 | 182 |
| VT | 71 | 71 | 52 | 53 | 48 | 42 |
| WA | 464 | 464 | 237 | 265 | 271 | 151 |
| WI | 423 | 423 | 174 | 192 | 185 | 128 |
| WV | 183 | 183 | 101 | 157 | 89 | 142 |
| WY | 133 | 133 | 65 | 68 | 87 | 60 |
| **50 states** | **14,105** | **14,105** | **7,769** | **9,422** | **8,087** | **6,845** |

Findings:

- **No ingestion gap by state.** Every station has a latest row and every state
  has current readings. The gap is capability, not ingestion: 4,480 stations
  (31%) last reported more than 30 days ago — seasonal, discontinued, or
  stage-only lakes — which is why dormant stations are hidden nationally.
- **Louisiana** is mostly stage-only (58 fresh discharge vs 231 fresh stage),
  so Flow shows it thinly while Flooding covers it. That is the data, not a bug.
- **Out of scope:** 156 stations carry no state code — 145 in Puerto Rico /
  the Virgin Islands (excluded), 5 in DC and 4 on the Canadian border (kept).
- **NOAA (same day):** 12,798 in-scope forecast points; observed status
  7,038 below flood stage, 4,156 no threshold, 831 not current, 637 out of
  service, 31 action, 18 minor, 7 moderate, 9 major.
- **Cadence:** `sync-gauge-latest` runs every 15 minutes (confirmed in
  `fetched_at`), not hourly as older comments said.

## Measurements (headless Chromium, software rendering, 14,067 stations)

| | Result |
| --- | --- |
| Base geometry (states, lakes, Strahler ≥ 5 / Hawaii ≥ 2, downstream links) | 209 KB raw, 71 KB gzip |
| Detail geometry (Strahler 3–4, loaded past 2.2× zoom) | 739 KB raw, 223 KB gzip |
| Frame | ~1.7 MB raw, ~0.5 MB gzip; refreshed only when newer (`?since=` → 204) |
| Continuous zoom, 1920×1080 @1× | median 16.7 ms/frame, p95 33 ms |
| Continuous zoom, 1440×900 @2× | median 33 ms/frame, p95 50 ms |

Gestures move the last drawing by CSS transform and redraw once input settles;
the animated layer is capped at 30 fps and stops when hidden, paused, or stale.
Real GPUs should do better than these software-rendered numbers; they are not
device results.

## Liveness, motion and highlights

- **Liveness is judged for the view on screen** (`viewLiveState`, marks.ts).
  Flooding needs a current NOAA capture with assessed points; Flow needs
  current USGS readings; both need a recent snapshot and a successful refresh.
  When the view is not live the map goes static and subdued (no trails,
  rings or spotlight), the fullscreen tray states why once it is opened, and
  the wall legend's source line gives the reason. Fresh USGS
  data never makes a Flooding view look alive.
- **Motion vocabulary: river trails.** The moving network is drawn the way
  Earth Nullschool draws wind — short-lived particles leaving fading trails —
  but bound to the river lines (`trails.ts`), never to the space between
  them. Particles travel each line in its digitized downstream direction at a
  constant on-screen pace per class (trunk fastest, small streams slowest).
  Classes, in priority order: trunk (order ≥ 7), major (6), regional (5),
  Hawaii (its base streams, orders 2–3), tributaries (order 4) and small
  streams (order 3) — each thinner, fainter and slower than the one above;
  tributaries and streams use water-coloured ink (`traceStream`), since their
  lines are not drawn at the national scale. Particles go only to channels
  on screen, at a steady density per screen pixel (zooming in fills the view),
  and the 4,200-particle cap serves the big rivers first. Small streams
  nationally run only on lines chosen by length and spacing (longest per
  22 px cell, ≥ 9 px long); from 2.2× zoom, where their lines are drawn, all
  of them. The detail network (~220 KB compressed) loads once motion runs on
  the wall or a wide screen; phones still load it only on zooming in. The
  trails canvas fades a little each frame and is cleared on any camera move,
  so a pan never smears (8-bit rounding leaves crossed pixels at alpha
  1/255, measured — invisible, so there is no clean-up pass). Explore adds
  the regional class from 2× zoom; the wall runs every class at the
  national fit. While a journey runs the trails drop to 30 %. A trail on a
  stream says only which way it is mapped to flow — never that it is
  carrying water now; measurements stay on the gauges. Flood event rings mark current official flooding. The rarest
  readings — at or above the published 95th-percentile flow for the date, or
  at or below the published 5th — are drawn larger and above their band.
  Directions only — no speed is a measured velocity, and no reading is
  spread along a river.
- **Percentile tails claim only published thresholds.** USGS daily statistics
  publish p05 … p95 and nothing beyond. `calculateDischargePercentile`
  returns ≥ 95 only for a reading at or above the published p95 (≤ 5 only at
  or below p05); without p95 / p05 a tail reading stays inside 90–94 / 6–9,
  and rounding never lifts a reading onto a tier. It once extrapolated
  against p90 alone (p90 = 100, p95 = 1,000: 170 cfs scored 97). No band
  changes: the cuts are 10 and 90. The detail panel shows ≥ P95 / ≤ P5.
  Data check, 2026-11-02 production (current readings, day 307): of 334
  much-higher gauges in AZ / UT / NM / CO / NV, **272 are at or above the
  published p95** — the Southwest's widespread high flow is real; nationally
  25 gauges the old formula scored ≥ 97 were below p95.
- **Highlights in Explore.** `curateHighlights` picks a few meaningful events
  spread across the country for the "Flooding now / Most unusual now" list.
- **Featured stories on the wall** (`stories.ts`). Each story turn (20 s)
  picks the development most worth attention: severity, change since a
  recorded frame ~6 h older (new flooding, a category crossing, back below
  flood stage, a stage or flow shift), freshness, variety (away from the last
  pick) and recency (just shown steps back), so a new crossing wins and an
  unchanged extreme gauge cannot win every turn. Nearby gauges with the same
  development fold into one story. The spotlight ring marks it on the map.
  No older frame recorded yet: no change is claimed.
- **The story card** (Story mode, `WallStory.tsx`) is built to be read across
  a room:
  - **The lead is what the map shows**: the gauge's own mark (shape and NWS or
    flow colour, `wallStyle`) and its category at title size — "◆ Moderate
    flooding". The development sits above it in small capitals, only when
    supported: "Now in" / "Rose to" / "Back below flood stage" from NWS
    categories in both frames, "Still rising" / "Crest passed" from the
    series (minimum sizes). It replaced a single phrase in a teal pill that
    looked the same for every severity.
  - Gauge, river and state, and a **locator**: the country (or the region's
    states) with the gauge marked.
  - **The reading as a number**, against NWS flood stage only where the
    datums agree (`chartStages`) and only when the relation agrees with the
    category NWS reports now — stored thresholds can lag NWS's own
    (`storyStanding`). Flow: discharge, with the percentile claim only at or
    beyond the published tails.
  - The 24 hours, larger, with the latest value at the end of the line and
    the water above flood stage shaded; dots show how many developments are
    in rotation.
  - **All quiet**: when nothing in view deserves a story, a calm card says so
    with the counts — "No flooding in Missouri: all 113 NWS forecast points
    with a current reading are below action stage"; Flow shows the band
    shares — never a forced event (`calmSummary`).
- **NWS flood stages on the story chart.** When the featured gauge's NWS
  forecast point defines them (`gauge_stations.nwps_*_stage_ft`), the 24-hour
  chart draws action / flood / moderate / major as dashed lines in NWS colours
  — only for thresholds near the series, and only when the datums agree
  (`chartStages`, stories.ts): NWS's own observed stage and the USGS gauge
  height, both in feet and observed within 2 h of each other, differ by
  ≤ 0.5 ft. Otherwise no line is drawn: a threshold on another datum would
  place flood stage feet away from the truth. Evidence, 2026-11-02 production:
  of 6,613 paired points, 6,367 agree within 0.5 ft and 134 differ by more
  than 2 ft.
- **The flooding trend** (`trend.ts`, `TrendStrip.tsx`; per place — see Places). How many NWS
  forecast points were in minor, moderate or major flood, hour by hour, over
  the last 24 h of recorded frames — stacked bars in NWS colours, newest at the
  right. The recorder stores each frame's count as `fc` ([major, moderate,
  minor, action]) using the map's rules (observed category, not current if
  observed more than 6 h before that capture; action stage is not flooding).
  The frame route's `?trend=1` picks the newest capture in each hour and reads
  only `fc` and `sources` — the NWS rows are ~1.1 MB of each frame; reading
  two small keys costs ~45 ms a frame (production, 2026-11-02). A capture whose
  NOAA read failed is a gap, never a zero; frames recorded before `fc` existed
  are left out, so the strip fills in over the first day after deploy. Shown in Explore's Flooding legend and in Story mode's
  column in Flooding; with fewer than two recorded hours it says the trend is
  building.
- **One focal point at a time.** Only a few geographically distinct floods
  pulse (`pickPulses`); every severity symbol stays drawn. The sequence
  alternates a river journey (which holds at its outlet so the connection
  reads) with a current story: discover a river → notice what is happening →
  another place. **Story mode opens on its story** (the card is the point of
  that mode); the legend and map-only displays open on a journey. The camera
  never moves.
- **Follow the river.** With motion on and the view live, the wall alternates
  the spotlight with a journey: a highlight travels a real river network from
  a headwater line to its outlet, each tributary flashes as the head passes its
  mouth, and the lit route holds at the outlet before fading (12–22 s). Routes
  come from the geometry's own From/To node topology (`d` links in
  `base.v2.json`); `pickJourneys` takes the longest walk to each outlet, then
  only routes that are mostly new, comparing lengths at true scale so Alaska's
  Yukon competes. **Which journey runs**: right after a story, the water from
  THAT gauge, downstream to its outlet ("Downstream from Meramec River near
  Eureka, MO", `journeyFromSite`) — only when the gauge stands on a river of
  the national network (within 1.2 frame px, or 4 px of a line whose name the
  gauge carries); a gauge on a creek the network does not hold gets none,
  never a neighbouring river's. Otherwise the next route in a rotation that
  starts at a different route each hour and carries on across view changes
  (the sequence once opened on the Mississippi every time). It is geometry,
  never measurement: the pace is presentation, and the caption names rivers
  only. While it runs, a veil on the effects
  layer and quieter trails let the route command the screen; flood marks and
  rings sit above the veil at full strength. Near-white is reserved for the
  journey (wall trails are a soft cyan). The stage exposes `data-act`
  (`journey` / `spot` / `none`) and `data-region` for the smoke.
- **Regional walls play what they can see.** When fullscreen keeps a regional
  zoom, the stage reports its visible region (per inset, projected
  coordinates); spotlights come from visible gauges, spaced for the zoom, and
  journeys are clipped to the longest stretch of river inside the view
  (`visibleJourneys`) — the head enters where the river enters the screen.
  The national view keeps the national sequence.

## Places: a state or a water-resources region

The map can be scoped to a **state** or a **USGS water-resources region**
(HUC2: Ohio, Missouri, Arkansas-White-Red…, which follow rivers rather than
state lines): the Area picker in Explore and in the fullscreen tray, or
`?region=MO` / `?region=huc05` (`places.ts`).

- **Membership — one rule everywhere** (map, stories, counts, the recorder's
  regional flood counts): a USGS gauge belongs to its own state and its HUC's
  region (`gauge_stations.huc`, 99.5 % populated on 2026-11-03); an NWS point
  no gauge claims belongs to NOAA's state for it (`riv_gauges.state`, carried
  as the NWS row's optional 13th element) and to no region (NOAA reports none).
- **Home camera.** The place is framed (a state's outline; a region's gauges,
  1st–99th percentile so a mis-coded gauge cannot stretch the frame); reset,
  first fit and fullscreen go there. Zoom stays relative to the national fit,
  so detail rivers, every small stream's trail and mark sizes behave as
  zoomed in. Choosing a place is an explicit action, so the camera moves.
- **A state reads as a state map**: everything outside its outline is veiled
  (72 % background) and its outline drawn firmly; river names label the
  longest stretch of each named river on screen (also in Explore from 2.2×).
- **A water-resources region** has no outline in the geometry: gauges outside
  it drop to 30 %, and its trails and journeys stay on its own rivers (each
  river line assigned the region of its nearest gauges, `lineRegions`).
- **Scoped**: Explore counts and the notable list, the Change summary, the
  wall's stories, pulses and journeys (clipped to the place, `clippedJourneys`
  / `clipFromStart`), the legend (it names the place) and the flooding trend.
  Liveness stays national: the data's freshness is national.
- **Eddy's rated rivers (a state, Flow view)** (`rated.ts`): each river Eddy
  rates is drawn in sections, one per rated gauge — boundaries halfway
  between neighbouring gauges along the river — in Eddy's canonical
  condition hues (`CONDITION_SYSTEM`; the app's chips and the planner agree),
  graded as the planner grades (`classifyReading`, the gauge's own thresholds
  and unit, flood stage overriding). Drawn in the map's own language, not
  the planner's:
  - **a channel** at major-river weight in the section's hue — lifted on the
    dark displays by a soft underglow (`ratedGlow`, as the trunk rivers are),
    held on parchment by a thin ink keyline (`ratedKeyline`);
  - **trails** along it, tinted by the section's condition (lifted toward
    white on dark, deepened toward ink on parchment), denser than the
    network's — only where the line's downstream direction is confirmed by
    the national network (`orientRivers`: points vote with the direction of
    the nearest national line; a split or empty vote claims no direction and
    runs no trail);
  - **no current reading**: the section is plain river, never a guessed hue;
  - **names**: each rated river labelled on its longest stretch on screen,
    in neutral ink, ahead of the network's quieter water-coloured names; no
    label overlaps another. One toggle — **River names** in Settings and in
    the fullscreen tray of a scoped wall (`riverNames`, on by default) —
    covers both;
  - **the story card** adds "Eddy: Flowing on the Current River" when the
    featured gauge is rated; the calm card counts the rated gauges by
    condition; the legend draws each swatch the way the map draws it.

  Geometry and thresholds come from the planner's dataset
  (`/api/usgs/mo-dataset?slim=1`, ~90 KB, loaded only for a state); readings
  from the national frame, so a section and its gauge mark always agree. A
  river counts as in the state when any of it lies inside the outline (the
  Buffalo appears in Arkansas; the White in both). Flow only: Eddy's orange
  "High" and red "Flood" would read as NWS flood categories in Flooding, and
  Change has its own scale. 2026-11-03: 28 rated rivers, 50 rated gauges, 49
  of them in the national frame.
- **Regional flooding trend.** The recorder stores per-region counts in each
  frame as `fcr` (`{ MO: [major, moderate, minor, action], huc07: […] }`,
  regions with any count only); `?trend=1&region=MO` reads them. A region
  missing from a frame's `fcr` had nothing to count (zero); a frame recorded
  before `fcr` existed is left out, so a region's strip fills in over the
  first day after deploy.

## Change

What moved at each gauge over a window, against the recorded frame that far
back (`change.ts`). Two kinds of change, never mixed:

- **Flood crossings** — NWS's own observed category in both frames: rose into
  or within flooding (▲) or fell within or out of it (▼), coloured by the
  highest category involved. Moves within action stage and below are not
  crossings. Quoted, so no threshold of ours is involved.
- **Flow change** — discharge now against then as a ratio, with a 1-cfs floor
  (stage in feet for stage-only gauges): rising / rising sharply / about the
  same / falling / falling sharply, in Change's own direction tones (teals for
  more water, sand → copper for less).

Never a "change": a reading flagged by USGS, an earlier reading that was not
current when its frame was captured (> 2 h old), or a jump of 30× or more
("unverified" in Explore, absent on the wall).

**Windows.** 6 h and 24 h are offered only once recorded history reaches that
far back (≥ 90% of the window; the frame route's `?meta=1` gives the oldest and
newest frame times). Until then the view draws no change marks, says when
comparisons begin, and reports "Change history is still being recorded".

**Thresholds are provisional** (the method note says so): 6 h rising ≥ 1.25×,
sharply ≥ 2×; 24 h rising ≥ 1.5×, sharply ≥ 3×; falling at the inverse; stage
0.3 / 1 ft (6 h) and 0.5 / 2 ft (24 h). Calibrate with
`scripts/calibrate-change-thresholds.ts` (read-only): it reports discharge-ratio
percentiles by river size and the share of gauges each threshold would mark.
Aim: on an ordinary day most gauges read "about the same" and "sharply" stays
rare. Run it on a quiet day and a wet one before moving a number, and record
the runs here. Stage-only gauges (no discharge) get their own table in feet.
Regulated releases are not separated — there is no national list of gauges
below dams — and snowmelt and ice are not modelled yet.

**Calibration runs** (no threshold moved until a quiet and a wet day agree):

| Run (frame, UTC) | Window | Day | Discharge gauges: ▲▲ / ▲ / ≈ / ▼ / ▼▼ | Stage-only: ▲▲ / ▲ / ≈ / ▼ / ▼▼ |
| --- | --- | --- | --- | --- |
| 2026-11-02 22:27 | 6 h | ordinary (62 NWS points in flood at 21:57) | 1.5 / 3.7 / 89.9 / 3.6 / 1.1 % of 7,651 | 3.0 / 3.5 / 87.6 / 3.7 / 2.2 % of 1,671 |

Notes from the first run: every size group stays 88–91 % "about the same";
gauges with no drainage area on record are noisier (82.9 %), and stage-only
gauges have wide tails (p1 −2.4 ft, p99 +3.1 ft in 6 h) — probably tidal and
reservoir gauges, to check before the feet thresholds move. The 24 h window
opens once recorded history reaches it (recording began 2026-11-02 12:42 UTC).

## The wall (fullscreen)

Fullscreen draws its own hierarchy from the same classes, colours and shapes,
so thresholds and the legend still hold (`wallStyle`, `wallPalette`):

- **Unknown and unavailable data leave the wall** — no seasonal comparison,
  not current, no flood threshold, no NWS point. Explore keeps all of it.
- **Routine readings are texture**: Normal and Below flood stage are small and
  translucent; Lower / Higher lose their keylines. The river network, not a
  carpet of dots, is the background.
- **Events are bold**: flooding marks grow, sit on a knockout halo so a cluster
  stays countable, and pulse wider (major carries two pulses). Action stage is
  a slim ring that never pulses — deliberately below minor flooding.
- **Bounded glow (dark wall).** Unusual readings carry a short glow in their
  own category colour behind a crisp core on its knockout halo: major 0.9,
  moderate 0.75, minor 0.6; exceptional flow (≥ published p95 / ≤ p05) 0.8,
  much higher / lower 0.45; nothing routine, action stage or below flood
  stage glows. Glows are drawn into an opaque black layer with `lighten`
  (per-pixel maximum) and shown with `screen` blending, so overlapping glows
  never add up: ten moderately unusual gauges together are no brighter than
  one, and an exceptional gauge still outshines the cluster. Peaks stay well
  below the journey's near-white. The light wall gets no glow — on parchment
  it muddies — but darker ink keylines (0.92) and a clean parchment outline
  on much higher / lower, the extremes and floods.
- **Three brightness tiers**: land drops back (state lines nearly vanish),
  water is brightest of the non-events (trunk underglow, every trail class
  running at the national fit), events carry full saturation.
- **Vivid Flow colours** (Settings → Flow colours, opt-in prototype): copper /
  sand for unusually low, subdued teal for normal, saturated cyans for high —
  most saturated for the rarest highs (≥ published p95) — with light-theme
  variants that deepen instead of brighten. Not white: that belongs to the
  journey. Same bands and thresholds; the legend adds a
  row for the rarest highs only when they have their own colour. Flooding
  keeps NWS colours in every set.
- **The Eddy badge**, bottom right in Legend and Story (never Map only, which
  stays free of words and logos): the otter and wordmark, a QR code to Eddy's
  download page (`/app?ct=river_map_wall`, rendered on the server by
  `src/lib/app-qr.ts` with a 2-module quiet zone, on a white tile in both
  themes so phone cameras read it), and `eddy.guide` underneath. Above the
  legend strip on narrow screens.
- **The tray** stays open only while it has *keyboard* focus; a clicked button
  keeps focus, so pointer use no longer pins it open.

## First deploy

Until the recorder stores its first frame (≤ 15 minutes after deploy),
`/api/river-map/frame` builds a frame live with the shared capture code
(`capture.ts`), serves it with a 2-minute CDN lifetime and the header
`X-Frame-Source: live-bootstrap`, and stores nothing. The map has real
readings from the first request.

## Design-skill review (2026-11-02)

Nine third-party skills (vetted as instruction-only first) were run read-only
against the map: Jakub Krehel's better-accessibility / better-typography /
better-colors, Emil Kowalski's break-ui and mobile-native, web-design-engineer's
critique guide, Meng To's two anti-slop audits, and Owl-Listener's visual
critiques (its large-text rule corrected to WCAG's 24 px / 18.66 px bold).
Every fix below was verified in the browser; the new checks live in
`scripts/national-map-smoke.ts`.

- **Dark-mode flow encoding.** Higher / Much higher (#256574, #163F4A) vanish
  on deep-teal land and, with only a keyline, read as hollow rings — the
  "no comparison" shape. A backing disc alone did not fix it (any fill as dark
  as the land reads hollow at 2–5 px). They now sit on a sand chip with the
  canonical fill composited at 72%: centres stay darker than Normal and in
  order, and read as filled. Light mode is unchanged except keylines (below).
- **3:1 for meaningful marks (light).** Keylines at 0.7 alpha on every flow
  band (hairline on the smallest), an outer keyline under the action ring,
  hollow marks in neutral-500 (no longer the stone of "much lower"). The two
  pure-context marks — "below flood stage" and "USGS gauge, no NWS point" —
  stay quiet by decision.
- **Fixed:** iPhone fallback fullscreen sat under the site header; dark hover
  ink matched its fill; map focus ring painted under the canvases; portrait
  tablets hid the West under the panel; panels clipped at 200% text and on
  landscape phones; a failed catalog showed an empty country; the chooser
  dropped all but 12 coincident gauges and could scroll the map off its frame;
  phone sheets hid the selected gauge; 14 px search zoomed iOS; focus fell to
  `<body>` after fullscreen/details/chooser; settings came before its trigger.
- **Added:** Enter on the focused map lists the gauges under a centre reticle;
  a "Flooding now / Most unusual now" list in the legend; room-distance type
  for Display with details; methodology behind an ⓘ.
- **Left site-wide on purpose** (each needs its own review because it changes
  every page): `viewport-fit=cover` for safe areas (the map already pads with
  `env()`), hover styles gated to fine pointers, and the shared Segmented focus
  colour (overridden inside the map only).

## Open gates

Unticked until evidence is recorded here:

- [ ] Fullscreen and fallback verified on desktop Chrome/Safari/Firefox, iPad, iPhone.
- [ ] 8-hour visible run and 24-hour soak (midnight, DST, sleep/resume, reconnect) with flat memory and no request growth.
- [ ] TV / ultrawide composition checked on a real display at room distance.
- [ ] Dark-mode flow encoding (sand chip, 72% composite for Higher / Much higher) signed off on a real display.
- [ ] First production frames recorded after deploy; frame row size measured in Postgres.
- [ ] Real-display review on a quiet day and on a widespread-flood day: does something catch the eye within ten seconds, and is there something worth following for a minute?
- [ ] Wall legend read from across a room (size, the side panel vs. the Pacific coast at 16:10, the bottom strip on a portrait display) and Story mode's picks reviewed over a few hours of live data: do crossings and recoveries surface, does the same gauge stop repeating, are the headlines right against the hydrographs?
- [ ] "Follow the river" reviewed on a real display in both themes (pace, light-theme casing, tributary flashes), and the eight picked routes checked by someone who knows the rivers.
- [ ] Vivid Flow colours as the eventual **wall default** (the review's recommendation: the main contrast gain should not hide behind Settings) — after a real-display comparison against Eddy colours. The data side is checked (above): a wet region looking exceptional is the data, and thresholds do not move for composition.
- [ ] Change flow thresholds calibrated: `calibrate-change-thresholds.ts` run on a quiet day and a wet one with ≥ 24 h of frames, results recorded under [Change](#change), thresholds adjusted or confirmed, and "provisional" removed from the method note. Regulated releases (dam tailwaters), snowmelt and ice reviewed against the runs.
- [ ] Change reviewed on live data once 24 h comparisons exist (recording began 2026-11-02 12:42 UTC): do the crossings match NWS hydrographs, and do the biggest changes read as real events?
