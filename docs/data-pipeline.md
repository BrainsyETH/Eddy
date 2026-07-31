# Data pipeline — script catalog

Every script under `missouri-float-planner/scripts/`, with what it reads, what
it mutates, and what stands between you and a production write. Compiled from
the scripts' actual code (argv parsing, Supabase calls), 2026-07-28. If a
script's behavior changes, update its row.

Run everything from inside `missouri-float-planner/` (`npx tsx scripts/<name>`
or the npm script named below). DB-touching scripts need
`NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (some also accept
`SUPABASE_URL`/`SUPABASE_KEY`); most load `.env.local`, but a few need the env
already exported — noted per row.

## Safety model — read this before running anything

The **Guard** column is the load-bearing one. Three values:

- **dry-default** — safe to run bare; it previews and requires an explicit
  flag (shown in the row) to write.
- **write-default** — it writes unless you pass the listed dry-run flag.
- **NONE** — it writes the moment you run it. Treat like a loaded migration.

`EXPECTED_SUPABASE_REF` is an extra guard honored by only four scripts
(`import-usgs-gauges`, `import-nwps-gauges`, `ingestion/ingest-dossier`,
`ingestion/preload-dossier-access-points.py`): export it and they abort if
pointed at a different Supabase project. Everything else trusts whatever URL
is in the environment — **there is no staging default; the env you load is
the database you mutate.**

## Checks & validation (read-only, safe always)

| Script | Run | Purpose |
| --- | --- | --- |
| `validate-data.ts` | `npm run db:validate` (`-- --strict` to fail on warnings) | Runs DB-side `validate_river_data()` + knowledge-base cross-check. The ingestion gate. |
| `verify-river-directions.ts` | `npm run db:verify-directions` | Heuristic headwaters-first check; prints suggested `UPDATE` SQL, never runs it. |
| `calibrate-float-times.ts` | direct | Compares the float-time model against published outfitter/NPS times; prints residuals. |
| `check-eddy-knowledge.ts` | `npm run check:eddy-knowledge` | Asserts `EDDY_KNOWLEDGE.md` has a section per active river. |
| `check-tailwind-tokens.ts` | `npm run lint:tokens` (part of `lint`) | Undefined-token and theme-drift gate. |
| `check-dead-links.ts` | `npm run test:links` | Playwright crawl of a running server; ≥400 same-origin links fail. |
| `mosw-smoke.ts` | direct (CI: `mosw-smoke.yml`) | Fixture-backed `/river-map` smoke suite; writes screenshots to `.smoke/` only. |
| `mosw-pinch-check.ts` | direct, needs `--url` | Mobile pinch-zoom check against a live deploy. Not in any workflow. |
| `run-migrations.ts` | `npm run db:migrate` | **Read-only despite the name** — reports applied status and prints CLI instructions. |
| `run-seeds.ts` | direct | **Read-only despite the name** — prints seed-application instructions. |
| `diagnose-map-alignment.sql` | paste into Supabase SQL editor | SELECT-only diagnostics for marker/river misalignment. |

## River ingestion pipeline (`scripts/ingestion/`)

The phased runbook is
[`scripts/ingestion/README.md`](../missouri-float-planner/scripts/ingestion/README.md)
— dossier in, validated rivers out. Always export `EXPECTED_SUPABASE_REF`
when running the write phases.

| Script | Phase | Writes (Supabase) | Guard |
| --- | --- | --- | --- |
| `scaffold-mo-dossiers.ts` | 1 — Scaffold | none — emits dossier stub JSON, skips existing files | n/a |
| `ingest-dossier.ts` | 6 — Ingest | `rivers` update, `gauge_stations` insert, `river_gauges` insert/update, `river_sections` + `river_characteristics` upsert | dry-default, `--apply`; honors `EXPECTED_SUPABASE_REF` |
| `import-dossier-access-points.ts` | 8 — Access points | `access_points` upsert (lands `approved=false`), miles RPC; `--approve` flips approved | dry-default, `--write` / `--approve` |
| `preload-dossier-access-points.py` | 8 — Access points | `access_points` insert (`approved=false`, `is_public=false`) via PostgREST | dry-default, `--write`; honors `EXPECTED_SUPABASE_REF` |
| `backfill-imagery-cli.ts` | 8.6 — Imagery | `access_points` update (`image_urls`) | **write-default**, `--dry` to preview |
| `link-gauges.ts` | (alt to 6) | `gauge_stations` + `river_gauges` upsert from per-river JSON | dry-default, `--write` |
| `update-thresholds.ts` | post-signoff patch | `river_gauges` update (threshold anchors) | dry-default, `--write` |
| `activate-rivers.ts` | 9 — Activate | `rivers.active=true` (auto-rollback on validation errors) | **write-default**, `--dry` to validate only |
| `set-cold-start.ts` / `set-cold-start-batch3.ts` | 9 — cold-start prose | `rivers` update (`float_summary`, `float_tip`) — one-time, batch-specific, idempotent | **NONE** |
| `build-dossiers-batch3.ts`, `gen-verified-ids-batch3.ts` | 2–3, batch 3 only | none — local dossier/gate files | n/a |
| `dossier.ts` | — | not a script: the `RiverDossier` type + gate taxonomy | n/a |

## Importers & backfills (top-level)

| Script | Run | Writes (Supabase) | Guard |
| --- | --- | --- | --- |
| `import-usgs-gauges.ts` | direct | `gauge_stations` upsert (national OGC import) | dry-default, `--apply`; honors `EXPECTED_SUPABASE_REF` |
| `import-nwps-gauges.ts` | direct | `gauge_stations` update (NWS flood/action stages) | dry-default, `--apply`; honors `EXPECTED_SUPABASE_REF` |
| `import-nhd-rivers-from-tnm.ts` | `npm run db:import-rivers-tnm` | `rivers` geometry insert/update (or SQL to `--out`) | dry-default, `--apply` |
| `import-services-csv.ts` | `npm run db:import-services <csv>` | `nearby_services` + `service_rivers` upsert | dry-default, `--import` |
| `import-floatmissouri.ts` | `npm run db:import-floatmissouri` | `access_points` + `river_hazards` insert/update. **Legacy — header warns it duplicates and mislocates; superseded by migration 00173** | dry-default, `--import` |
| `fetch-drainage-areas.ts` | direct | `gauge_stations.drainage_area_sqmi` update | dry-default, `--write` |
| `fetch-nws-flood-stages.ts` | direct | `gauge_stations.nws_lid`, `river_gauges` flood/action stages (never curated bands) | dry-default, `--write` |
| `import-outfitters-osm.ts` | direct | `points_of_interest` insert from Overpass | **write-default**, `--dry-run` |
| `snapshot-usgs-percentiles.ts` | direct | `usgs_daily_percentiles` upsert | **write-default**, `--dry-run` |
| `sync-gauge-thresholds.ts` | `npm run db:sync-thresholds` | `river_gauges` threshold update from NWS AHPS | **write-default**, `--dry-run` |
| `import-nhd-rivers.ts` | `npm run db:import-rivers` | `rivers` insert (skips existing slugs) | **NONE** |
| `import-missouri-gauges.ts` | direct | `gauge_stations` insert+update, optional `river_gauges` links | **NONE** |
| `fetch-gauge-stations.ts` | `npm run db:import-gauges` | `gauge_stations` + `river_gauges` insert (~10 curated gauges; skips existing). Env must be pre-exported | **NONE** |
| `import-access-points-csv.ts` | `npm run db:import-access-points <csv>` | `access_points` insert (`approved=false`) | **NONE** (unapproved rows are the only net) |
| `import-float-segments.ts` | `npm run db:import-segments` | `float_segments` insert; `--link` also runs the linking RPC | **NONE** for inserts |
| `import-mile-markers.ts` | `npm run db:import-mile-markers` | `river_mile_markers` upsert (CSV probed at hardcoded local paths) | **NONE** |

## Maintenance & repair

| Script | Run | Writes (Supabase) | Guard |
| --- | --- | --- | --- |
| `fix-gauge-associations.ts` | `npm run db:fix-gauges` | `river_gauges.river_id` repoint per hardcoded map | dry-default, `--fix` |
| `fix-niangua-gauge.ts` | direct — one-time (Bennett Spring → Windyville swap) | `gauge_stations` insert/deactivate, `river_gauges` rewire | dry-default, `--fix` |
| `correct-access-point-miles.ts` | `npm run db:correct-miles` | mutating RPC `correct_all_access_point_miles` (accepts `--river-slug=`, `--tolerance=`) | **NONE** — RPC fires on run |
| `snap-access-points.ts` | `npm run db:snap-access-points` | touches **every** `access_points` row to re-fire the snap trigger | **NONE** |
| `data/finalize-buffalo-access-points.ts` | direct — Buffalo-specific, idempotent | `access_points` coordinate + NPS-mile reconciliation. Env must be pre-exported | **NONE** |

## Asset generation (local files only, no DB writes)

| Script | Run | Output |
| --- | --- | --- |
| `build-mo-outline.ts` | `npm run data:build-outline` | `src/data/mo-outline.json` |
| `build-mo-rivers-basemap.ts` | direct (slow: ~50 NHD zips) | `src/data/mo-rivers-basemap.json` |
| `build-mo-hillshade.ts` | direct | `public/mo-hillshade.png` |
| `build-map-style.ts` | direct | `public/map-styles/eddy-*.json` (aborts on upstream style drift) |
| `preview-mo-basemap.ts` | direct | `tmp/mo-basemap-preview.svg` sanity render |
| `export-ads.js` | direct (Playwright) | `.stitch/ads/*.png` ad creatives |

## Security tests (run in `npm test`)

`scripts/security/segment-cache-policy.test.ts` asserts migration 00174 keeps
`segment_cache` locked down; `scripts/security/workflow-action-pins.test.ts`
asserts every third-party GitHub Action is SHA-pinned.

## Related but not here

Supabase migrations and seeds live in `missouri-float-planner/supabase/` and
are applied via the Supabase CLI/SQL editor — `run-migrations.ts` and
`run-seeds.ts` above only report on them. ClipEngine/social media automation
lives at the repo root (`scripts/`, `clipengine-local/`) and is documented in
[`clipengine-ops.md`](clipengine-ops.md). The iOS `.easignore` checker is
`eddy-ios/scripts/check-easignore.py` (see
[ADR 0004](decisions/0004-easignore-is-an-allowlist.md)).

Before a release, run `npm run db:check-migrations` from
`missouri-float-planner/`. It freezes the repository's known legacy
manual-migration split and fails on either local-only or remote-only migrations
created after that baseline. New migrations must use timestamp identifiers.
Passing this command does not validate any policy or constraint inside the
legacy range; see [`legacy-schema-security-audit.md`](legacy-schema-security-audit.md)
for that one-time catalog audit and the invariants that should remain permanent.
Link a new checkout once with
`npx supabase link --project-ref <project-ref>`; credentials remain in the
operator's local Supabase profile and must not be committed.
