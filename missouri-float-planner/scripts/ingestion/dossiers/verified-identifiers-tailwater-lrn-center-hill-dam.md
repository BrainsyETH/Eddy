# Verified Identifiers — Center Hill Dam (Caney Fork, TN) · lrn-center-hill-dam

Primary-source transcription from the CWMS Data API, office **LRN**, probed
live 2026-08-15. Every registry series id must appear here with its probe
result. Companion: `docs/DAM_EXPANSION_SURVEY_2026-08.md` and the LRN block
comment in `usace-registry.ts`.

## CWMS stations (from /locations?office=LRN)

- `CEHT1-CENTER_HILL` — public-name **"Center Hill Dam"**, De Kalb Co TN,
  36.0963889 / -85.8205556, US/Central. ← registry lat/lon (CWMS wins).
- `CETT1-CENTER_HILL` — public-name "Center Hill Dam Tailwater", De Kalb Co
  TN, 36.0975966 / -85.8261235, US/Central.
- `Center Hill Dam` (prose name) — forecast-only namespace, no coordinates.

## Registry series (transcribed verbatim, all probed 2026-08-15)

### release ✅ `CETT1-CENTER_HILL.Flow.Ave.1Hour.1Hour.man-rev`
### generationFlow ✅ `CETT1-CENTER_HILL.Flow-Turbine.Ave.1Hour.1Hour.man-rev`
- 301 points over 2026-08-03..15. Idle = exactly 0, with occasional 25-50 cfs
  hours units-off (leakage/station flow); min real unit-hour 2,525 cfs; max
  7,604 cfs. → `generationOnCfs: 100` (clears the noise, 25× under a unit).
### releaseForecast ✅ `Center Hill Dam.Flow.Ave.1Hour.1Hour.celrn-cwms-forecast`
- 228 hourly points to 2026-08-24 (~9 days), max 7,802 cfs. Total outflow.
  Same slice-at-now caution as Wolf Creek.
### generationForecast ✅ `Center Hill Dam-Turbines.Flow.Ave.1Hour.1Hour.celrn-cwms-forecast`
- Turbine component: 228 hourly points read, max 7,552 cfs. Drives the
  `generationForecast` windows on the wire. Period-ending stamps — see the
  Wolf Creek dossier for the discrimination measurement.
### poolElevation ✅ `CEHT1-CENTER_HILL.Elev-Pool.Inst.1Hour.0.man-rev` (ft)
### inflow ✅ `CEHT1-CENTER_HILL.Flow-In.Ave.1Hour.1Hour.man-rev`
### tailwaterElevation ✅ `CETT1-CENTER_HILL.Elev-Tail.Inst.1Hour.0.man-rev`
### tailwaterTempF ✅ `CETT1-CENTER_HILL.Temp-Water-Tail.Inst.30Minutes.0.dcp-rev`
- unit=F conversion confirmed (native C): **50.45 °F on 2026-08-15** — the
  hypolimnetic release measured, in August. NOTE: dcp-rev, not man-rev — no
  man-rev temperature series exists; the 15-minute dcp-rev sibling died
  2025-10-21. 30-minute cadence sits inside the default 8h lookback.

## Not in series (deliberate exclusions)

- `CETT1-CENTER_HILL.Flow-{Spillway,Sluice,Orifice}` (man-rev, live) — no
  component metric exists.
- `CETT1-CENTER_HILL.Energy.Total.1Hour.1Hour.{man-rev,tva-fct}` — MWh
  observed + TVA dispatch forecast; no registry metric.
- No `%-Flood Pool` series exists at this project.

## Facts

- Nameplate **3 × 45 MW = 135 MW** — power-technology plant profile ("3 units
  of Francis turbines, each with 45MW nameplate capacity") and the Corps'
  historical marker (135,000 kW). One trade headline said 155 MW for the
  2015-2021 Voith rehab; the rated figure remained 135. 2026-08-15.
- `tailwaterFishery: 'trout'` — the Caney Fork, Tennessee's most heavily
  fished trout tailwater, and the temperature above is the fact itself.
- No SWPA code (SEPA-marketed) → no `generationReference`, no `schedule`.
- infoPhone: none verified; do not invent one.
