# Private rainfall research history

This is the collection step before public rain amounts, charts or Reads. It
preserves what was known at the time so a later study can compare rain with
gauge response and forecasts with observations. It does not fit a prediction
model, approve boundaries, or change web/iOS behavior.

## What is saved

| Record | Cadence | Contents |
| --- | --- | --- |
| Basin versions | Seeded once; archived with each distinct inventory | Exact simplified USGS boundary, gauge identity, capture date/hash, source-area and station-point checks, unresolved flags and exploratory forecast points |
| NOAA MRMS observations | Hourly at :18 | Separate 1/6/24/72-hour source rasters, each with its own valid window, original float pixels, native grid, locked source identity and provenance |
| NWS forecasts | Every three hours at :43 | Each distinct grid forecast version: grid identity, provider update time, and the four precipitation layers (amount, chance, snowfall, ice) with their original units, intervals and nulls, plus basin/sample bindings. Other layers are dropped and counted |
| Gauge observations | With each hourly collection | The previous 48 hours of stored stage/discharge, original observation/fetch timestamps and qualifiers; paginated beyond the API's 1,000-row default |

The four observed products share a regional export covering all seeded basins.
It is snapped to the locked raster's native grid and verified against the
returned extent and actual GeoTIFF tags (F32, CRS, spacing, origin, pixel-block
bounds). Nearest-neighbor sampling preserves negative missing-data codes. No
display renderer, bilinear blend, or aggregate amount is used. Later analysis
must mask negative/no-coverage values **before** averaging and intersect actual
cell areas with a reviewed basin. The raster's documented unit is mm; its hosted
raw-unit check remains a separate public-release gate.

Regional capture reduces observation downloads from four per basin to four per
run, plus catalog/grid checks and file downloads. It also retains pixels around
the current basins, which may help with boundary corrections. A new basin outside
the native regional extent or export budget needs an explicit collection change.

Forecast sampling is deliberately exploratory: up to nine deterministic points
inside each basin, spread across its extent. Identical NWS cells are fetched once
per run. This is **not** a validated area-weighted forecast or a claim of complete
coverage. Point-to-grid mappings refresh after seven days. A cold start can take
multiple passes to resolve all points; completed mappings survive retries and
the monitor reports unfinished work as partial.

## Integrity, privacy and retention

`rainfall_research_basins`, `rainfall_research_captures` and
`rainfall_research_grid_cache` have RLS and no anon/authenticated grants. The
`rainfall-research` Storage bucket is private with no client policies. Only the
server service role writes; capture rows cannot be updated by it. Object names
use SHA-256 of the gzip bytes; the catalog records that checksum and byte count.
Retries reuse objects and ignore duplicate capture rows. Changed source bytes
or forecast versions produce new rows instead of overwriting history.

There is no automatic expiry in this research archive. Measure actual stored
bytes in the job counters and catalog before setting a budget/retention policy;
neither a dry-day sample nor the old sub-100-MB estimate is a capacity forecast.
Keep at least multiple wet/dry seasons for modeling. Any later pruning needs an
archive/export decision first. A failed catalog insert may leave an unreferenced
content-addressed object; a retry repairs it. Do not delete archive objects via
SQL or assume every unreferenced object is safe to remove during a running job.

The existing `gauge_readings` is retained independently. Copies here preserve
the gauge data known at capture time, including provisional qualifiers. A
48-hour overlap recovers skipped gauge snapshots; it cannot recover an old MRMS
hour that NOAA's rolling service no longer serves. Missing hours stay missing.
Do not reconstruct hourly rainfall by subtracting overlapping 6/24/72h totals.

Both cron routes use machine bearer authentication, separate locks, bounded
concurrency/body sizes/deadlines, provider telemetry and admin job monitoring.
A missing inventory is an error; missing gauges, failed products, stale sources
and deferred work are partial runs. A disabled collection flag is a skipped run.
No public consumer reads these tables or objects.

## Activation after review

This change is stacked on the source-inspector PR. Collection is built but is
not running merely because its branch exists. Private storage was created in
production on 2026-11-11 (migration `20261111181526`), and all 50 unreviewed
basin records with 450 exploratory forecast points were seeded and read back.
The production collection flag is configured for the next deployment; preview
remains disabled. The collection routes still need to be merged and deployed.

