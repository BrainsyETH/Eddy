# Verified Identifiers — Dale Hollow Dam (Obey River, TN) · lrn-dale-hollow-dam

Primary-source transcription from the CWMS Data API, office **LRN**, probed
live 2026-08-15. Every registry series id must appear here with its probe
result. Companion: `docs/DAM_EXPANSION_SURVEY_2026-08.md` and the LRN block
comment in `usace-registry.ts`.

## CWMS stations (from /locations?office=LRN)

- `DLHT1-DALE_HOLLOW` — public-name **"Dale Hollow Dam"**, Clay Co TN,
  36.538333 / -85.451111, US/Central. ← registry lat/lon (CWMS wins).
- `DHTT1-DALE_HOLLOW` — public-name "Dale Hollow Dam Tailwater", Clay Co TN,
  36.547222 / -85.461111, US/Central.
- `Dale Hollow Dam` (prose name) — forecast-only namespace, no coordinates.

## Registry series (transcribed verbatim, all probed 2026-08-15)

### release ✅ `DHTT1-DALE_HOLLOW.Flow.Ave.1Hour.1Hour.man-rev`
### generationFlow ✅ `DHTT1-DALE_HOLLOW.Flow-Turbine.Ave.1Hour.1Hour.man-rev`
- 301 points over 2026-08-03..15. Idle = exactly 0, with occasional 25-50 cfs
  hours units-off; **min real unit-hour 1,580 cfs — the smallest single-unit
  figure in the district trio**, pinned in usace-registry.test.ts as the
  ceiling reference for LRN floors; max 4,870 cfs. → `generationOnCfs: 100`.
### releaseForecast ✅ `Dale Hollow Dam.Flow.Ave.1Hour.1Hour.celrn-cwms-forecast`
- Hourly to 2026-08-24, total outflow. Same slice-at-now caution as Wolf Creek.
- NOTE: the project's hourly `-Sluice Gates` forecast is stale (2021-02) while
  its ~1Day sibling is current — one more reason gate-component series stay out.
### generationForecast ✅ `Dale Hollow Dam-Turbines.Flow.Ave.1Hour.1Hour.celrn-cwms-forecast`
- Turbine component: 228 hourly points read, max 4,800 cfs. Drives the
  `generationForecast` windows on the wire. Period-ending stamps — see the
  Wolf Creek dossier for the discrimination measurement.
### poolElevation ✅ `DLHT1-DALE_HOLLOW.Elev-Pool.Inst.1Hour.0.man-rev` (ft)
### inflow ✅ `DLHT1-DALE_HOLLOW.Flow-In.Ave.1Hour.1Hour.man-rev`
### tailwaterElevation ✅ `DHTT1-DALE_HOLLOW.Elev-Tail.Inst.1Hour.0.man-rev`
### tailwaterTempF ✅ `DHTT1-DALE_HOLLOW.Temp-Water-Tail.Inst.30Minutes.0.dcp-rev`
- unit=F confirmed: **50.7 °F on 2026-08-15**. dcp-rev only, 30-minute
  cadence; the 15-minute sibling died 2021-01.

## Not in series (deliberate exclusions)

- `DHTT1-DALE_HOLLOW.Flow-{Spillway,Sluice,Hatchery}` (man-rev, live) — no
  component metric; Flow-Hatchery feeds the Dale Hollow National Fish
  Hatchery below the dam.
- `DHTT1-DALE_HOLLOW.Energy.Total.1Hour.1Hour.{man-rev,tva-fct}` — no metric.
- No `%-Flood Pool` series exists at this project.

## Facts

- Nameplate **3 × 18 MW = 54 MW** — Corps project history ("a capacity of
  54,000 kilowatts, with each unit rated at 18,000 kilowatts"; units installed
  1948, 1949, 1953). 2026-08-15.
- `tailwaterFishery: 'trout'` — the Obey below the dam, with its own national
  fish hatchery; the water that produced the long-standing world-record brown
  trout. Temperature above is the deep-draw fact measured.
- No SWPA code (SEPA-marketed) → no `generationReference`, no `schedule`.
- infoPhone: none verified; do not invent one.
