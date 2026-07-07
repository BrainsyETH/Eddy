# Gasconade River (MO) — Research Findings (WebSearch tier, run 1)

> **Method.** Direct fetch (WebFetch/curl/workflow) is 403-blocked by this
> environment's egress policy; the deep-research *workflow* also failed twice
> here (scope agent retry-cap under session load). Gathered instead via the
> **WebSearch tool** (synthesized index reads). Confidence tags:
> - `CONFIRMED-ID` = site#↔name↔NWS-ID cross-checked across ≥2 results.
> - `SEARCH-DERIVED` = number from one search synthesis; verify vs source page.
> - `PARTIAL/CONFLATED` = search mixed up values; do NOT trust as-is.

## Gauges (CONFIRMED-ID — names/numbers cross-checked; lat/lon still to fetch)

| USGS # | Name | NWS ID | Notes |
|---|---|---|---|
| 06928000 | Gasconade River near Hazelgreen, MO | HZLM7 | upper reference |
| 06933500 | Gasconade River at Jerome, MO | JRMM7 | mid reference (Jerome/Waynesville float hub) |
| 06934000 | Gasconade River near Rich Fountain, MO | RIFM7 | lower reference |
- All three collect discharge (00060) + gage height (00065) per USGS listings.
- Still to fetch per gauge: lat/lon, datum, drainage area, active params.

## NWS flood categories — Jerome JRMM7 (`PARTIAL/CONFLATED` — do NOT use as-is)

Search synthesis was internally inconsistent (it mislabeled impact thresholds):
- Reported "minor 15 ft", "moderate 25 ft", "major >30 ft" — plausible, monotonic.
- BUT also reported "action 18.5–20.5 ft", which is **higher than the stated
  minor (15)** — impossible for a real action<minor<moderate ladder. The fast
  model conflated NWS categories with per-foot impact notes.
- Record stage: **35.06 ft on May 1, 2017** (plausible; single-source).
- **Verdict:** treat Jerome flood categories as UNRESOLVED. Fetch
  water.noaa.gov/gauges/jrmm7 for the clean action/minor/moderate/major set
  before any danger anchor. Hazelgreen (HZLM7) & Rich Fountain (RIFM7) flood
  categories NOT captured at all.

## Reach anchor — floatability (WEAK; no gauge-keyed cfs threshold captured)

`SEARCH-DERIVED, qualitative only` (generic missourigreatoutdoors-style rating text)
- Keyed loosely to Jerome (06933500) but **no numeric cfs/ft** given.
- good = boats drag <¼ riffles, portages rare; low = most riffles drag, reduce
  float length; poor = too low, most/all riffles drag/portage, avoid.
- **Open:** minimum floatable / ideal / too-high in cfs keyed to Hazelgreen,
  Jerome, or Rich Fountain.

## Access points + mileage (INCOMPLETE)

- MCFA Gasconade page exists (missouricanoe.org/gasconade-river/); FloatMissouri
  has a Gasconade page. Mileage table not surfaced in snippets.
- Float hub around Jerome / Waynesville (upper–mid river).
- **Open:** put-in→take-out reach table w/ river-miles + float hours.

## River character

- Longest river entirely within Missouri; low-gradient Ozark float stream,
  Class I; spring-influenced but with significant runoff; smallmouth fishery.
- Very long — multiple reaches (Hazelgreen upper → Jerome mid → Rich Fountain
  lower) each with its own gauge; likely a per-reach treatment.

## Open questions → next fetch pass (unblocked env)

1. Clean NWS flood category set for JRMM7 (Jerome) — current set is CONFLATED;
   plus HZLM7 and RIFM7 sets (not captured).
2. Gauge-keyed floatability thresholds (cfs) for Hazelgreen / Jerome / Rich Fountain.
3. lat/lon + params for all 3 gauges; confirm platform poll targets.
4. Full MCFA/MDC reach mileage + access-point table with float times.
5. Confirm reach segmentation + river_type (spring-influenced float, flashiness).
