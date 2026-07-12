# Verified Identifiers — Elk River (MO)

Primary-source transcription for the Elk River dossier, distilled from
elk-findings-partial.md (USGS-verified tier). The [verify] gate for
ingest-dossier.ts: every `gauges[].siteId` in elk.json must appear below.
Status is AWAITING SIGNOFF — this file clears the identifier gate; the
threshold/optimal signoff is still open (see elk.json `_status`).

## USGS gauges (transcribed)

### 07189000 — Elk River near Tiff City, MO  ✅ ACTIVE (PRIMARY / only mainstem gauge)
- dec lat/lon: 36.63146, -94.58689 (NAD83) · drainage 851 sq mi · McDonald Co · HUC 11070208
- params: uv 00060 (discharge, cfs) + uv 00065 (gage height, ft). POLLABLE.
- NWS LID TIFM7 (action 13 ft · minor flood 15 ft) — CROSS-CHECK ONLY, not the
  danger anchor. The dangerous badge is the outfitter recreational ceiling
  (6.5 ft gage height), deliberately NOT the NWS flood stage.
- ⚠ BIAS: sits near the OK line (~river mile 45) BELOW the Indian Creek
  confluence (Indian Creek enters ~mile 30 and roughly doubles the flow), so it
  OVER-READS the popular upper Pineville–Noel reach. This is the reach's only
  real-time mainstem gauge, so it is still the representative gauge.

## Gauges deliberately EXCLUDED from gauges[] (not mainstem representatives)

### 07188653 — Big Sugar Creek near Powell, MO  (tributary / feeder)
- One of the two forming tributaries above Pineville; NOT the Elk mainstem.
- Drainage area NOT pinned (toVerify). Do NOT transfer its cfs to the mainstem.
- Excluded from gauges[] on purpose — kept here for the record only.

### Indian Creek gauge — UNRESOLVED (conflicting candidates)
- 07188885 (near Lanagan) vs 07188870 (at Anderson) — the findings conflict and
  neither was verified on a monitoring-location page. Resolve before adding
  Indian Creek as a secondary/context gauge.

## Other identifiers
- GNIS feature id: **01092538** (Elk River) — the stable app identifier while
  the NHD PID is undecided.
- NHD: NO single Permanent_Identifier — the mainstem is ~100 flowline segments.
  Representative mainstem PIDs surfaced: 86154849 / 86155179 / 86154487.
  nhdFeatureId in elk.json left "UNKNOWN" pending a chosen representative reach.

## Ingest readiness / ACTION
- Representative gauge = 07189000 (active, mainstem, only real-time option).
- [verify] gate: CLEARED for 07189000 (the sole gauge in gauges[]).
- STILL BLOCKING SIGNOFF: no OBSERVED optimal gage-height band exists on the
  Elk mainstem (only a stale 2010 'Low' at 3.56 ft; the ESTIMATED 'Good' ~482
  cfs is rejected). Until an observed 'Good' level is captured, the badge reads
  'low' across the whole 3.5 → 6 ft floatable range. Capture an observed
  optimal, then flip elk.json `_status` to SIGNED-OFF.
- Also pending: access-point coordinates (human places every point [manual]);
  Big Sugar Creek drainage area; Indian Creek gauge id; NHD representative PID.
