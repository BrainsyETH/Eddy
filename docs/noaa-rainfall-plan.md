# Rain upstream: rainfall in Eddy's existing charts

Status: **proposed, revised after owner review on 2026-11-11**. This document
and the design prototype are the deliverables. No rainfall pipeline, production
migration, app feature, or release is implemented by this revision.

## Agreed direction

- Add watershed rainfall to the existing shared charting on web and iOS.
- Make rainfall easy to find, easy to read, and filterable.
- Keep the current river-page order and compact chart footprint. There is no
  standalone Rain upstream card or extra web row above Will it hold?.
- Use short, human language. Show facts; do not claim rain is arriving or has
  passed based on an assumed lag.
- Resolve units, incomplete coverage, forecast geography, and map delivery
  before shipping. Missing data must never become zero rain.

The original private Claude canvas remains an unverified reference; it requires
sign-in and was not visually inspected in this review. The revised, self-contained
prototype is [Eddy-Rain-Upstream-Mockup.html](../design/rain-upstream/Eddy-Rain-Upstream-Mockup.html).
Open the downloaded HTML in a browser; it needs no account or external assets.
The prototype reuses repository fonts and Eddy art. All readings, rainfall,
condition bands, and forecasts in it are illustrative. It is an HTML design
prototype, not a native-device verification or a live river report.

## Product layout

The sequence remains current conditions → chart → Will it hold? → Eddy's Read.
Each surface has one job:

| Surface | Rainfall's role |
| --- | --- |
| Compact chart | A short Rain upstream entry in existing chart chrome, opening the expanded chart with rain selected; no new card |
| Expanded chart | A labelled rain track, shared time axis and selection with the river line; Rain upstream can be turned on/off |
| Will it hold? | Forecast amounts explicitly labelled Upstream rain, distinct from local rain chance |
| Eddy's Read | At most one useful factual rain sentence when it changes the story |
| Rain details | 6 h / 24 h / 72 h totals, watershed map, spatial variation, forecast and source detail |

### Compact chart and expansion

The initial design places the full rainfall track in the existing expanded
chart. Tapping Rain upstream opens that chart and enables the layer; the label
and accessibility hint must make that action clear. The expanded view exposes
a direct Rain upstream switch, also represented in the existing Compare menu.
Do not rename or reorganize unrelated chart controls in this feature.

Do not add the original 44 pt track above the compact iOS plot: that grows the
page or reduces the current 208 pt water plot by about a fifth. Reuse the chart's
existing metadata/control area for the compact entry; measure against a current
baseline. If that entry cannot fit at a narrow width without losing current
information, expose it through the existing Compare control rather than adding
a row. The entry must not displace thresholds, the current reading, freshness,
or accessibility content. Automatic inline rain bars remain outside the initial
design unless a later side-by-side review demonstrates an equally readable fit.

- In expansion, reserve a stable rain-track slot while the layer is off so the
  river plot, axes and readout do not jump when it is toggled.
- Preserve at least the current compact water-plot height where viewport space
  permits. In short landscape / large-text layouts use a scrollable expanded
  surface rather than shrinking labels or clipping the gauge plot.
- Default the layer on for a newly opened recent view when the user entered via
  Rain upstream. Explicit on/off choice survives refresh, unit changes and
  fullscreen transitions. Longer history and custom dates do not auto-enable it.
- Rainfall works with both feet and cfs. It has its own inches scale; it never
  changes the water value domain, condition colors, or official flood references.
- One cursor aligns the hourly rain interval with the river reading. It must
  label the rain interval and observation/forecast identity, not invent an
  instantaneous rainfall value at the gauge timestamp.
- Use the existing rain palette and Eddy weather art. Amount bands have their
  own definitions; do not apply rain-probability thresholds to inch totals.
- Solid bars mean radar estimates; outlined/hatched bars mean rainfall forecast.
  Include text labels so neither color nor tiny dashes carry the distinction alone.

### Details and forecast

Rain details open using the existing sheet/fullscreen navigation patterns. The
watershed is defined once: “The land that drains to this gauge.” Its map stays
out of the default river page. Show the selected gauge and upstream boundary,
a labelled accumulation window, an inches legend, and a rain-through time.
Follow existing public-land outline rules without making the boundary look like
a route, water edge, or hazard. The prototype does not invent a watershed map;
real, reviewed geometry and raster delivery are a data-phase gate.