1. Apply `rainfall_research_history` using the normal migration process. Record
   the actual production migration version in the filename/ledger and run
   `make check-db`; inspect security advisors and private bucket policies.
2. From `missouri-float-planner`, preview the committed source evidence:
   `node --import tsx scripts/rainfall/seed-research-basins.ts --evidence ../docs/validation/rainfall/2026-11-11-review`.
   The expected result is 50 basins, four flagged sites and 450 forecast points.
   With `--apply`, a basin whose station is inactive is skipped and named; it has
   no gauge readings to compare with rain.
   Repeat with `--apply` and `EXPECTED_SUPABASE_REF` set to the intended project.
   This seeds **unreviewed research** boundaries, including controlled reaches;
   it neither corrects gauge data nor makes any site eligible for public rain.
3. Deploy the collector and set `RAINFALL_RESEARCH_ENABLED=true` in production.
   Leave preview disabled when it shares the production database. Manually run
   both authenticated cron endpoints and verify the stored rows/objects, then
   verify a subsequent scheduled run and admin counters. Cold forecast mapping
   may need another pass. The observation and forecast routes are independent.
4. Confirm a saved object downloads with service credentials, matches its hash,
   decompresses, and is denied to anon/authenticated clients. Confirm a rerun
   does not overwrite existing captures. Record observed byte growth after a
   wet day as well as a dry day.

Disable the collection flag to pause new work; existing history remains intact.
There are no feature migrations or public-screen changes to roll back.

## What still gates public rain

- Reproduce a wet-window hosted-raw-unit check against rain gauges and retain
  station IDs, windows and responses. An anecdotal comparison is not a replay.
- Review Windyville and Big Piney's area disagreements, Doniphan's station-point
  difference, and Elk's missing stored area. All boundaries remain unreviewed.
- Validate area-weighted native-pixel amounts and valid-area coverage, plus
  representative forecast sampling and partial coverage behavior.
- Replay storms and quiet days; measure lag on separate events/seasons and
  exclude dam-controlled reaches from natural rain-response claims.

The dam study's principle applies: compare an upstream signal with downstream
changes, and publish a lag only when the evidence supports it. Rain has extra
variables—storm location, antecedent wetness, spring/karst contributions and
dam operation. This archive preserves evidence; it does not establish causation
or promise a future water level.

