# Verified Identifiers — Wolf Creek Dam (Lake Cumberland, KY) · lrn-wolf-creek-dam

Primary-source transcription from the CWMS Data API, office **LRN**, probed
live 2026-08-15. Every registry series id must appear here with its probe
result. Companion: `docs/DAM_EXPANSION_SURVEY_2026-08.md` (district-wide
findings), and the LRN block comment in `usace-registry.ts` (why cdaLocation
is omitted and resolution is off).

## CWMS stations (from /locations?office=LRN)

- `WLCK2-WOLF_CREEK` — public-name **"Wolf Creek Dam"**, Russell Co KY,
  36.868333 / -85.146944, US/Central. ← registry lat/lon (CWMS wins).
- `RWNK2-WOLF_CREEK` — public-name "Wolf Creek Dam Tailwater", Russell Co KY,
  36.883611 / -85.139444, US/Central.
- `Wolf Creek Dam` (prose name) — forecast-only namespace; /locations carries
  no coordinates for it (state "00").

## Registry series (transcribed verbatim, all probed 2026-08-15)

### release ✅ `RWNK2-WOLF_CREEK.Flow.Ave.1Hour.1Hour.man-rev`
- unit=cfs conversion confirmed (native cms). Hourly, current to the probe hour.
### generationFlow ✅ `RWNK2-WOLF_CREEK.Flow-Turbine.Ave.1Hour.1Hour.man-rev`
- 300 points read over 2026-08-03..15. Idle = exactly 0 every idle hour; min
  real unit-hour 3,550 cfs; max 19,800 cfs. → `generationOnCfs: 100`.
### releaseForecast ✅ `Wolf Creek Dam.Flow.Ave.1Hour.1Hour.celrn-cwms-forecast`
- Hourly, cfs, ran to 2026-08-24 on probe day (~9 days). Total outflow.
- ⚠ retains its past BYTE-IDENTICAL to man-rev observed (3 hours checked
  equal) — any rendering must slice at now.
### generationForecast ✅ `Wolf Creek Dam-Turbines.Flow.Ave.1Hour.1Hour.celrn-cwms-forecast`
- Turbine component of the same forecast: 121 hourly points read, clean
  peaking blocks (0 ↔ 15,720-15,840 cfs). Drives the `generationForecast`
  windows on the wire (src/lib/data/dam-forecast.ts). Same slice-at-now
  hazard as above. Timestamp convention verified PERIOD-ENDING against the
  instantaneous tailwater stage: at 2026-08-13T17:00Z the Inst Elev-Tail was
  already +3.1 ft while 17:00Z carried the first nonzero turbine value —
  water moved during 16-17Z, so a point stamped t averages [t-1h, t).
### poolElevation ✅ `WLCK2-WOLF_CREEK.Elev-Pool.Inst.1Hour.0.man-rev`
- unit=ft confirmed: 706.5 ft on probe day.
### inflow ✅ `WLCK2-WOLF_CREEK.Flow-In.Ave.1Hour.1Hour.man-rev`
### tailwaterElevation ✅ `RWNK2-WOLF_CREEK.Elev-Tail.Inst.1Hour.0.man-rev`
- ⚠ the `dcp-rev` sibling DIED 2025-10-24; man-rev is the live version.

## Not in series (recorded so the exclusion is deliberate)

- `RWNK2-WOLF_CREEK.Temp-Water-Tail.Inst.30Minutes.0.dcp-rev` — DEAD since
  2022-02-03. No live tailwater temperature at this project; the trout
  declaration is sourced, not inferred (see below).
- `RWNK2-WOLF_CREEK.Flow-{Spillway,Sluice,Orifice,Hatchery}` (man-rev, live) —
  per-component release; no registry metric exists for components.
- `RWNK2-WOLF_CREEK.Energy.Total.1Hour.1Hour.{man-rev,tva-fct}` — observed MWh
  and TVA's ~2-day dispatch forecast; no registry metric. The tva-fct series
  is evidence TVA dispatches the Cumberland system (survey doc §1).
- All `RWNK2-*.celrn-cwms-forecast` ~1Day series — stale (2024-11-26); the
  live forecast moved to the prose-name namespace.

## Facts

- Nameplate **6 × 45 MW = 270 MW** — DOE Wolf Creek DO recon report
  (energy.gov), corroborated by Corps powerhouse tour materials. 2026-08-15.
- `tailwaterFishery: 'trout'` — Kentucky's trophy brown trout tailwater on
  the Cumberland; Wolf Creek National Fish Hatchery immediately below the dam
  (the station's own `Flow-Hatchery` series names it).
- No SWPA code — Cumberland power is marketed by SEPA (no loading page, no
  MW/cfs table) → no `generationReference`, no `schedule`.
- infoPhone: none recorded — no release-information line was verified this
  session; do not invent one.