Will it hold? keeps local weather's location label. Upstream forecast amount
gets a separate “Upstream rain” label, with source/area explanation in details.
Do not present OpenWeather's local probability and NWS's basin estimate as one
combined forecast. If adding amounts forces the compact outlook to grow at the
supported default sizes, keep amounts in rain details until a revised fit is
reviewed. Leave the existing weather card intact.

### Copy contract

| Situation | Compact wording | Qualification |
| --- | --- | --- |
| Recent rain | “0.82 in avg · past 24h” | Under Rain upstream; sample only |
| Little rain across the basin | “Little rain overall · past 72h” | Only with fresh, sufficient spatial/temporal coverage; do not hide a validated localized event |
| Radar cannot be refreshed | “Rain data delayed” | Last valid time and amount available in details |
| Some coverage missing | “Some rain data missing” | Never show a complete total or a dry conclusion |
| No usable data | “Rain data unavailable” | Preserve the rest of the chart |
| Fresh rain and a fresh steady gauge | “Rain fell upstream overnight. The river is still steady.” | Use only when both statements are supported |
| Rain forecast | “Rain is forecast upstream.” | Conditional amount in the forecast surface, no promised river rise |

Say “radar estimate,” “average,” and the time window wherever an amount could be
misread. Prefer “Rain through 7 AM” over a fetch-time “Updated 7:04 AM.” Forecasts
have a separate issued time. Use the station's timezone and a visible zone when
needed. Reserve “no measurable rain” for a source that actually establishes it;
a low watershed average alone does not.

## Current code and remaining independent fix

- `src/lib/weather/openweather.ts` still assigns precipitation probability / 100
  to `forecastRainToday`, described as inches. Remove that field and its prompt
  use, and audit all callers. Missing rainfall amounts remain unknown.
- The original plan's AHPS migration task is stale against current `main`:
  `/api/rivers/[slug]/outlook` and `/api/usgs/mo-forecast` already call
  `fetchNwsForecastStages` from `src/lib/nws/forecast.ts`. Preserve that work,
  verify the branch against main before implementation, and do not recreate it.
- `gauge_readings` already stores gauge history. `gauge_stations` stores
  drainage area and HUC, not a basin polygon.
- Hand-written river rain lag exists for some rivers; it is not sufficient
  evidence for a gauge-specific arrival/passed classification.
- The two renderers already share chart meaning in
  `missouri-float-planner/shared/`. Rain must extend that shared logic.

Paths starting `src/`, `supabase/`, or ingestion `scripts/` below are relative
to `missouri-float-planner/` unless a repository-root prefix is shown.

## Scope and earlier investigation

The original investigation reported 28 active rivers and 54 curated gauges:
17 on rain-driven rivers, 32 on spring-fed rivers, and 5 on dam tailwaters.
Fifty had USGS IDs; all returned an NLDI polygon. Of 49 with stored drainage
area, 47 reportedly matched within 5.5%. These are recorded prior results,
not measurements rerun during this design revision. Save reproducible evidence
and refresh the inventory in phase 2.

| Basin needing review | Previously reported result | Gate |
| --- | --- | --- |
| Big Piney near Houston | 159 vs 251 sq mi | Check site ID, pour point, boundary and source area |
| Niangua at Windyville | 337 vs 377 sq mi | Same review |
| Elk River at Noel | 801 sq mi, no stored comparator | Missing comparator is unreviewed, not automatic approval |

Quarantine questionable gauges individually; correctly validated gauges can
proceed. Record review evidence and reviewer/date. Similar area alone does not
prove the boundary is correct. Surface drainage also does not fully describe
spring recharge; use the existing spring caveats in details and avoid causal
claims about steady spring-fed water.

Exclude dam-controlled gauges/reaches, including the Black below Clearwater,
through one shared server eligibility rule. Selection of a different gauge must
change the polygon, totals, history, outlook and Read together. Keep the
exclusion scoped to the actual controlled water, not the entire river name.

Out of scope: national-map rainfall for non-curated gauges, push alerts, social
use, snowmelt, predicted gauge heights and rain-to-rise countdowns. Free rainfall
facts with the existing premium Read remains the recommended tiering; no new
paywall is introduced by this design. Alerts remain a separate future design.

## Sources and verification gates

| Need | Source |
| --- | --- |
| Upstream polygon | USGS NLDI `api.water.usgs.gov/nldi/linked-data/nwissite/USGS-{id}/basin` |
| Estimated rain | NOAA MRMS `mapservices.weather.noaa.gov/raster/rest/services/obs/mrms_qpe/ImageServer` |
| Forecast amounts | NWS `api.weather.gov/gridpoints/{office}/{x},{y}` quantitativePrecipitation |
| Independent areal comparison | NOAA RFC gauge-corrected estimate, with matched spatial/temporal support |
| Point comparison | USGS parameter 00045 at the reportedly 13 co-located sites |

