# National Live River Map (`/river-map`)

> **Status: implemented** (on this branch; not yet merged). Device
> verification and the long-session soak are **unconfirmed** — see
> [Open gates](#open-gates). Decisions: [ADR 0018](../../docs/decisions/0018-national-river-map.md).

A national river dashboard: every USGS gauge in the 50 states and DC, opened on
the whole country, explorable down to a gauge, and presentable as a text-free
fullscreen display that can run for hours. Two data views ship first — **Flow**
(compared with usual for the time of year) and **Flooding** (official NWS
categories). **Change** is deferred from the first release by product decision;
the frames it needs are already being recorded.

## How it fits together

```
sync-gauge-latest (:05/:20/:35/:50)      NOAA riv_gauges layers 0 + 15
        │ gauge_latest (overwritten)              │ observed + forecast status
        └──────────────┬──────────────────────────┘
       record-river-map-frame (:12/:27/:42/:57)
                       │ one frame per capture
               national_map_frames ── retention: every capture 26 h, hourly 8 days
                       │
  /api/river-map/frame (CDN 5 min; ?since= → 204; ?at= → historical)
  /api/river-map/stations (CDN 6 h)        public/river-map/geometry/*.json
                       └───────────── browser ─────────────┘
```

| Piece | Where |
| --- | --- |
| Composite projection (geoAlbersUsa parameters, geographic inset routing, portrait layout) | `src/lib/national-map/projection.ts` |
| Frame format, builder, decoder, retention | `src/lib/national-map/frame.ts` |
| NWS flood vocabulary (quoted, never computed) | `src/lib/national-map/flood-status.ts`, `noaa-flood.ts` |
| What each mark means per view (freshness, comparison, flood rules) | `src/lib/national-map/marks.ts` |
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
  than 6 hours, or carrying a USGS suspect qualifier, gets a neutral hollow mark.
  A current reading without a percentile gets its own hollow mark — never
  "normal". Stations silent for 30+ days stay in search and totals but are drawn
  only once zoomed in.
- **Flooding** quotes NOAA's own observed category. Action stage is shown and
  counted separately and is never flooding. `not_defined` is "no flood
  threshold", never "no flooding"; `obs_not_current` / `out_of_service`, and any
  NWS observation older than 6 hours, are "not current". If NOAA cannot be read
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
  streams (digitized downstream); traces show direction only, never velocity.
  No reading is spread along a river.

## Presentations

| | Explore | Map only (default fullscreen) | Display with details |
| --- | --- | --- | --- |
| Header, panel, legend, search, controls | yes | none | none |
| Labels, tooltips, cursor | state labels at regional zoom; hover tip | none; cursor hides after 3 s | none |
| Text | everything | none | one status line, one rotating gauge (30 s) |
| Reveal controls | — | tap, click or any key → tray for ~8 s | same |

One explicit action enters fullscreen (Fullscreen API where available, the same
layout over the page where not — iPhone Safari). Escape exits. Entering from the
national view refits the country. A wake lock is requested while presenting, and
the composition drifts a few pixels over 12 minutes (OLED care; off with motion
off). The camera never moves on its own.

Preferences (`eddy-river-map-prefs-v1`): view, appearance (default **system**),
motion, details-in-fullscreen. Never fullscreen, a tour, location or replay.
Share links carry `?view=` and `?at=lng,lat,zoom` only.

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
| Base geometry (states, lakes, Strahler ≥ 5 / Hawaii ≥ 2) | 207 KB raw, 70 KB gzip |
| Detail geometry (Strahler 3–4, loaded past 2.2× zoom) | 739 KB raw, 223 KB gzip |
| Frame | ~1.7 MB raw, ~0.5 MB gzip; refreshed only when newer (`?since=` → 204) |
| Continuous zoom, 1920×1080 @1× | median 16.7 ms/frame, p95 33 ms |
| Continuous zoom, 1440×900 @2× | median 33 ms/frame, p95 50 ms |

Gestures move the last drawing by CSS transform and redraw once input settles;
the animated layer is capped at 30 fps and stops when hidden, paused, or stale.
Real GPUs should do better than these software-rendered numbers; they are not
device results.

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
- [ ] Change view (24 h): needs ≥ 26 h of frames, then the Phase 1 threshold calibration.
