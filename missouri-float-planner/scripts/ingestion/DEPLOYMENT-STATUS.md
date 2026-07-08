# River Onboarding — Deployment Status & Runbook

_Last updated 2026-07-07 (DEPLOYED to production, project FloatMe / ilefwfpvphadsbptiaur)._

Covers the 4 new Missouri rivers + Buffalo (AR). **The deploy has run**: this
file is now the record of what shipped and what remains.

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
- **Access points are NOT yet loaded.** The dossiers already contain researched
  access points (bourbeuse 17, gasconade 12, st-francis 5, black 4, buffalo 3 =
  41), but `ingest-dossier.ts` intentionally skips them (`accessPoints // [manual]`)
  and `preload-dossier-access-points.py` was never run against prod. The four
  active new rivers therefore show `accessPointCount: 0`. Dossier points carry
  name/type/ownership/section/mile-hint/source but **no exact lat/lon and none
  of the rich metadata** (parkingInfo, roadAccess, facilities, editorial
  description, images) that the original curated rivers have. Reaching parity =
  enrich those 41 points (exact coords + metadata) then load, verify, approve.

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