Source contracts: [NOAA/USGS inspection](rainfall-sources.md),
[Esri exportImage](https://developers.arcgis.com/rest/services-reference/enterprise/export-image/),
[NWS gridpoint documentation](https://github.com/weather-gov/api/blob/master/gridpoints.md),
and the existing [tailwater lag plan](../missouri-float-planner/docs/TAILWATER_PLAN.md).

## Recorded setup checks — 2026-11-11

- Production migration `20261111181526` is applied and the ledger/file match.
- Seed readback: 50 enabled, unreviewed research basins; 450 points; four flagged
  sites. Existing gauge metadata is unchanged.
- RLS/client-grant checks pass on all three new tables; the archive bucket is
  private; service-role UPDATE is revoked on immutable capture rows.
- Security advisors list the expected informational “RLS enabled, no policies”
  entries for these server-only tables. No client policies are intended.
- Migration/ledger drift, access-slug comparison and the repository's complete
  client-access SQL all pass against production via the connected database.
  The literal `make check-db` wrapper cannot run in this environment because
  the tsx CLI cannot create its IPC socket; its pure checks and live SQL were
  run separately without bypassing any findings.
- Local PostgreSQL/WASM replay passes with Supabase-style default service-role
  grants: anon access denied, immutable writes denied, duplicate inserts safe.
- Live NOAA probe: 415 × 489 native cells covering the seeded region; F32,
  EPSG:3857, 1,189.1838 m projected spacing; TIFF extent and pixel-block bounds
  verified. The file uses legal sparse TIFF blocks. The original NWS sample
  preserves its 32 precipitation intervals. See
  `validation/rainfall/2026-11-11-review/native-archive-probe.json`.
- Production collection is not yet running. Verify the first archived objects
  and scheduled run after this PR deploys; do not describe setup as saved rain
  history or a validated prediction.

## Public chart view and rollout

Rain is an optional layer inside the existing gauge chart, initially for 24-hour
and 7-day views. It has its own inches scale and the same time axis as the river.
The preference is remembered on each device/browser. One-hour accumulations are
shown on 24h; complete, aligned six-hour sums are shown on 7d. Missing hours
invalidate a six-hour bar; rolling 24/72h products never fill timeline gaps.
Rain adds its own track height while preserving the river plot's height. The watershed map, 24/72h totals,
source times, coverage and accessible hourly table open in a drawer on desktop
and a sheet/full-screen view on phones. They do not add a main-report card.

Both clients read `/api/gauges/[siteId]/rainfall`; `?detail=1` adds the outline and
24h shading only when requested. Gauge identity is checked at the client boundary;
changing sections cannot borrow another station's rain. The shared normalizer
keeps unknown amounts null and invalidates current totals after three hours.
Research storage remains private. No client receives a storage URL or raw archive.

Publication is **off** until all of these are true:

1. `src/lib/rainfall/public-policy.ts` records replayable hosted-unit and coverage
   evidence, plus each reviewed station's exact basin version and gauge location.
   Its evidence entries and station list intentionally start empty.
2. The matching research basin has `review_status=reviewed`.
3. `RAINFALL_PUBLIC_ENABLED=true` is set on the intended environment.

The collector then derives `published/v1/<site>.json.gz` in the existing private
bucket after archiving observations. These disposable views can be overwritten;
raw captures remain immutable. Native uncompressed F32 cells are clipped against
the basin and weighted by geodesic area. Sparse TIFF blocks without a GDAL nodata tag are valid zero rain. If a nodata
tag is present, sparse blocks and matching samples are missing; negative and
nonfinite samples are also missing. A
minimum 95% valid basin area is required for a numeric estimate. The publisher replays eight days of immutable captures, in stable pages, with
the latest revision selected per basin and interval. TIFFs are decoded one at a
time, and failed replay never overwrites a previously published view; no historical bars are fabricated. Published
views include the basin/evidence versions so a review change invalidates old ones.
The public endpoint caches at most the reviewed station set for five minutes.
No forecast sampling or rain-to-rise prediction is enabled by this path.

Numerical tests cover partial boundary cells, coverage, missing hours, raw TIFF
replay, units conversion, and conflicting/stale station responses. These tests
**do not close** the empirical wet-unit or basin-review gates. Before activation,
verify those evidence items, publisher runtime on the intended basin set, stored
view readback, a scheduled update, outage behavior and client denial of archives.
Disable the public flag to remove the layer without stopping private collection.

`npm run test:river-sections` also exercises the rain UI at 1440/390/320px,
preserved river plot height on toggling, remembered preference, shared cursor,
keyboard detail dismissal, section switching, and wet/dry/missing/stale data.
Its map uses the captured USGS Annapolis outline; rain and readings are fixtures.
The existing `river-sections-web` CI job retains its screenshots. Native device,
VoiceOver, large-text and rotation checks remain required before app distribution.

### Collection fixes (2026-11-12)

Three faults in the collector as first deployed, and what changed.

- **Forecast lookups all failed.** The only run before this fix reported 0 of
  450 points resolved. NWS answers a point with more than four decimal places
  with a redirect to the rounded point, and the collector refuses redirects.
  Lookups now send four decimals (about 11 m, well inside one 2.5 km cell). The
  cache key and the archived binding still hold the exact sample point.
- **Forecast captures kept every layer.** A gridpoint response carries about
  sixty layers; a rain study reads four. Captures now keep the forecast's
  identity and `quantitativePrecipitation`, `probabilityOfPrecipitation`,
  `snowfallAmount` and `iceAccumulation` exactly as issued, and record the kept
  layer names, the number dropped and the source size. One measured response
  went from 8.2 KB to 0.7 KB compressed. At up to 450 cells every three hours
  that is roughly 1 GB a year at most rather than 11 GB. This is still an
  estimate; measure stored bytes before setting a budget. Temperature, wind and
  the other dropped layers are not recoverable from these captures.
- **Every observation run reported partial.** Two seeded stations had no stored
  readings. Big Piney near Houston (06928900) is inactive; migration
  `20261112004500` disables its research basin and the seed script now skips
  inactive stations, leaving 49 enabled basins. Gasconade near Rich Fountain
  (06934000) was wired to its river without `curated = true`, so the gauge cron
  had skipped it since 2026-07-27 while USGS kept publishing. The same migration
  re-asserts "every wired station is curated", and the daily
  `gauge_wired_not_curated` trust rule reports any station that drifts again.

The migration is pending until the owner applies it; until then runs stay
partial for those two stations. Disabling a basin changes the basin set. It
does not move the regional tile here, because the Houston basin lies inside the
Big Piney near Big Piney basin, but check that before preparing weights.

### Review corrections (2026-11-11)

The collector now streams `exportImage?f=image&format=tiff&compression=None`.
NOAA's JSON envelope was already requested correctly, but its temporary href
returned `400 Invalid URL`. Direct responses still have their CRS, F32 type,
dimensions, spacing and origin validated, and their catalog identity rechecked.
A read-only probe captured all four products; reproducible bytes and counts are
in `validation/rainfall/2026-11-11-stream/`. The one-hour image contains 202,935
valid zero pixels, including implicit sparse blocks. This proves download and
sparse decoding, not independent wet-unit agreement or production persistence.

Seven-day charts use complete six-hour bins plus the current completed hours
labelled “so far”. A missing past hour still invalidates its interval. The rain
scale has a minimum of 0.25 inches per hour or 1 inch per six hours and grows in
those increments; these are display scales, not storm-risk thresholds. Zero is
a continuous baseline; unknown intervals are outlined gaps. Bars use solid
Eddy rain colors. Phone readouts sit below the plot; the rain header has a real
44-point touch target. Date range and availability remain separate labels.

Approved sites must include the corresponding `riverSlug`. Published map context
uses that existing river geometry and approved access names inside the basin.
The shared projection draws the river, labelled gauge and up to three spaced
place labels; no inferred river line or invented place coordinates. The dry
swatch is an unfilled surface; unknown coverage is hatched. Context stays out of
the summary response and loads with the detail.

Before public activation: replay representative archived wet storms against the
underlying NOAA product, review basin versions, measure publisher runtime on the
intended inventory, and verify scheduled captures and readback in production.
The evidence entries, public flag and station allowlist remain closed.

### Prepared basin weights and isolated publication

Hourly publication never computes basin/grid weights. Prepare them once for
each exact basin shape and native grid using `scripts/rainfall/prepare-weights.ts`.
The immutable `weights/v2/<identity>.json.gz` objects stay in the private research
bucket. Their identity covers the geometry, EPSG:3857 grid dimensions/origin/spacing,
and algorithm version; payload checksums, bounds and basin area are checked on load.
A changed shape, grid or algorithm needs preparation again. No schema change is needed.

Preparation clips the shape once per grid row, indexes all outer/hole edges,
uses whole-cell areas only where no boundary edge crosses a cell, and clips the
remaining cells against the row geometry. The offline benchmark for all 50 saved
basins is in `validation/rainfall/2026-11-11-stream/weights-performance.json`.
This measures local preparation, not production publisher runtime or storm accuracy.

From `missouri-float-planner`, using the tile metadata of a validated native capture:

```sh
node --import tsx scripts/rainfall/prepare-weights.ts --tile ../docs/validation/rainfall/2026-11-11-stream/direct-export.json
```

This defaults to a dry run over stored enabled basin versions. `--site USGS_ID`
limits it to one basin. With explicit production-write authorization, use
`--apply` and pin `EXPECTED_SUPABASE_REF`; the script checks the bucket is private,
uploads without overwriting, and verifies readback. Prepare every grid needed by
the replay window before adding a station to the public allowlist. This step
does not review a basin or activate rainfall. No preparation uploads have been
performed as part of this PR.

A missing/corrupt prepared object, map-context failure, or upload failure marks
only that basin failed. Its previous publication is retained and ages normally;
healthy basins still publish. Corrupt source captures fail the basins that use
them, without falling back to obsolete revisions. Shared archive-query failures
and global cancellation still stop the run. Monitoring reports partial status,
the number of published basins, and site-specific failure logs.

Before activation, run the preparation/readback on the intended environment,
measure a full eight-day publisher replay, and exercise one failed basin beside
a healthy one. Historical storm, basin review and scheduled-capture gates remain.
