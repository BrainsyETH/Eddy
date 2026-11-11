# Rain upstream: NOAA rainfall over each gauge's watershed

Status: **proposed**. Nothing here is implemented. Written 2026-11-11.

Design mockup (a private canvas, not in this repository; ask the owner for
access): the "Eddy Rain Upstream Mockup" canvas has four boards: the iOS
river screen after a storm, the iOS rain detail screen, the iOS quiet-day
state, and the web Live report. It uses illustrative sample data. Exports go
into `design/rain-upstream/` before phase 4 starts.

## Goal

Eddy tells a floater what the river is doing now. It cannot yet say what is
about to arrive, because it does not know how much rain fell on the land that
drains to a gauge. This plan adds that one fact, measured the way NWS river
forecasters measure it (rain averaged over the watershed above the gauge), and
uses it in three places:

1. **Rain upstream, as data.** How much rain fell over the watershed above the
   selected gauge in the past 6, 24 and 72 hours, and how much is forecast.
   Free, like the gauge reading.
2. **Rain on the gauge chart.** Hourly rain bars on the same time axis as the
   gauge line, so "it rained, then it rose" is visible.
3. **Rain in Eddy's Read.** The Read may say that rain fell upstream and
   whether it has likely reached this gauge. It stays qualitative and never
   predicts a level.

Out of scope for v1: rain-triggered push alerts, rainfall on the national
river map (the ~14,300 non-curated gauges), social-post use, snowmelt, and
any predicted gauge height.

## What the code does today

- **Rain is a point sample.** `generateEddyUpdate` fetches OpenWeather at one
  weather point per river (`src/lib/eddy/generate-update.ts:164`) and passes
  the last 1 h / 3 h of rain at that point plus a rain-chance percentage.
- **One prompt line is wrong.** `fetchPrecipitationFromWeather` divides
  today's rain *probability* by 100 (`src/lib/weather/openweather.ts:255`) and
  the prompt prints it as inches (`generate-update.ts:493`). A 70% chance
  reaches the model as "Today's forecast rain: 0.7 in".
- **Rain lag is a hand-written number.** `river_characteristics.rain_lag_hours`
  is set for 8 rivers; the deprecated map in `src/lib/eddy/rain-lag.ts` covers
  one more (Gasconade). All nine are spring-fed. None of the 10 rain-driven
  rivers has one.
- **The river forecast in "Will it hold?" uses a retired host.** The outlook
  route calls `fetchAhpsForecast` (`src/app/api/rivers/[slug]/outlook/route.ts:376`),
  which reads `water.weather.gov/ahps2`. `src/lib/nws/forecast.ts` documents
  that host as dead and already implements the NWPS replacement, which the
  gauge history route uses. The only other caller is
  `src/app/api/usgs/mo-forecast/route.ts`.
- **Stored gauge history exists.** `gauge_readings` is written by
  `update-gauges` hourly (every 15 minutes for fast gauges). That is the series
  rainfall will be correlated with.
- **No watershed geometry is stored.** `gauge_stations` has
  `drainage_area_sqmi` and `huc`, and no polygon.
- **The UI names differ from the prompt.** The prompt calls the outlook panel
  "Watch for". Users see it as **"Will it hold?"**, and the Read's forecast
  paragraph is labelled **"WEATHER"**. This plan uses the user-facing names.

## What was verified on 2026-11-11

Every claim below was run against the live services from a development
session, using the 50 production gauges that carry a USGS site ID.

