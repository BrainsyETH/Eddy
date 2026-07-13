# Verified Identifiers — North Fork River (North Fork of the White, MO)

Primary-source transcription from the USGS Site Service, owner-provided 2026-07.
[verify] gate for ingest-dossier.ts — every gauges[].siteId must appear here.

## USGS gauges (transcribed verbatim)

### 07057500 — North Fork River near Tecumseh, MO  ✅ ACTIVE (PRIMARY; only pollable gauge on the North Fork)
- https://waterdata.usgs.gov/monitoring-location/USGS-07057500/
- dec lat/lon: 36.62303, -92.24814 (NAD83) · drainage 561 sq mi · Ozark Co · HUC 11010006
- params: uv 00060 (discharge, cfs) + uv 00065 (gage height, ft). POLLABLE.
- NWS LID TNZM7 (action 18 ft / minor flood 20 ft — CROSS-CHECK ONLY; ~10x floatable stage, not a threshold source).
- Position: at "The Forks" (North Fork + Bryant Creek confluence), float mile 49.1 — the DOWNSTREAM END of the run. Known bias: OVER-READS the upper reach.
- NHD at this gauge: ComID 7650991 / reachcode 11010006000122 (whole-river PID still UNKNOWN — see dossier toVerify).

## Not in gauges[] (recorded so the exclusion is deliberate)

### 07058000 — Bryant Creek near Tecumseh, MO  — SEPARATE TRIBUTARY (excluded)
- Bryant Creek is a distinct tributary (drainage ~570 sq mi) that joins the North Fork at The Forks; it has its own float community and is NOT the North Fork mainstem. Intentionally omitted from this river's gauges[].

## Ingest readiness / ACTION
- Representative + primary for the north-fork-main reach = 07057500 (active, pollable). It is the ONLY North Fork gauge, so no alternative-representative judgment call is needed.
- Thresholds encoded: too_low 285 / optimal_min 475 / optimal_max 628 / high 1000 cfs (moherp OBSERVED, all quoted natively in cfs against 07057500 — no unit conversion).
- STILL NEEDED before SIGNED-OFF: a dangerous / do-not-float anchor (none exists yet — the highest logged trip, 1230 cfs, rated only 'High'). Source it from the 5 North Fork outfitters (Sunburst 417-284-3443 / Dawt Mill 417-284-3540, etc.). Access-point coordinates are [manual] — a human places every pin; only Tecumseh has a from-gauge estimate.
