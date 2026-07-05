# /missouri-surface-water — Observatory build memo

Design + engineering memo for the showcase rebuild ("mission-control
observatory for Missouri water"). Written before feature code per the
build method: recon → scope decision → approach → phased build.

## 1. Recon findings (what the codebase actually is)

- **Map stack is MapLibre GL, not Mapbox GL.** `maplibre-gl` is the only
  GL dependency (used by `/rivers` hub maps via `MapContainer.tsx` with
  openfreemap/carto raster+vector sources). `src/lib/mapbox/directions.ts`
  is only the Directions API for shuttle routing. There is **no Mapbox
  token or Mapbox host in the CSP** (`next.config.mjs` allows
  openfreemap / cartocdn / osm / arcgis tile hosts only).
- **This page already ships a deliberate tile-free map.**
  `MOMap.tsx` renders real Supabase/PostGIS geometry through a custom
  equal-area-ish projection into a 1600×1000 SVG viewBox. The in-code
  rationale: it sidesteps the CSP/glyph/style-validation surface GL
  basemaps bring for a single-purpose statewide view.
- **USGS integration is already modern.** `src/lib/flow-providers/usgs.ts`
  targets `api.waterdata.usgs.gov` (OGC) with a legacy
  `waterservices.usgs.gov` fallback; `src/lib/usgs/gauges.ts` is a
  back-compat facade. Reused as-is for curated gauges.
- **Taxonomy source of truth** is `shared/condition-system.ts` (seven
  `ConditionCode`s with canonical hex, chip inks, labels). All condition
  paint on this page already derives from it.
- **Design tokens** live in `tailwind.config.ts` + `.stitch/DESIGN.md`
  (Organic Brutalist: primary deep-river teal 900 `#0F2D35`, accent
  sunset coral `#F07052`, parchment `#F2EAD8`, hard offset shadows,
  2px borders, Geist + Geist Mono + Fredoka display).
- **PostGIS dataset** arrives via `get_mo_surface_water_dataset()` RPC:
  8 curated rivers (LineString geometry), per-river gauges with
  editorial thresholds + NWS flood stages, access points, POIs.
- **AWS terrarium elevation tiles are fetchable at build time**
  (`s3.amazonaws.com/elevation-tiles-prod`) — which enables *baked*
  terrain relief with zero runtime tile cost.

## 2. Map-technology decision (stated, not silent)

**Level up the existing custom-projection, tile-free map. Do not swap to
a GL basemap with runtime terrain tiles.**

Why, in priority order:

1. **Rural / weak-signal users are a stated top constraint.** This map
   ships as bundled geometry + one baked hillshade raster (~250 KB).
   A GL globe+terrain page costs megabytes of style, glyph, vector and
   DEM tiles on first paint — the users most likely to need river
   conditions are the least able to pay that.
2. **The repo already made this call** for this exact page, documented
   in-code, after trying the GL route (CSP/style surface). Re-litigating
   it inside a showcase build would be a regression in reliability.
3. **No Mapbox account/token exists** in this project; globe projection
   and mapbox-dem are Mapbox-service features. MapLibre could do 3D
   terrain with terrarium tiles, but at the runtime tile cost of (1).
4. **Every "wow" element in the brief is achievable on the custom map**
   — cinematic camera choreography (animated viewBox), real terrain
   relief (baked hillshade from real DEM), glowing magnitude-encoded
   nodes, and the particle flow layer (canvas over the projected
   polylines, the same technique nullschool uses minus the tile
   dependency).

**Tradeoff accepted:** no true 3D tilt / globe sphere. Compensation: a
high-altitude cosmic entry (starfield + scale choreography), real
hillshade relief baked from SRTM-derived terrarium DEM, and atmospheric
depth. If the product later wants literal 3D, the upgrade path is
MapLibre + terrarium DEM on this same dataset — noted in the punch list.

## 3. Data scope decision

**Curated-emphasized within statewide context.**

- **Curated layer (the product):** the 8 curated rivers and their ~10
  bound gauges, painted with the seven-level taxonomy, animated flow,
  detail rail, forecast-aware flood override. Live via the existing
  provider (`/api/usgs/mo-statewide`, 15-min refresh).
- **Context layer (the observatory):** all active Missouri stream
  gauges with a current discharge reading, rendered as **neutral**
  glowing nodes — size encodes discharge (sqrt scale), color is a
  single neutral teal, **no condition dressing** (they carry no curated
  thresholds, and dressing them up would be dishonest). One new route
  `/api/usgs/mo-sites` calls the modern OGC API (one
  `monitoring-locations` request + one `latest-continuous` request,
  server-cached 15 min — no rate concerns; Missouri has roughly 400–550
  active stream sites). Render ceiling 600 nodes; if exceeded, keep the
  highest-discharge sites (stated in the HUD as "top N by flow").
- Context fetch failure degrades to curated-only silently-visible
  (HUD shows "context sites unavailable") — never a broken map.

## 4. Design approach

**Brutalist chrome over a cosmic water map.** Deep near-black
(#040D12→#071A20) canvas with a seeded starfield; the state reads as a
lit landmass — parchment interior kept (it *is* the brand's map voice)
but deepened with real hillshade relief and a stronger night-water
vignette; rivers glow in taxonomy color with comet particles running
downstream; HUD panels are hard-edged, mono-numeraled, thick-ruled.

### Camera choreography (entry, one-shot)

1. `t=0` — black; starfield fades in; state silhouette at high altitude
   (viewBox ≈ 1.4× home, slightly north-biased) — ~0.5 s.
2. `t=0.5–2.4 s` — single ease (cubic in-out) fly-down to home framing
   while hillshade + basemap fade up and curated rivers draw in.
3. `t≈2.0 s` — HUD panels slide in, headline numbers count up, gauge
   nodes pop in with a stagger.

Skippable on any pointer/key input (jumps to composed end state).
`prefers-reduced-motion` ⇒ no animation at all: static end state,
counters at value. Session-scoped: replays only on a fresh load, and
never re-runs on client nav back/forward within a session.

### Encoding scheme

| Channel | Meaning |
|---|---|
| Node size (sqrt of cfs) | Discharge magnitude (curated + context) |
| Node color | Taxonomy condition (curated only); neutral teal (context) |
| Node pulse | Live + elevated (high/dangerous or ≥P75) |
| River line color | Taxonomy condition, gradient between gauges |
| Particle speed | Condition band (too_low ≈ still → dangerous ≈ sprint) |
| Particle direction | Downstream (real geometry order) |
| Text labels | Condition label always accompanies color (never color alone) |

### Performance / motion budget (committed)

- **60 fps target on interaction** on a mid-tier device; measured with
  a scripted pan/zoom + rAF sampler before ship. Report actuals.
- **Flow layer:** ≤ 700 particles desktop, ≤ 300 on small screens or
  `hardwareConcurrency < 4` / `deviceMemory < 4`; one canvas, one rAF,
  `dt` clamped; paused when tab hidden, when toggled off, and under
  reduced motion. If the measured cost breaks the frame budget, the
  layer auto-degrades (halve particles) before it ever drops the map
  below target.
- **Node ceiling:** 600 context nodes rendered (decimate by discharge);
  markers stay SVG (cheap at this count — no per-frame React work).
- **Starfield:** static seeded canvas, redrawn only on resize/camera
  settle — not per frame.
- **Assets:** hillshade raster ~250 KB, lazy below the fold of nothing
  (it's the page) but `loading="eager"` only for itself; no runtime
  tile fetches at all.
- **Entry animation:** ≤ 2.6 s, main-thread-light (viewBox interpolation
  only), never blocks data fetch (fires in parallel).

### Accessibility & honesty commitments

- Condition = swatch + text label everywhere (rows, chips, cards, rail).
- Gauge nodes keyboard-focusable (`tabindex`, Enter opens detail).
- Toggles are real buttons with `aria-pressed`.
- Data age shown on every reading (relative time); >2 h flagged STALE;
  context sites' timestamps shown; nothing interpolated, ever.
- Fetch failure ⇒ last-known snapshot from localStorage with an
  explicit STALE banner + timestamp, plus retry.

## 5. Phase plan

P1 foundation (cosmic canvas, baked hillshade, entry camera) →
P2 data spine (node encoding, context sites, data age) →
P3 flow layer (prototype, measure, keep/cut) →
P4 HUD (aggregates, distribution, toggles) →
P5 atmosphere (starfield, glow, grain) →
P6 hardening (perf numbers, a11y, mobile, degraded states).
One commit per phase boundary.

## 6. Measured results (P6, software-rendered headless Chromium — no GPU)

| Metric | Budget | Measured |
|---|---|---|
| Idle FPS, flow on, state view | 60 | **60** |
| Idle FPS, flow on, zoomed | 60 | **60** |
| FPS during continuous drag-pan | ~60 | **47** (whole-SVG reraster per viewBox frame under software rendering; GPU compositing in real browsers raises this — re-measure on hardware before further optimizing) |
| Mobile-viewport idle FPS, flow on | 60 | **60** |
| SVG element count (10 curated + 480 context nodes) | ≤ ~4000 | **3,164** |
| Flow particles | ≤700 desktop / ≤300 small | 700 / 300, self-degrading (floor 120) |
| Hillshade asset | < 400 KB | **550 KB** — kept above the letter of the budget: it is the page's ONLY raster, replaces megabytes of runtime tiles, and relief quality at 1120×700 was judged worth +150 KB. Revisit with AVIF if it matters. |
| Keyboard | gauges tabbable | Tab → gauge (aria-label carries condition + reading), Enter opens rail, Escape backs out |
| Offline | no broken map | localStorage snapshot + amber OFFLINE banner with timestamp + retry; STALE chips on readings >2 h |
