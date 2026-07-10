# River Onboarding — Deployment Status & Runbook

_Last updated 2026-07-09 (access-point data review, project FloatMe / ilefwfpvphadsbptiaur)._

Covers the 4 new Missouri rivers + Buffalo (AR). **The deploy has run**: this
file is now the record of what shipped and what remains.

## Access-point data review (2026-07-09)

Reviewed and corrected every access point on the 5 new rivers **plus Big Piney**,
which the owner flagged for bad coordinates, wrong/missing types, and missing
data. Coordinates verified against the MDC Conservation Atlas, NPS, USFS,
Recreation.gov, and USGS; missing public accesses added; scraped junk retired.
Migrations (idempotent upsert on `UNIQUE(river_id, slug)`), one per river:

- `00154_bourbeuse_access_point_corrections.sql` — 16 updated, 3 added, 1 retired.
- `00155_gasconade_access_point_corrections.sql` — 9 updated, 16 added (lower
  river had almost no coverage), 3 retired (confluence landmarks / unfindable).
- `00156_black_access_point_corrections.sql` — 3 updated, 8 added, 1 retired
  (`bluff-cave` was a float-chart landmark misplaced ~70 mi downstream).
- `00157_st_francis_access_point_corrections.sql` — 5 updated, 5 added. Big fix:
  Sam A. Baker was pinned on Big Creek 1.7 km off-river; moved to the park's
  St. Francis launch. `lake-creek` resolved to the COE Greenville Rec Area.
- `00158_buffalo_access_point_corrections.sql` — 22 updated (all had **empty
  `types` arrays** and no amenities/facilities — now classified/enriched), 1 added.
- `00159_big_piney_geometry_reimport.sql` — **prerequisite.** Prod `big-piney`
  geometry was a 47 km junk polyline (not the river). Re-imported from NHD HR
  HUC8 10290202 via `scripts/import-nhd-rivers-from-tnm.ts` (big-piney added to
  its `RIVERS` list); 107.9 mi main stem, `length_miles` 68.4→107.9, points
  force-resnapped. **Applied to prod 2026-07-09.**
