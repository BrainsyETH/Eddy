# Lakes — Phase 0 records and the recreation-status ledger

Evidence for `docs/LAKES_AND_LAUNCHES_PLAN_2026-11-09.md` step 1 (Phase 0) and
the audit that reads it, `docs/LAKES_PHASE0_AUDIT_2026-11-09.md`. Nothing in
this directory is published, approved, pinned, or written to the database.

## `usace-recreation-ledger.json`

Eddy's observation ledger of the Corps' recreation-area status layer
(`Hosted/RecreationSite_Status_gdb/FeatureServer/0`): one entry per area with
the current record, and for each status field its value, the time Eddy first
saw that value and the agency `date_updated` it carried then. The time of the
last complete read is kept once on the ledger (`last_recorded_at`), so an
unchanged area is byte-identical after a run. Events are recorded for a
status value changing, the agency re-dating a record, and an area
disappearing or returning; a notes edit is none of those. One area per line
so a day's diff reads as the areas that moved. Seeded here with run 1
(2026-11-09); the daily recording is
`.github/workflows/usace-recreation-ledger.yml`, which commits to the
`data/usace-recreation-ledger` branch and never to `main`.

## `savannah-energy-schedule.jsonl`

One line per Savannah project per daily read: how far the district's
scheduled-energy series reaches, how many future hours are nonzero, which
Eastern days it covers, and the future values themselves, so posting times
and revisions become visible before the Southeast step is designed
(`scripts/lakes/record-savannah-schedule.ts`). Seeded with the first read.

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
| `stage-launch-candidates.sql` | The two queues as UNAPPROVED `lake_launches` rows with no launch method (`scripts/lakes/stage-launch-candidates.ts`); approval, methods, amenities and the access-point link are a reviewer's work. Execute only against the confirmed Eddy project, after migration `20261109210000` |
| `lake-polygons/*.geojson` | USGS 3DHP waterbody polygons (layer 60) for Table Rock, Truman and Stockton, generalised to 0.0001° |
| `existing-access-points-near-pilot-lakes.json` | A read-only production query of access points inside the two lakes' bounding boxes, recorded with the query |

## Reviewing launches

Once migration `20261109210000` is applied and `stage-launch-candidates.sql`
has run, `/admin/lakes` lists every staged place by lake. For each row the
reviewer checks the location on imagery (link on the row), sets the launch
method (trailer, hand, or both), the amenities and the agency, pastes the id
of the access point the place already is when it is one, and publishes. The
API and the table both refuse to publish a row with no method or no source.
The dam page shows published launches only, and shows nothing for a lake with
neither a reading nor a published launch.

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
