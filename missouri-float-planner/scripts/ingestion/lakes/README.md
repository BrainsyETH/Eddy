# Lakes — Phase 0 records and the recreation-status ledger

Evidence for `docs/LAKES_AND_LAUNCHES_PLAN_2026-11-09.md` step 1 (Phase 0) and
the audit that reads it, `docs/LAKES_PHASE0_AUDIT_2026-11-09.md`. Nothing in
this directory is published, approved, pinned, or written to the database.

## `usace-recreation-ledger.json`

Eddy's observation ledger of the Corps' recreation-area status layer
(`Hosted/RecreationSite_Status_gdb/FeatureServer/0`): one entry per area with
the agency's own `date_updated` (`source_updated_at`), the time Eddy first saw
the current status value (`first_observed_at`), the last successful read
(`last_checked_at`), and a change log. One area per line so a day's diff reads
as the areas that changed. Seeded here with run 1 (2026-11-09); the daily
recording is `.github/workflows/usace-recreation-ledger.yml`, which commits to
the `data/usace-recreation-ledger` branch and never to `main`.

The product never derives currency from this ledger's `first_observed_at`. A
reader is shown the agency's date or "update date unavailable"
(`scripts/lakes/recreation-status.ts`, `provenanceLine`).

## `2026-11-09/`

| File | What it is |
| --- | --- |
| `recreation-status-report.md` | Every Corps project classed `maintained`, `static`, `stale` or `unmaintained` from the agency dates in run 1, with ramp and launch-lane counts |
| `nwk-boat-ramps-snapshot.json` | The complete Kansas City District ramp layer as retrieved (224 ramps) |
| `nwk-ramps-summary.md`, `nwk-ramps-<lake>.md/.json` | Ramp-bottom and closure elevations checked against each lake's documented pools; a flag is a question, not a verdict |
| `launch-queue-table-rock.*`, `launch-queue-truman.*` | Launch review queues: agency and district ramp features within 500 m of the 3DHP lake polygon, clustered into places, matched to Corps areas and to access points Eddy already carries |
| `lake-polygons/*.geojson` | USGS 3DHP waterbody polygons (layer 60) for Table Rock, Truman and Stockton, generalised to 0.0001° |
| `existing-access-points-near-pilot-lakes.json` | A read-only production query of access points inside the two lakes' bounding boxes, recorded with the query |

## Reproduce

From `missouri-float-planner/`, with Node 20 (`../bootstrap.sh web`):

```bash
npx tsx scripts/lakes/record-usace-recreation.ts --download /tmp/status-snapshot.json
```

```bash
npx tsx scripts/lakes/record-usace-recreation.ts --record scripts/ingestion/lakes/usace-recreation-ledger.json --from /tmp/status-snapshot.json
```

```bash
npx tsx scripts/lakes/record-usace-recreation.ts --report scripts/ingestion/lakes/usace-recreation-ledger.json --out scripts/ingestion/lakes/2026-11-09/recreation-status-report.md
```

```bash
npx tsx scripts/lakes/nwk-ramp-dossier.ts --from scripts/ingestion/lakes/2026-11-09/nwk-boat-ramps-snapshot.json --out scripts/ingestion/lakes/2026-11-09
```

```bash
npx tsx scripts/lakes/build-lake-launch-queue.ts --lake truman --project "HARRY S. TRUMAN DAM AND RESERVOIR MISSOURI" \
  --polygon scripts/ingestion/lakes/2026-11-09/lake-polygons/truman-3dhp-JZ940.geojson \
  --polygon scripts/ingestion/lakes/2026-11-09/lake-polygons/truman-3dhp-LHBG8.geojson \
  --polygon scripts/ingestion/lakes/2026-11-09/lake-polygons/truman-3dhp-MV7YZ.geojson \
  --mdc scripts/ingestion/agency-gis/2026-10-29/mdc-features.json \
  --nwk scripts/ingestion/lakes/2026-11-09/nwk-boat-ramps-snapshot.json \
  --status /tmp/status-snapshot.json \
  --existing scripts/ingestion/lakes/2026-11-09/existing-access-points-near-pilot-lakes.json \
  --out scripts/ingestion/lakes/2026-11-09
```

Table Rock takes `--agfc scripts/ingestion/agency-gis/2026-10-29/agfc-features.json`
and the two `table-rock-3dhp-*.geojson` polygons instead of `--nwk`. The pure
logic behind each script is tested in `scripts/lakes/*.test.ts`; the scripts
themselves need the network and stay out of the `test` script.