The original investigation found a unit discrepancy: service text says inches
while returned statistics appeared to be millimetres. Do not resolve this by
assuming one fixed conversion from one storm.

Before any public amount or Read input:

1. Record the exact raster/subset, rendering rule, pixel size, coordinate system,
   accumulation window, valid-end time, native units and conversion path.
2. Verify dry and wet cases against the underlying product and an independent
   source with the same time window. Compare point rain to the matching radar
   cell, not directly to the watershed mean as if they measure the same area.
3. Mask missing/no-coverage pixels before aggregation. Record valid and expected
   coverage, not just a positive cell count. Use an area-weighted basin mean;
   account for pixel projection and boundary weighting explicitly.
4. Pin request/response fixtures and conversion tests. Add runtime metadata,
   coverage and sanity checks plus periodic live cross-checks. A fixture alone
   cannot detect a provider changing its live units. Quarantine suspicious data.
5. Set spatial/temporal completeness thresholds in code with documented evidence
   before release. Until then, incomplete coverage cannot support a quiet state,
   a complete total, or Read interpretation.

NOAA references:
- [Image service and timestamps](https://mapservices.weather.noaa.gov/raster/rest/services/obs/mrms_qpe/ImageServer)
- [Raster/renderer selection](https://www.weather.gov/gis/mrms_data_quick_tutorial)
- [MRMS units and missing/no-coverage codes](https://www.nssl.noaa.gov/projects/mrms/operational/tables.php)
- [NWS interval and unit contract](https://github.com/weather-gov/api/blob/master/gridpoints.md)
- [NWS grid mapping refresh](https://www.weather.gov/documentation/services-web-api)

### Forecast sampling

Use representative, area-weighted samples within each basin. Nine is an initial
budget, not evidence of accuracy for all basin shapes and sizes. Validate against
a denser reference sample before choosing a cap. Store sample location, mapped
grid cell, represented weight and mapping date. Deduplicate HTTP fetches while
retaining each basin's weights. Periodically refresh `/points` mappings.

Read `uom` and each `validTime` interval. Do not assume all periods are six hours,
fill nulls with zero, duplicate accumulations, or invent hourly storm timing.
Any proration across day boundaries must be documented as an approximation.
Return coverage for the next 72 hours; a partly covered forecast is not a full
72-hour total. Forecast age is independent of observation age. Publish the
sampling approximation in details as “Upstream forecast estimate.”

## Data contract

Finalize the migration after the source verification, with one ledger entry
under `[pending]` and the production-recorded version reconciled after apply.
Use the existing server-only RLS/grant pattern. Suggested storage:

- Basin metadata on `gauge_stations` or a companion versioned table: full
  MultiPolygon geometry, simplified display geometry, computed area, source,
  fetched date, review status/evidence, and forecast sample weights/mappings.
- Rain observations keyed by gauge + basin version + accumulation window +
  valid-end time. Each window keeps its own time, amount, quality/coverage,
  product identity and fetched time. Do not force four independently refreshed
  products into one falsely synchronized row.
- Keep enough precision for aggregation; round only for display. Store source
  6/24/72-hour estimates separately from hourly sums.
- Forecast runs keep issued time and interval start/end, amount, weights and
  coverage. Replace the current run atomically only after validation; keep
  provenance sufficient to reproduce a displayed forecast.
- Retain hourly rainfall for later analysis. Missing hours stay explicit. Daily
  sums have interval counts/durations and completeness in the station timezone,
  including 23/25-hour DST days. Never sum overlapping rolling totals.

Public shape (design contract; finalize names with existing types):

```ts
type RainQuality = 'ok' | 'partial' | 'stale' | 'unavailable';
interface RainPeriod {
  start: string;
  end: string;
  amountIn: number | null;
  quality: RainQuality;
  coverageFraction: number | null;
  kind: 'radar_estimate' | 'forecast';
  issuedAt?: string;
}
interface BasinRain {
  gaugeSiteId: string;
  basinVersion: string;
  basinAreaSqmi: number;
  observations: { past6h: RainPeriod; past24h: RainPeriod; past72h: RainPeriod };
  forecast72h: RainPeriod;
  spatialVariation: {
    quality: RainQuality;
    wettest24hIn: number | null;
    wetAreaFraction: number | null;
  };
  summary: { kind: 'recent' | 'quiet' | 'forecast' | 'partial' | 'stale' | 'unavailable'; text: string };
  detailsUrl: string;
  attribution: string;
}
```

Ineligible gauges use `basinRain: null`. Eligible gauges with an outage retain
an explicit unavailable/partial state. Do not erase eligibility because a
provider failed. Forecast and observed rain remain independent facts; a dry
observation cannot swallow a meaningful forecast branch.

## Pipeline and API

Backfill `scripts/fetch-gauge-basins.ts` is dry-run by default and uses
`getScriptClient({ script, write })` / `EXPECTED_SUPABASE_REF`. Save a review
manifest and overlay for each flagged basin. A >10% area mismatch or missing
comparator holds that basin pending documented review; no blanket approval.
Add the importer to `docs/data-pipeline.md`.

Proposed hourly `/api/cron/sync-basin-rainfall` at `10 * * * *`: check the current
cron inventory first. Use `hasValidMachineBearer`, `withJobRun`, `trackedFetch`,
timeouts, bounded concurrency, retry/backoff and a job deadline. Follow existing
`vercel.json`, expected-jobs and admin label registration conventions. Reuse
provider `nws` with distinct operations. Failed gauges/windows do not overwrite
good data or block other gauges. Poll/validate source timestamps independently
and upsert idempotently. A late product is not labelled as the current hour.

Forecast refresh every three hours is a starting cadence. Bound its distinct
cell workload separately from the roughly 200 observed requests/run. Fetch and
cache cells once per run; do not duplicate overlapping-basin calls. Atomic
forecast replacement prevents an empty interval between delete and insert.

Trust checks cover per-gauge/window observation freshness (initial warning at
3 h, high at 12 h), forecast issue age/valid coverage, missing approved basins,
invalid units/values and insufficient coverage. Register checks, severities and
remediation with the existing trust system. A fresh 1 h product cannot hide a
stale 72 h product. Suppress Read input when its required facts are stale.

| Route | Addition |
| --- | --- |
| `/api/gauges/[siteId]` | Lightweight BasinRain summary; no full polygon/raster in routine responses |
| `/api/gauges/[siteId]/history` | RainPeriod series for the requested actual window, with coverage and availability start |
| `/api/rivers/[slug]/outlook?gaugeId=...` | Explicit upstream rainfall forecast amounts for the selected gauge |
| `/api/gauges/[siteId]/rain` (lazy detail) | Simplified reviewed GeoJSON, basin version, window metadata, legend and raster descriptor |

The detail route is deliberate: the previous “no new endpoint” constraint did
not provide a map contract. Its raster descriptor must name the real approved
NOAA product, selected accumulation interval, timestamp, units, bounds and
tile/export mechanism. Decide clipping, caching and licensing/attribution in
phase 2. If the raster is absent or a historical image cannot be retrieved,
show boundary-only with “Rain map unavailable for this time.” Never drape the
latest rainfall under historical totals. The current NOAA image service is not
time-enabled; historical raster support needs its own archive strategy.

Include no-data rendering, map/total version consistency, maximum geometry size
and simplification tolerance in the detail contract. Raster loading happens on
demand and cannot slow a current reading or ordinary chart request. Offline
bundles stay unchanged; no offline state is presented as current rainfall.

## Shared chart implementation

Extend shared chart-model/chart-view plus the versioned chart-share contract
before editing renderers. The shared layer owns interval clipping, timezone
bucketing, gaps, rain/forecast identity, axis alignment and accessible readout.
Update the existing web `GaugeHistoryChart` controller, `FlowTrendChart`, native
`GaugeChart`, details, fullscreen and hooks. Do not create a second rain chart
with independent range/zoom state.

- Keep official river-stage forecasts distinct from rainfall forecasts.
- Past custom dates contain only rain available for that interval; never append
  today's forecast to a past window. Define long-range/no-history behavior.
- Hourly bars for short windows; complete daily totals for longer windows, with
  partial-day markers and actual interval widths. Do not imply pre-collection
  history exists.
- Preserve rain selection in share links/exports or explicitly state when a
  receiving client cannot reproduce it. Current share layers reject unknown
  values and have ft restrictions; extend deliberately with compatibility tests.
- Shared cursor, keyboard/VoiceOver navigation and accessible table provide
  amount, window, coverage and source identity. No tiny-bar-only tap targets.
- Required API additions stay backward compatible with installed mobile clients.
  Mirror types in `packages/eddy-types`, OpenAPI and contract fixtures.
- Summary/history cache keys include selected gauge and required basin/product
  version. Rapid gauge switching must never flash the previous basin's rain.

## Eddy's Read

V1 supplies independently validated observed-rain, forecast-rain and gauge-trend
facts. Code chooses allowed statements. No `arriving` / `passed` enum, no timing
countdown and no implied safe-to-float verdict from rainfall. Existing hand-set
lag does not unlock that wording.

Qualitative amount bands must be defined per accumulation window and reviewed
against fixtures before terms like “heavy” ship. Do not equate heavy over 72 h
with heavy in 1 h, or assume small basin area alone determines response.

Example input: fresh recent rain; fresh steady river; forecast unavailable.
Allowed: “Rain fell upstream overnight. The river is still steady.”
Not allowed: “The rise will arrive in four hours” or “The rain has passed.”
Keep one useful rain sentence within the current Read budget. Drop it when it
adds nothing. Preserve existing premium/free boundaries and source attribution.

Extend the existing fact gate for missing/stale facts, unsupported rainfall
amounts or units, causal/arrival claims and contradictions with observed trend.
Apply the same contract to primary and secondary-gauge Reads. The existing
factual fallback remains the failure path. A prompt instruction alone is not
the gate.

Read activation stays off until public data is inspectable and replay cases
pass. Replays need archived, timestamp-matched fixtures from at least five
storms and five dry spells across representative river types, plus outages,
localized rain, missing lag and multiple storms. Do not assume one week of new
collection will contain those storms. Record provenance and limits of fixtures.

## Delivery phases

| # | Deliverable | Release/verification gate |
| --- | --- | --- |
| 0 | This revised plan and accessible prototype | Review compact fit, rain on/off, all data states, narrow/large text and dark appearance |
| 1 | Probability-as-inches fix | Audit callers; `make check-web`; preserve existing NWPS migration |
| 2 | Source validation, basin review, storage, collection, trust, map contract | Reproducible source checks; dry run; migration ledger; `make check-db` after authorized apply; evidence of reliable operation |
| 3 | Shared contracts/model and web chart integration | `make check-web`; API/share compatibility; baseline layout/interaction checks; public feature flag off until verified |
| 4 | iOS chart/detail integration | `make check-mobile`, `make bundle-mobile`, `make check-web`; real-device light/dark/large text and installed-client compatibility |
| 5 | Factual Read integration | Storm/dry/outage replay and fact-gate checks; enable only after public data surfaces can be inspected |
| 6 | Measured response research, separate future proposal | Event definitions, quality exclusions, validation on held-out storms and uncertainty before any arrival wording is considered |

Each implementation phase is its own PR. Phase 0 does not authorize production
writes or deployments. Phase 2 adds an ADR using the next available number
(the original plan proposed 0020; check for collisions). Register new test files
in the explicit web test script. Treat implemented, device-verified and released
as separate statuses.

### Acceptance checks

- Compare baseline river screen against rain on/off at 320/375/390 px and web
  mobile/desktop. At default text size the chart/outlook/Read section anchors
  must not move because rain is toggled or data arrives. No new standalone card.
- Preserve reading size, threshold labels, forecast identity and the water plot.
  Large text may reflow naturally for accessibility; never enforce fixed boxes
  that clip it. Match on/off geometry at each supported text size.
- Exercise recent rain, quiet, forecast-only, partial, stale, unavailable,
  excluded tailwater, unknown basin, localized rain and gauge-switch races.
- Verify rain toggle, range, ft/cfs, zoom, fullscreen, shared selection, share
  link, accessible data and back navigation on both clients.
- No provider outage blocks the gauge line, weather or Read fetch. No missing
  cell/hour becomes zero. No old forecast masquerades as a fresh observation.
- No Read claims future rise, completed response, numerical stage prediction,
  or a safe condition based on rainfall.

## Costs and unresolved evidence

Observed load is about 4,800 requests/day at 50 gauges × 4 windows × 24 runs,
before exclusions and retries. Nine forecast cells per gauge is up to 450
distinct cells per refresh (3,600 requests/day at an eight-run cadence), before
deduplication; the earlier “few hundred” estimate is not established. Measure
the actual cells, response sizes, retries and tail latency before sizing the job.

The revised per-window schema may produce about 1.75 million observation rows
per year at that upper scope, plus forecasts and indexes. Measure storage rather
than retaining the original under-100-MB claim. Public NOAA sources require no
new vendor key, but compute, database, caching and raster delivery still cost.

Still to establish during implementation: validated unit path, coverage policy,
sampling accuracy, three basin reviews, raster delivery, archived storm fixtures,
and device-level readability. None is presented as already solved by this plan.
