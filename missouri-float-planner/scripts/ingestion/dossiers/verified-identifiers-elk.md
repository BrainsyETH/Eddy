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

## 2026-07-13 — PRIMARY GAUGE IS DEAD; ELK HELD INACTIVE (blocker)

Verified against USGS at go-live: **07189000 (Tiff City) can no longer drive the
Elk badge.**
- Its `00065` gage height returns the `-999999` no-data sentinel and the daily-
  value record has **no gage-height series at all** — only discharge (`00060`),
  and that stopped **2026-04-27** (301 days 2025-07-01→2026-04-27, then nothing).
  So the sensor behind the stale-2010 3.56 ft 'Low' is defunct; the reach's
  ft-based ladder (too_low 2.5 / optimal 3.5–5 / dangerous 6) has no live feet to
  read. The research note here ("uv 00065 … POLLABLE") is now FALSE.
- Only live mainstem gauge on the Elk is **07188925 "Elk Rv at MO-59, Noel, MO"**
  (the research missed it). It reports gage height, but on a **different datum**:
  6-week record (starts 2026-06-02) min 5.81 / median 6.42 / p90 7.62 / max 11.29,
  currently 5.84 ft. The Tiff City ladder does NOT transfer — 6 ft "dangerous"
  sits *below* Noel's normal stage, so keeping the old thresholds would read
  "Dangerous" almost always. No NWS AHPS flood stages published for Noel.

**Decision:** Elk rolled back to `active=false`. Access points (5 approved),
services (7), prose, weather, geometry are all in place and correct — only the
gauge/threshold core is blocked. To finish Elk: pick 07188925 (Noel) as primary,
then calibrate an OBSERVED floatable ladder on the Noel datum (needs outfitter /
observed-level guidance — 6 weeks of record is not enough alone), or wait for
07189000 to resume + confirm it emits real feet. Do NOT ship estimated thresholds.
