# Black River (MO) — Research Findings (WebSearch tier, run 1)

> **Method.** Direct fetch (WebFetch/curl/workflow) is 403-blocked by this
> environment's egress policy. Gathered via the **WebSearch tool** (synthesized
> index reads). Confidence tags:
> - `CONFIRMED-ID` = site#↔name↔NWS-ID cross-checked across ≥2 search results.
> - `SEARCH-DERIVED` = number from a single search synthesis; verify vs source page.
> - Danger-level rule: flood numbers need a 2nd independent source or stay low-confidence.

## Gauges (CONFIRMED-ID — names/numbers cross-checked; lat/lon still to fetch)

| USGS # | Name | NWS ID | Notes |
|---|---|---|---|
| 07061500 | Black River near Annapolis, MO | ANNM7 | main reference; HCDN long-record station; Rolla FO; discharge (00060) + gage height (00065) |
| 07061600 | Black River below Annapolis, MO | — | just downstream |
| 07061400 | Black River near Lesterville, MO | — | Reynolds County; record to 1993 |
| 07061270 | East Fork Black River near Lesterville, MO | — | tributary; also an AW gauge (id 6922) |
| 07061170 | Middle Fork Black River near Lesterville, MO | — | tributary |
- Still to fetch per gauge: lat/lon, datum, current active parameter list.
- ⚠️ Reference-gauge ambiguity: floatability guidance may key to a fork
  (East/Middle Fork at Lesterville) vs the main Annapolis gauge — pin the
  reference before ingesting any level number.

## NWS flood categories — Annapolis ANNM7 (`SEARCH-DERIVED`, single-source — NEEDS 2nd source)

| Category | Stage (ft) |
|---|---|
| Action | 6.0 |
| Minor | 8.0 |
| Moderate | 15.0 |
| Major | 25.0 |
- Reference gauge STATED (ANNM7 / 07061500 Annapolis); unit STATED (ft). ✓
- Complete, monotonic set (good sign) but from ONE search synthesis. Per the
  danger-level rule, **corroborate against water.noaa.gov/gauges/annm7 (or
  USACE swl-wc anapolis table) before it drives live danger warnings.**

## Reach anchor — floatability (WEAK; no gauge-keyed cfs threshold captured)

`SEARCH-DERIVED, qualitative only`
- Popular reach: **Lesterville → Highway K (west of Annapolis)**.
- Generic guidance only: "good" = boats drag on <¼ of riffles, portages rare;
  "low" = most riffles drag, reduce float length; "too low" = most/all riffles
  drag or portage, avoid for casual trips. **No numeric cfs/ft threshold and no
  named reference gauge surfaced** — reference UNSTATED.
- Current-conditions snapshot (NOT a threshold): East Fork at Lesterville
  reading ~11 cfs / 1.12 ft at time of search.
- **Open:** minimum floatable / ideal / too-high in cfs or ft keyed to a named
  Black River gauge.

## Access points + mileage (INCOMPLETE)

- MCFA Black River page exists (missouricanoe.org/black-river/); mileage table
  not surfaced in snippets. Lesterville chamber lists float trips
  (lestervillemissouri.com/float-trips/).
- Towns along river: **Lesterville, Annapolis, Piedmont**.
- **Open:** put-in→take-out reach table w/ river-miles + float hours.

## River character

- Spring-influenced Ozark float stream (Lesterville area, upper Black); Class I
  with some faster water; popular family float + smallmouth. Below Clearwater
  Lake / toward Poplar Bluff it flattens.
- Note the multi-fork headwaters (East/Middle/West Forks near Lesterville) each
  with its own gauge — relevant to which reach a level reading represents.

## Open questions → next fetch pass (unblocked env)

1. Corroborate ANNM7 flood categories (6/8/15/25 ft) against a 2nd source.
2. Gauge-keyed floatability thresholds (cfs or ft) for the Lesterville→Annapolis reach.
3. lat/lon + active params for all 5 gauges; confirm which is the platform's poll target.
4. Full MCFA/MDC reach mileage + access-point table with float times.
5. Confirm per-reach river_type (upper spring-influenced float vs lower flatter).
