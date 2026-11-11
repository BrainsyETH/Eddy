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
| NWS forecasts | Every three hours at :43 | Each distinct grid forecast version, provider update time, original amount units and intervals, nulls, other forecast layers, and basin/sample bindings |
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