| Check | Result |
| --- | --- |
| Watershed delineation (USGS NLDI `basin`) | 50 of 50 returned a single polygon, about 1 second each |
| Delineated area vs stored `drainage_area_sqmi` | 47 of 49 within 5.5%; 42 within 2% |
| Area outliers needing review | Big Piney near Houston (159 vs 251 sq mi, -37%); Niangua at Windyville (337 vs 377, -11%) |
| Missing stored area | Elk River at Noel has none; NLDI gives 801 sq mi |
| Basin-average rainfall (NOAA MRMS image service, polygon statistics) | 150 requests (50 basins, 3 windows) all succeeded in 6.7 s total; largest polygon 1,642 vertices and 121,761 cells |
| MRMS units | Service text says inches; values behave as **millimetres** (a wet basin returned 26.8 for 24 h; a second source put the same days near 1 inch each) |
| Rainfall forecast (`api.weather.gov` gridpoints) | `quantitativePrecipitation` returned 6-hourly amounts in mm for the Ozarks grid cell |
| Co-located USGS rain gauges (parameter 00045) | 13 of the 50 sites report rain, mostly in Arkansas |

Two things follow. The delineation is good enough to trust with an automatic
area check and a manual review list of three. The MRMS unit must be pinned by
a test before any number is shown.

## Scope

28 active rivers, 54 curated gauges (production count, 2026-11-11).

| River type | Rivers | Gauges | Gauges that can get a watershed | Treatment |
| --- | --- | --- | --- | --- |
| `rain_flashy` | 10 | 17 | 17 | Full feature |
| `spring_fed_float` | 15 | 32 | 31 | Full feature, with the spring caveat where the notes support it |
| `dam_tailwater` | 3 | 5 | 2 | Off. Releases set the level |

The four gauges without a watershed are Army Corps dam gauges with no USGS
site ID. The Black below Clearwater Dam is a tailwater *section* on a
spring-fed river and is also off.

Six gauges drain more than 2,000 sq mi (the largest is the White at Calico
Rock at 9,980). A single average says little at that size. They show the
heaviest-spot figure beside the average, and the two White River gauges are
off anyway as tailwater.

## Sources

| Need | Source | Endpoint | Auth |
| --- | --- | --- | --- |
| Watershed polygon | USGS NLDI | `api.water.usgs.gov/nldi/linked-data/nwissite/USGS-{id}/basin` | none |
| Observed rain, 1 h to 72 h | NOAA/NWS MRMS radar estimate, 1 km, hourly | `mapservices.weather.noaa.gov/raster/rest/services/obs/mrms_qpe/ImageServer/computeStatisticsHistograms` | none |
| Forecast rain amounts | NWS forecast grid, 2.5 km | `api.weather.gov/gridpoints/{office}/{x},{y}` (`quantitativePrecipitation`) | none; needs a User-Agent |
| Cross-check | NOAA RFC gauge-corrected estimate | `.../obs/rfc_qpe/MapServer` | none |
| Ground truth at 13 gauges | USGS rain gauge, parameter 00045 | existing USGS provider | existing key |

No new vendor, key or fee. OpenWeather stays for temperature, wind and rain
*chance*; it stops being the Read's source of rain *amounts*.

## Decisions

1. **Watershed average, not a point.** A point sample near the take-out can
   read zero while the headwaters got two inches. The watershed mean is the
   standard hydrology input (mean areal precipitation).
2. **Store the polygon once.** NLDI is called by a script, not at request
   time. Watersheds do not change; the hourly job then needs only NOAA.
3. **MRMS for "now", labelled as an estimate.** It updates a few minutes past
   each hour. It is radar-only, so it can over- or under-read, and it can show
   a trace where no rain fell. The UI says "radar estimate" and treats anything
   under 0.05 in as no measurable rain.
4. **Convert mm to inches in one function, pinned by a fixture test** that
   fails if NOAA changes the unit.
5. **Forecast by sampling the NWS grid inside the watershed.** Up to nine
   fixed points per watershed, mapped once to NWS grid cells and de-duplicated
   across gauges. Averaged to a watershed figure. This is coarser than the
   observed product and is labelled "forecast".
