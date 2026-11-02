# 0018 — The national Live River Map

Status: active · 2026-11 · table `national_map_frames` applied to production as
`20261102051731`.

## Context

`/river-map` was a curated Ozarks observatory with nationwide USGS dots added
on. The product plan made it a national dashboard: all 50 states on first open,
Flow and Flooding views, gauge drilldown, and a fullscreen display with no
persistent text. Three facts shaped the build:

- `gauge_latest` is overwritten every 15 minutes and `gauge_readings` holds
  only curated stations (00196: national history would be ~40 GB a year), so
  nothing could answer "what did this gauge read yesterday".
- MapLibre draws Web Mercator or a globe, not a composite projection with
  Alaska and Hawaii insets, and the planner's basemap (Carto) requires visible
  attribution, which a text-free display cannot carry.
- NOAA's riv_gauges service publishes each forecast point's computed flood
  category, so the map can quote NWS instead of comparing USGS stage to NWS
  thresholds across datums.

## Decision

1. **Frames.** A cron writes one JSON frame per capture (every in-scope USGS
   latest reading plus every NWS point's observed and forecast status) to
   `national_map_frames`, kept every 15 minutes for 26 hours and hourly for
   8 days. Browsers read the newest frame through the CDN; history is the same
   format. Format: `missouri-float-planner/src/lib/national-map/frame.ts`.
2. **Own renderer, own projection.** A canvas renderer draws pre-projected,
   public-domain geometry (Census states, USGS 1:1M streams and waterbodies)
   in geoAlbersUsa's composition, with insets routed by geography so the
   western Aleutians are kept. No tile provider, so no attribution on the map.
   MapLibre remains the planner's engine.
3. **Quote NWS.** Flood status is NOAA's own category, joined by
   `gauge_stations.nws_lid`; action stage and "no threshold" stay distinct
   from flooding.
4. **Scope.** The 50 states and DC. Puerto Rico and the territories are
   excluded at the map boundary (ingestion keeps them).
5. **First release.** Flow and Flooding; Change waits for recorded frames and
   calibration. Appearance defaults to the system setting.
6. **Routes.** The national map takes `/river-map`; the Ozarks observatory
   moves to `/river-map/ozarks` with its float verdicts and deep links.
7. **Motion means current, per view.** Data-driven motion and the spotlight
   run only while the selected view's own data is current; Flooding depends
   on the NOAA capture, Flow on USGS readings. Until the first frame is
   recorded, the frame route serves a live, unstored capture.
8. **The wall is its own presentation.** Fullscreen keeps the same classes,
   colours and shapes but its own hierarchy: unknown and unavailable data
   leave the wall (Explore keeps them), routine readings become texture, and
   flood events carry the emphasis. Its signature, "Follow the river", walks
   the geometry's downstream links from a headwater to an outlet; it is
   geometry, never measurement, and runs under the same liveness rule as other
   motion. A regional wall plays only what it can see (visible gauges, the
   visible stretch of river); a view is carried across layouts as a place,
   never a layout point. "Exceptional" flow means at or beyond the outermost
   PUBLISHED percentile (p95 / p05) — the percentile calculation never claims
   a finer position, and thresholds never move to suit a composition.
   Alternative Flow colours stay opt-in until a real-display review; the
   canonical bands (`shared/flow-band.ts`) remain the default.
9. **Separate contracts.** New endpoints (`/api/river-map/frame`,
   `/api/river-map/stations`) and their own preference key, so neither the iOS
   `/api/gauges/points` wire format nor the planner's layer choices move.

## Consequences

- Frames cost ~1.7 MB each before TOAST compression; about 264 rows at steady
  state. Measure the real row size after deploy (open gate in
  `missouri-float-planner/docs/national-river-map.md`).
- Regional geometry is the 1:1M series. Finer, region-by-region hydrography
  (3DHP/NHDPlus HR) is a later change to the geometry build, not to the renderer.
- Frame fields can only grow under a version bump; recorded history decodes by
  version, and flood wire codes are never renumbered.
- Geometry assets are versioned by file name (`base.v2.json`); a field change
  bumps the version so a cached body never meets a newer decoder.

Details, data rules, coverage and verification gates:
[`missouri-float-planner/docs/national-river-map.md`](../../missouri-float-planner/docs/national-river-map.md).
