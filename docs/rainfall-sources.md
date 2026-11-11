# Rainfall source inspection

Run the read-only preflight before implementing the Rain upstream collector.
It captures the complete provider responses, request parameters, fetch times
and response hashes. It never writes to the database or approves a boundary.
Area and point agreement are screening checks, not evidence of full basin
correctness. Dam-controlled eligibility is a separate server rule, not inferred
from area agreement or a river name.

Export the current curated inventory with this **read-only** query:

```sql
select gs.id, gs.usgs_site_id, gs.name, gs.drainage_area_sqmi,
       st_x(gs.location::geometry) as longitude,
       st_y(gs.location::geometry) as latitude
from gauge_stations gs
where exists (
  select 1 from river_gauges rg join rivers r on r.id = rg.river_id
  where rg.gauge_station_id = gs.id and r.active = true
)
order by gs.usgs_site_id;
```

Save the JSON array, then from `missouri-float-planner/`:

```sh
node --import tsx scripts/rainfall/inspect-sources.ts \
  --inventory /path/to/curated-gauges.json --out /path/to/new-inspection
```

The output directory must not exist. Four workers, individual 25-second
timeouts, one retry, and an eight-minute deadline bound the inspection.
Failures are recorded per gauge; successful evidence survives a partial run.
Rows without USGS identifiers are counted separately. No values in this
inspection may be supplied to a public chart or Eddy's Read.

## What the inspection establishes

- NLDI simplified polygons (`simplified=true`), site identity and pour point.
  The two original topology failures also retain full-resolution comparisons;
  a difference over 1% fails that comparison without approving either boundary.
  Geometry failures retain station/area diagnostics in the report. Invalid
  geometry is never returned as a usable basin.
- A fresh USGS drainage-area comparator and station coordinates, checked
  against Eddy's stored area/coordinates. Differences over 10% in basin area
  and 100 metres in point placement require investigation. These thresholds
  only prioritize review; they do not approve the remaining geometries.
- The exact active CONUS raster and independent valid-end time for 1/6/24/72h.
  A missing/renamed/duplicate raster or changed pixel contract stops selection.
- Masked raw statistics at Alley Spring, paired with one display-renderer diagnostic.
  These are **not** validated area-weighted rainfall totals: native units,
  missing-pixel masks, boundary weighting and expected coverage remain gates.

## Numeric and map paths are different

The live catalog currently uses names such as `conus_QPE_24H`, unlike the
older `mrms_24h_co` example in NOAA's tutorial. Select by the inspected subset
and lock its raster ID; never accept the service's default mosaic.

`rft_24hr` is a **display** function. In the 2026-11-11 Alley Spring dry probe,
the same raster and geometry returned a raw mean of 0 with `None` and a mean
of 1 through `rft_24hr`. That 1 is not one inch of rain. Image-service text
saying inches does not establish the units of every analysis operation.

The inspection labels all native values `unverified`. Before collection:

1. Match raw values to the underlying MRMS product for dry and wet cases;
   cross-check against an independent source with matching time/area support.
2. Define missing/no-coverage masks, pixel and boundary area weights, and
   spatial/temporal completeness thresholds. Do not derive coverage from
   the count of positive pixels, or sum overlapping rolling totals.
3. Verify forecasts separately: unit, interval duration, overlapping periods,
   mapped cell weights, freshness and coverage. Never derive an amount from
   a probability or spread a multi-hour amount into invented hourly timing.
4. Record reviewed basin versions, quarantine mismatches, then finalize storage,
   ingestion and map contracts. A current raster cannot depict historical rain.

Sources: [NOAA image service](https://mapservices.weather.noaa.gov/raster/rest/services/obs/mrms_qpe/ImageServer),
[NOAA tutorial](https://www.weather.gov/gis/mrms_data_quick_tutorial),
[MRMS product units and missing codes](https://www.nssl.noaa.gov/projects/mrms/operational/tables.php),
[USGS NLDI](https://api.water.usgs.gov/nldi/),
[USGS monitoring locations](https://api.waterdata.usgs.gov/ogcapi/v0/collections/monitoring-locations).

## Sampling and reproducible checks

From `missouri-float-planner/`, run `npm run lint:rainfall` (the equivalent
command is `node node_modules/eslint/bin/eslint.js --no-ignore scripts/rainfall/*.ts`).
Normal lint now invokes this command explicitly; other scripts remain excluded.
Run `npm run typecheck` and `npm test` for the registered regression checks.

The inspector captures `/ImageServer/{locked-raster-id}/info` separately for
each window. Its cell size and origin describe that selected item; the root
service's 573 m minimum is not the CONUS grid. The inspected CONUS 24h item
uses 1,189.18 m cells in Web Mercator. Never hardcode either value.

Numeric diagnostics use a Mask on the locked source item to exclude all
negative cells, followed by explicit nearest-neighbor resampling from its
native cell size. Zero is valid. Empty statistics remain unknown. The display
renderer remains a separate, nonnumeric comparison. `computeStatisticsHistograms`
has no grid-origin parameter: it is still a diagnostic, not a validated
area-weighted basin average. The future collector must use the captured origin
for aligned cell extraction, mask missing cells, weight cell/boundary area,
and measure coverage against the complete expected basin footprint.

NOAA documents RadarOnly_QPE 1/6/24/72H in **millimetres**, with -1 missing
and -3 no coverage. The review's ten rain-gauge comparisons support that scale,
but their gauge IDs, exact windows and response captures were not supplied.
They are not presented as reproduced evidence. `documentedProductUnits: mm`
is recorded alongside `nativeUnits: unverified` until the exact hosted raw
path has an archived independent wet-case comparison. Display-service prose
saying inches does not override this distinction. No public conversion or
"no rain" state is enabled by this inspector.

API contracts: [Mask and Resample](https://developers.arcgis.com/rest/services-reference/enterprise/raster-function-objects/),
[statistics](https://developers.arcgis.com/rest/services-reference/enterprise/compute-statistics-and-histograms/),
[item grid](https://developers.arcgis.com/rest/services-reference/enterprise/raster-info/).