6. **Code decides the rain state; the model only phrases it.** A pure function
   classifies each gauge (see *Eddy's Read*). The model never sees raw numbers
   it could misread as a prediction.
7. **Rainfall facts are free. The Read stays premium.** Rain upstream is
   public NOAA data and a safety signal, so it sits with the gauge reading.
   Interpretation stays in the Read under the existing tiering
   (`src/lib/eddy/tiered-prose.ts`).
8. **Rain-to-rise lag starts hand-written and becomes measured.** Fill the 10
   rain-driven rivers by hand for launch, then derive per-gauge lag from stored
   rain and `gauge_readings` once enough storms are recorded.
9. **Never write to production from a development session.** The backfill
   script is dry-run by default and uses `getScriptClient`.

## Data model

One migration, named `YYYYMMDDHHMMSS_gauge_basin_rainfall.sql`, listed under
`[pending]` in `supabase/production-migrations.txt` in the same PR and renamed
to the version production records.

```sql
-- Watershed geometry, fetched once per gauge.
alter table public.gauge_stations
  add column if not exists basin_geom geometry(MultiPolygon, 4326),
  add column if not exists basin_area_sqmi numeric(10,2),
  add column if not exists basin_source text,          -- 'nldi'
  add column if not exists basin_fetched_at timestamptz,
  add column if not exists basin_review text,          -- null | 'area_mismatch' | 'approved'
  add column if not exists basin_qpf_cells jsonb;      -- [{office,x,y}], NWS grid cells inside the basin

-- One row per gauge per hour. rain_1h_in is the chart series; the wider
-- windows are stored as NOAA reports them rather than summed from hours.
create table public.gauge_basin_rainfall (
  gauge_station_id uuid not null references public.gauge_stations(id) on delete cascade,
  valid_at timestamptz not null,          -- end of the hour the estimate covers
  rain_1h_in numeric(6,2), rain_1h_max_in numeric(6,2),
  rain_6h_in numeric(6,2), rain_6h_max_in numeric(6,2),
  rain_24h_in numeric(6,2), rain_24h_max_in numeric(6,2),
  rain_72h_in numeric(6,2), rain_72h_max_in numeric(6,2),
  cell_count integer not null,
  source text not null default 'noaa_mrms',
  fetched_at timestamptz not null default now(),
  primary key (gauge_station_id, valid_at)
);

-- Replaced on every forecast refresh.
create table public.gauge_basin_rain_forecast (
  gauge_station_id uuid not null references public.gauge_stations(id) on delete cascade,
  period_start timestamptz not null,
  period_hours smallint not null,
  rain_in numeric(6,2) not null,          -- mean across sampled grid cells
  rain_max_in numeric(6,2) not null,
  issued_at timestamptz not null,
  primary key (gauge_station_id, period_start)
);

alter table public.gauge_basin_rainfall enable row level security;
revoke all on public.gauge_basin_rainfall from public, anon, authenticated;
grant all on public.gauge_basin_rainfall to service_role;
-- same three lines for gauge_basin_rain_forecast
```

- Server-only, RLS with no policies, the same pattern as
  `lake_pool_readings` (`20261109224918`). Clients read rainfall through the
  API, so `make check-db` stays green.
- Volume: 50 gauges at 24 rows a day is about 440,000 rows a year. Keep it
  all; the history is what phase 6 learns from.
- A later column, `river_gauges.rain_lag_hours_measured`, holds the derived lag.

## Pipeline

**Backfill script: `scripts/fetch-gauge-basins.ts`**

- Dry-run by default, `--apply` to write, client from
  `getScriptClient({ script, write })` so `EXPECTED_SUPABASE_REF` is enforced.
  Do not copy the direct-client pattern in `fetch-drainage-areas.ts`; that file
  is on the shrinking legacy allowlist.
- For each curated gauge with a USGS site ID: fetch the NLDI polygon, compute
  its area, compare with `drainage_area_sqmi`. More than 10% apart sets
  `basin_review = 'area_mismatch'` and the gauge stays out of the feature until
  a person approves it. Expect two on the first run (Big Piney near Houston,
  Niangua at Windyville).
- Sample up to nine points inside the polygon, resolve each through
  `api.weather.gov/points`, store the distinct grid cells.
- Add a row to the "Importers & backfills" table in `docs/data-pipeline.md`.

**Hourly cron: `/api/cron/sync-basin-rainfall`**

- Schedule `10 * * * *`. MRMS posts a few minutes after the hour, and :00,
  :15, :20, :25, :35 and :40 are taken.
- Follows the cron conventions: `hasValidMachineBearer` with `CRON_SECRET`,
  wrapped in `withJobRun('sync-basin-rainfall', ...)`, `maxDuration` 120,
  entries in both the `functions` and `crons` blocks of `vercel.json`, the same
  entry in `src/lib/admin/dashboard/expected-jobs.json`, and a label in
  `overview-model.ts`. `dashboard.test.ts` fails without the first three.
- Per gauge: four polygon-statistics requests (1 h, 6 h, 24 h, 72 h), six
  gauges at a time. About 200 requests, well under 30 seconds at the measured
  0.24 s median.
- Reads the raster's `idp_validendtime` and writes it as `valid_at`, so a
  repeated run upserts the same row and a late NOAA post is not mislabelled.
- Every third hour it also refreshes the forecast table from the stored grid
  cells, one request per distinct cell.
- A failed gauge is skipped and logged; the others still write.
- Calls go through `trackedFetch`. Reuse provider `'nws'` for MRMS and
  gridpoints and `'usgs'` for NLDI with new operation strings; adding a new
  provider touches four files for no gain.
- One shared User-Agent constant for NOAA calls, replacing the two inline
  copies in `src/lib/nws/alerts.ts`.

**Trust checks** (registered in `src/lib/trust/registry.ts`, drained by the
existing `trust-tick`; no new cron slot):

| Check | Cadence | Rule | Severity |
| --- | --- | --- | --- |
| `basin_rainfall_freshness` | hourly | `basin_rainfall_stale`: newest row older than 3 h | medium |
| | | `basin_rainfall_frozen`: older than 12 h | high |
| `basin_coverage` | daily | `basin_missing`: eligible gauge with no approved polygon | low |

Each rule needs its severity in `severity.ts` and remediation text in
`remediation.ts`; `registry.test.ts` and `remediation.test.ts` enforce both.
Model the freshness check on `checks/dam-freshness.ts`.

## API

Rainfall rides on routes the clients already call. No new endpoint.

| Route | Addition |
| --- | --- |
| `GET /api/gauges/[siteId]` | `basinRain` on `GaugeDetail` |
| `GET /api/gauges/[siteId]/history` | `rain` series aligned to the requested range |
| `GET /api/rivers/[slug]/outlook` | `rainAmountIn` on each day; `basinRain` summary for the picked gauge |

```ts
interface BasinRain {
  /** 'ok' | 'stale' (older than 3 h) */
  status: 'ok' | 'stale';
  validAt: string;                 // ISO
  basinAreaSqmi: number;
  past6hIn: number; past24hIn: number; past72hIn: number;
  heaviest24hIn: number;           // wettest cell in the watershed
  /** Next 72 h, watershed mean. Null when the forecast is unavailable. */
  forecast72hIn: number | null;
  /** Hours from rain to a rise at this gauge. Null when not known. */
  lagHours: number | null;
  lagSource: 'local_knowledge' | 'measured' | null;
  /** Decided in code; see Eddy's Read. */
  state: 'none' | 'trace' | 'arriving' | 'passed' | 'forecast_only';
  attribution: string;             // 'Rainfall: NOAA radar estimate'
}
```

- `basinRain` is `null` when the feature does not apply (tailwater, no
  polygon, polygon under review). Clients hide the section; they do not show
  an error.
- History `rain`: `{ t: string; in: number }[]` hourly for 24 h and 7 d,
  summed to daily bars for 30 d and longer, plus `forecast` bars to the right
  of now.
- Mirror every type in `packages/eddy-types/index.ts`, extend
  `src/lib/gauges/openapi.ts` and its fixtures (new fields are required unless
  an explicit required list says otherwise), and keep
  `api-contract-parity.test.ts` and `history-route-contract.test.ts` passing.
- Offline bundles stay unchanged; they deliberately carry no water state.

## Eddy's Read

**Fix first, independent of everything else**

- Remove the probability-as-inches line and the `forecastRainToday` field.
- Move the outlook route and `mo-forecast` from `fetchAhpsForecast` to
  `fetchNwsForecast`, then delete `src/lib/usgs/ahps-forecast.ts`.

**Rain state, decided in code** (`src/lib/eddy/basin-rain-state.ts`, pure, tested):

| State | Rule (first match) | What the Read may say |
| --- | --- | --- |
| `none` | under 0.05 in over 72 h and under 0.1 in forecast | Nothing about rain |
| `trace` | under 0.25 in over 72 h | Nothing, unless the river is Too Low and rain is the story |
| `arriving` | 0.25 in or more inside the lag window, and the gauge has not yet risen to match | Rain fell upstream and is likely still on its way here |
| `passed` | 0.25 in or more in 72 h, lag window elapsed | Recent rain upstream is the likely reason for the change, stated as likely |
| `forecast_only` | dry so far, 0.25 in or more forecast | Conditional: "if the rain forecast for the watershed arrives" |

Thresholds scale down for watersheds under 150 sq mi, which respond to less.
They are constants in one file and are tuned in phase 3 against replayed
storms.

**Prompt block** (replaces `[RECENT PRECIPITATION]` in `buildPrompt`):

```
[RAIN UPSTREAM — watershed above this gauge, 298 sq mi, NOAA radar estimate]
State: arriving
Past 6 h: heavy. Past 24 h: heavy. Past 72 h: heavy.
Heaviest between 9 PM and 2 AM last night.
Typical time for rain to reach this gauge: about 4 hours (local knowledge).
Forecast next 72 h: light.
```

- Amounts are passed as words (none, light, moderate, heavy, very heavy) from
  fixed inch bands, so the Read cannot quote a rainfall number it might get
  wrong and stays inside its existing "leave out rain percentages" rule.
- The static system prompt gains three sentences under *TREND AND FORECAST*:
  what each state permits, that rain upstream is evidence for a rise but never
  proof, and that the block is absent on dam-controlled water. It stays free of
  river-specific values so the cache prefix is unchanged across calls.
- The existing rule "leave the forecast to the panel unless rain is already on
  its way to this gauge" now has data behind it: `arriving` is that case.
- Secondary-gauge Reads (`generate-gauge-update.ts`) get the same block.
- `sources_used` gains `'NOAA rainfall'`.

**Fact gate** (`src/lib/eddy/report-facts.ts`): add `rainState` to
`ReportFactsInput` and one contradiction, `rain-upstream`: the text asserts
rain fell upstream while the state is `none`, or states a rainfall amount in
inches. Either replaces the report with the factual fallback, as the other
contradictions do.

**Rollout**: behind an env flag read once per pass. Before turning it on,
replay at least five recorded storms and five dry spells through the generator
and review the output by hand.

## Where a user sees it

Rain uses the existing rain colour ramp (teal, "sky, not water"), never the
condition colours.

**iOS**

1. **Gauge chart** (`eddy-ios/src/components/GaugeChart.tsx`): a 44 pt rain
   track above the plot on the shared time axis. Solid bars for measured rain,
   hollow dashed bars for forecast, matching the NWS-forecast dash convention.
   Toggled from the existing "Compare" menu, on by default when there is rain
   in range.
2. **Rain upstream card** on the river screen, between the chart and "Will it
   hold?": the 24 h figure, 6 h and 72 h beside it, the heaviest spot, one line
   on lag, and "NOAA radar estimate · Updated 7:04 AM". Collapses to a single
   quiet row when the state is `none`.
3. **Rain detail screen**: the watershed outline on the map with rainfall
   shading, the same totals, the forecast by day, and a plain explanation of
   what a watershed is. The outline follows the public-land layer's styling
   rules: low-alpha fill, thin edge.
4. **"Will it hold?"**: each day shows the forecast amount under the chance,
   for example "Rain 70%" then "0.3 in".
5. **Eddy's Read**: no layout change. The footer becomes "via {gauge} · NOAA
   rainfall" when the Read used it.
6. **Gauge sheet** on the map: a "Rain upstream" row in the About tab.

**Web**

1. `FlowTrendChart`: the same rain track above the line.
2. `WillItHold`: amounts per day.
3. A "Rain upstream" row in the Live report panel above "Will it hold?".
4. `about` page: a NOAA rainfall card in "Data Sources", and a line in
   `llms.txt` "Data Freshness".

**Copy rules**: say "watershed", define it once on the detail screen ("the
land that drains to this gauge"). Say "radar estimate". Never show a number
without its window. Dry is stated plainly: "No measurable rain upstream in the
past 72 hours."

## Phases

| # | Phase | Ships | Validate |
| --- | --- | --- | --- |
| 1 | Fixes | Remove fake-inches line; outlook on NWPS | `make check-web`; outlook returns a forecast for a gauge with an NWS LID |
| 2 | Data | Migration, basin script, hourly cron, trust checks, unit test, ADR | Script dry run; `make check-web`; `make check-db` after applying; a week of rows with no freshness finding |
| 3 | Read | Rain state, prompt block, fact gate, flag off | Unit tests; replay of 5 storms and 5 dry spells reviewed by hand; then flag on |
| 4 | API and web | Types, OpenAPI, chart track, rows, about page | `make check-web`; fixtures updated |
| 5 | iOS | Chart track, card, detail screen, outlook amounts | `make check-mobile`, `make bundle-mobile`, `make check-web`; device check in light and dark |
| 6 | Measured lag | Derive per-gauge lag from stored rain and readings | Compare against the nine hand-written values; replace only where at least five storms agree |

Each phase is its own PR. Phase 1 can merge today. Phase 2 needs the ADR
(`docs/decisions/0020-rain-upstream-is-a-watershed-average.md`) because it
adds a stored upstream and a product rule: rainfall is a watershed average
from NOAA, shown as an estimate, and never turned into a predicted level.

New test files must be added to the explicit `test` list in
`missouri-float-planner/package.json`; `registered-tests.test.ts` fails
otherwise.

## Risks and open questions

| Risk | Mitigation |
| --- | --- |
| MRMS unit or schema changes without notice | Fixture test on the conversion; freshness check; cron validates cell count and a sane range (0 to 30 in) before writing |
| Radar-only estimate is wrong for a storm | "Radar estimate" label; heaviest-spot beside the mean; phase 2 logs MRMS against the 13 co-located USGS rain gauges so the error is known before the Read uses it |
| NOAA map service is down | Section shows "stale" with the last time; the Read drops the block; nothing else depends on it |
| The Read overstates cause | State decided in code; amounts as words; fact gate; replay before enabling |
| Surface watershed misleads on big springs | Spring caveat from existing river notes; no claim that rain explains a steady reading |
| Hand-written lag is wrong | Shown as "usually about"; replaced by measured values in phase 6 |

Open questions for the owner:

1. Should Rain upstream be free everywhere, as recommended, or premium on iOS?
2. Is a rain-triggered alert ("heavy rain upstream of a river you follow")
   wanted after v1? It needs its own design; the alert engine was built for
   gauge thresholds.
3. Approve or correct the two area mismatches and the Elk River area before
   phase 2 applies.

## Cost

No vendor fees. About 4,800 NOAA map requests and a few hundred forecast
requests a day, one extra Vercel cron, and under 100 MB of rows a year. The
Read prompt grows by about 60 tokens per call.
