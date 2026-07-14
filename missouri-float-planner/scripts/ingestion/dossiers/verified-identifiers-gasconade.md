# Verified Identifiers — Gasconade River (MO)

Primary-source transcription from the USGS Site Service + NWPS, owner-provided
2026-07-06. [verify] gate for ingest-dossier.ts.

## USGS gauges (transcribed verbatim) — all three POLLABLE

### 06928000 — Gasconade River near Hazelgreen, MO  ✅ ACTIVE (upper reach representative)
- dec lat/lon: 37.75913889, -92.4520278 (NAD83) · drainage 1250 sq mi · NAVD88 (gage 845.04) · Pulaski Co · HUC 10290201
- uv 00060 (2001-01-08 → 2026-07-06); uv 00065 (2007-10-01 → 2026-07-06). Daily to 1928. NWS LID HZLM7.

### 06933500 — Gasconade River at Jerome, MO  ✅ ACTIVE (middle reach representative)
- dec lat/lon: 37.92991667, -91.9773333 (NAD83) · drainage 2840 sq mi · NAVD88 (gage 657.82) · Phelps Co · HUC 10290203
- uv 00060 (1995-01-26 → 2026-07-06); uv 00065 (2007-10-01 → 2026-07-06). Daily to 1903; peaks to 1897. NWS LID JRMM7.

### 06934000 — Gasconade River near Rich Fountain, MO  ✅ ACTIVE (lower reach representative)
- dec lat/lon: 38.38880556, -91.8198889 (NAD83) · drainage 3180 sq mi · NAVD88 (gage 553.75) · Osage Co · HUC 10290203
- uv 00060 (1995-05-18 → 2026-07-06); uv 00065 (2007-10-01 → 2026-07-06); also temp(00010) 2017–2021. NWS LID RIFM7.

## NWS flood categories (NWPS JRMM7 = USGS 06933500), verbatim — RESOLVES the earlier CONFLATION
- action 13 ft · minor 15 ft · moderate 25 ft · major 30 ft
- The WebSearch tier had wrongly reported "action 18.5–20.5 ft" — those are per-foot IMPACT
  statements (fence line 20.5, left-bank overflow 19, low-lying residential 18.5), NOT the
  action category. Clean category ladder is 13/15/25/30 ft. Record crest 35.06 ft / 197,000 cfs (2017-05-01).
- upstream LID HZLM7, downstream LID RIFM7. HZLM7 & RIFM7 category sets not in this batch — capture if needed.

## Ingest readiness / ACTION
- All three reach representatives (Hazelgreen, Jerome, Rich Fountain) are POLLABLE (00060+00065).
  Coordinates + drainage areas ready to backfill into gasconade.json.
- Still needed before signoff: gauge-keyed cfs FLOATABILITY thresholds (none captured — an
  Al Agnew / OzarkAnglers "Gasconade River Overview" would supply them).

## 2026-07-14 — dangerous anchor added (BEST-EFFORT, owner directive)
Per owner best-effort directive: **dangerous = 3000 cfs** = USGS 06928000 day-of-year **p95 ≈ 2980**
(mid-July, 1929–2025). A statistical high-flow proxy, NOT an outfitter-vetted don't-float level;
the NWS flood stage remains unusable as the anchor (far above floatable). Revisit if a real cutoff surfaces.