- `00160_big_piney_access_point_rebuild.sql` — 18 canonical points (coords fixed,
  types corrected incl. Baptist Camp `boat_ramp`→`access` per its own "no ramp,
  carry-in" facilities note), 14 scraped junk/duplicate/landmark rows retired,
  miles recomputed from the corrected geometry.

Approval: points whose coordinate was verified against an official source
(`official`/`high` confidence) are set `approved=true` by the migrations; medium/
low-confidence points stay `approved=false` for human review in `/admin/geography`.
Already-live points (Buffalo, some Big Piney) at medium confidence are kept
approved so nothing disappears. Retires DELETE unless a `float_plans` FK
references the row, in which case they soft-retire (`approved=false`). Each
migration also purges `drive_time_cache` for its river. Big Piney remains
`active=false` in prod (not public) — activation is a separate decision.
Research records synced into `dossiers/*.json`; Big Piney fixes mirrored into
`supabase/seed/access_points.sql`. Per-point review report with satellite links:
generated for the owner.

## ⚠ Canonical target + known gaps (updated 2026-07-08)

- **Production Supabase project is `ilefwfpvphadsbptiaur` (FloatMe).** The app
  (`src/lib/supabase/admin.ts`) reads whatever `NEXT_PUBLIC_SUPABASE_URL` points
  at. Every write script MUST target this same project. A legacy project still
  exists and is the reason the geography admin once showed a stale, smaller
  river set than the public site — data had been written to a different project
  than the app was reading. **Before any `--apply` / `--write`, export
  `EXPECTED_SUPABASE_REF=ilefwfpvphadsbptiaur`**; `ingest-dossier.ts` and
  `preload-dossier-access-points.py` now print the target ref and abort on a
  mismatch. When the legacy project is no longer needed, delete it.
- **Access points: enriched + loaded as PENDING (2026-07-08).** All 41 dossier
  access points (bourbeuse 17, gasconade 12, st-francis 5, black 4, buffalo 3)
  were already in prod as pending pins from an earlier `preload` run, but with
  rough auto-placed coords (Hammer was ~75 km off, Mill Creek ~18 km). They have
  now been enriched — sourced exact lat/lon (38 of 41; MDC Atlas, USFS/NPS,
  USGS gauges, OSM), managing agency, river mile, parking/road/facilities, and
  factual descriptions — and updated in place. Still `approved=false /
  is_public=false`: **a human must verify each pin and approve it in
  `/admin/geography`** before it goes public. 3 points (Bluff Cave, Cave Lodge,
  Lake Creek) had no citable coordinate and keep a "needs placement" flag.
- **Black is ACTIVE (2026-07-08), two reaches.** Upper (Lesterville→Hwy K):
  primary gauge Annapolis **07061500**, ladder `optimal_min 180 / high 1470 /
  dangerous 3880` cfs (high/dangerous from NWS ANNM7 action/flood stages via the
  USGS exsa rating). Lower (Markham Springs→Hammer, below Clearwater Dam): the
  reach gauge **Williamsville 07062575 is DISCONTINUED** (no real-time discharge
  since 2022, no NWS flood stages, no rating) so the lower reach is keyed to the
  downstream **Poplar Bluff 07063000** (live; NWS PPBM7) with `optimal_min 627 /
  high 4809 / dangerous 7057` cfs — high/dangerous from PPBM7 action/flood
  stages, optimal_min = the 507 cfs observed Good scaled by drainage (×1.236).
  Segment routing: `river_gauges.river_mile` Annapolis=25, Poplar Bluff=55;
  Poplar Bluff carries `distance_from_section_miles=26` so lower-reach conditions
  always show the "gauge is 26 mi from float section" accuracy warning. The
  river-level badge uses the primary (Annapolis/upper). Applied directly to prod
  via SQL (not ingest); recorded in `dossiers/black.json`.

## Shipped 2026-07-07 (session claude/rivers-prod-deploy-env-es86lu)

- **Geometry**: all 5 rivers created from NHD HR HUC8 shapefiles via the
  extended `scripts/import-nhd-rivers-from-tnm.ts` (multi-HUC support + INSERT
  mode + `--apply`). Bourbeuse 148.6 mi (HUC 07140103), Gasconade 261.3 mi
  (10290201+10290203), Black 194.7 mi (11010007), St. Francis 122.8 mi
  (08020202), Buffalo 148.3 mi (11010005). Endpoints verified against real
  mouths; direction_verified=true (NHD flowlines are downstream-oriented).
- **nws_lid backfill**: HTGM7/UNNM7 (Bourbeuse), HZLM7/JRMM7/RIFM7 (Gasconade),
  ANNM7 (Black), ROZM7/PAZM7 (St. Francis) + **SJOA4** for Buffalo St. Joe
  07056000 (discovered via NWPS's own usgsId cross-reference; the other Buffalo
  gauges have no NWS forecast points).
- **Sign-off + ingest**: all 5 dossiers flipped to SIGNED-OFF (owner go-ahead
  "push the rivers to prod") and ingested with `--apply`. Bourbeuse
  reclassified `spring_fed_float`→`rain_flashy` at sign-off (Agnew: runoff-fed;
  the dossier had flagged spring_fed as WRONG for the speed curve).
  10 river_gauges threshold sets, 12 river_sections, 5 river_characteristics.
- **Flood stages**: written for all 6 MO LIDs + SJOA4 (e.g. Annapolis
  action 6 / flood 8 ft). Fixed `fetch-nws-flood-stages.ts` write path
  (nws_lid was being written to the wrong table; curated threshold_source is
  no longer overwritten — official stages layer alongside, per 00114).
- **Roselle provider=nws**: implemented `src/lib/flow-providers/nws.ts`
  (NWPS gauge API, siteId = NWS LID, kcfs→cfs normalization, -999 sentinels),
  registered as `nws`, smoke-tested live (ROZM7 → 1.87 ft). DB:
  gauge_stations 07034000 now `provider='nws'`, `site_id_external='ROZM7'`.
- **Ingest hardening**: threshold_source now classified to the DB enum
  (usgs/nws_ahps/outfitter/editorial — prose citations stay in the dossier);
  `low == optimal_min` shared-edge bands drop the redundant low anchor
  (validator requires strictly increasing levels); level columns are written
  null-when-absent so re-ingests are idempotent.
- **Cleanup**: the 4 discontinued reference gauges created by ingest
  (07016400, 07015750, 07061400, 07061170) set `active=false` — they are
  documented non-realtime and must not be polled.
- **Validation + activation**: `validate_river_data()` → **0 errors** on the
  new rivers. `active=true` for **bourbeuse, gasconade, st-francis, buffalo**.
  **Black stays inactive** — its floatability ladder is still optimal_min-only
  (Annapolis 180 cfs observed); complete the ladder before activating.

## Remaining / follow-ups

1. **Deploy the app code** (this branch → main → Vercel). Until then the
   deployed cron skips provider='nws' gracefully and Roselle shows no fresh
   reading; the other 4 rivers work with the currently-deployed code.
2. **stale_gauge warnings** (Buffalo St. Joe "never", Roselle "1997") clear on
   the first cron pass after deploy.
3. **Black**: complete the ladder (too_low/low/optimal_max/high from an Agnew
   navigability table or Lesterville outfitter guidance), re-ingest, then
   validate + activate.
4. **Access points** [manual]: place put-ins/take-outs in admin per the
   dossiers' proposed names + river miles (never script-written).
5. **Gasconade lower reach** (Rich Fountain RIFM7): no ladder yet — encode when
   a source lands; mid reach (Jerome) is optimal_min-only.
6. **Buffalo good/flowing split**: NPS tables give best-effort splits;
   refine if NPS publishes finer bands. Pruitt gauge if a finer upper/middle
   split is wanted.
7. VBNM7 (Current at Van Buren) 404s on NWPS — its LID may have changed;
   re-discover when touching the legacy rivers.

## Notes (calibration decisions, unchanged)

- moherp OBSERVED ladders are trip-report-calibrated (accuracy-approved). moherp
  ESTIMATED and USGS percentiles are REJECTED as thresholds — Annapolis proved
  it: estimated Good 536 cfs vs observed Good 180 cfs, real trips floating Good
  at 189/192.
- Longer-term: grow Eddy's own observed tier via community_reports (0 rows) —
  trip logs at known discharge replicate moherp's method in-house.
