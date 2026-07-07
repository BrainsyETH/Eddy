# River Onboarding — Deployment Status & Runbook

_Last updated 2026-07-06 (DB state verified live via Supabase MCP, project FloatMe / ilefwfpvphadsbptiaur)._

Covers the 4 new Missouri rivers + Buffalo (AR). The research dossiers are done;
this file is the bridge from dossier → live on eddy.guide.

## Confirmed production DB state (read-only recon)

- **8 rivers** live: big-piney (inactive), courtois, current, eleven-point,
  huzzah, jacks-fork, meramec, niangua. **None** of our 5 exist yet.
- **270 gauge_stations**; **14 of our 18 gauges already present, active, coords
  matching the dossiers exactly** (all representatives incl. Poplar Bluff
  07063000 + Williamsville 07062575). The 4 discontinued gauges
  (07016400/07015750/07061400/07061170) are correctly absent.
- `gauge_stations.nws_lid` is **null on all** → our verified LIDs are a clean
  additive backfill (UNNM7/HTGM7, ROZM7/PAZM7, ANNM7, HZLM7/JRMM7/RIFM7).
- Schema present and matches ingest-dossier.ts: rivers, river_gauges,
  river_sections, river_characteristics, gauge_stations, access_points,
  float_segments, river_mile_markers.
- OPEN schema question (MCP dropped before confirming): is `rivers.geom`
  NOT NULL? Determines whether a rivers row can be created before NHD geometry.

## The one true blocker: rivers rows need geometry

ingest-dossier.ts refuses if the `rivers` row is absent and **will not invent
geometry**. Geometry comes from NHD via import-nhd-rivers-from-tnm.ts (National
Map) or the seed path — and National Map is egress-blocked in the current
environment. So river creation must happen from an environment with either
outbound access to the National Map, or the NHD flowline seed files.

## Per-river readiness

| River | Dossier | Verify gate | Floatability | Blockers to live |
|---|---|---|---|---|
| **Bourbeuse** | STUB+RUN3 | ✅ clear | ✅ full, 2 reaches (Agnew) | geometry · signoff · apply (danger anchors RESOLVED->high 2026-07-06) |
| **St. Francis** | STUB+RUN2 | ✅ clear | ✅ full Roselle ft ladder | geometry · signoff · **Roselle provider=nws wiring** · apply |
| **Gasconade** | STUB+RUN1 | ✅ clear | ✅ upper+mid (moherp observed); lower open | geometry · signoff · apply · (lower-reach ladder later) |
| **Black** | STUB+RUN1 | ✅ clear | ◐ optimal_min only (moherp observed) | geometry · signoff · **rest of ladder** · apply |
| **Buffalo** (AR) | ✅ clear | ✅ 24 anchors, 4 reaches (NPS) | geometry · signoff · apply (coords backfilled 2026-07-07 → all 7 gauge_stations will create at ingest) |

## Go-live sequence (per river)

1. **Create the rivers row + geometry** — from an unblocked env:
   `npx tsx scripts/import-nhd-rivers-from-tnm.ts <slug>` (or seed path).
2. **Backfill nws_lid** on the existing gauge_stations (safe, additive) so
   fetch-nws-flood-stages.ts can attach flood/action stages. Verified LIDs are
   in the verified-identifiers-*.md files.
3. **Owner sign-off**: review thresholds, then set `_status` to begin with the
   literal token `SIGNED-OFF`. Danger-anchor decisions to make first:
   - Bourbeuse: bump Agnew high/dangerous cfs from `medium`→`high` (Agnew is the
     authoritative MO float source) OR add a 2nd source — else the [safety] gate
     holds them (currently 4 flags).
   - Others: no danger-anchor block (St. Francis high=6 ft confidence high;
     Gasconade/Black high anchors carry trip corroboration).
4. **Ingest**: `npx tsx scripts/ingestion/ingest-dossier.ts dossiers/<slug>.json --apply`
   (needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY). Writes river
   fields, river_gauges thresholds, river_sections, river_characteristics.
   Reuses existing gauge_stations (does not duplicate).
5. **Flood stages**: `npx tsx scripts/fetch-nws-flood-stages.ts --write`.
6. **St. Francis only**: confirm the FlowProvider routes provider=`nws`/ROZM7
   for gauge 07034000 (USGS discharge dead since 1997) and polls param 00065 ft.
7. **Access points** [manual]: human places put-ins/take-outs in admin (dossiers
   propose names + river-miles; access_points table already has 233 rows).
8. **Validate + activate**: run validate_river_data('<slug>'), then flip
   `rivers.active = true`.

## Notes
- moherp OBSERVED ladders are trip-report-calibrated (accuracy-approved). moherp
  ESTIMATED and USGS percentiles are REJECTED as thresholds (see the calibration
  decision in black.json/gasconade.json research notes) — Annapolis proved it:
  estimated Good 536 cfs vs observed Good 180 cfs, real trips floating Good at
  189/192.
- Longer-term: Eddy already has the gauges + users to grow its OWN observed tier
  (community_reports table exists, 0 rows) — trip logs at known discharge would
  replicate moherp's method in-house and reduce dependence on scattered sources.
