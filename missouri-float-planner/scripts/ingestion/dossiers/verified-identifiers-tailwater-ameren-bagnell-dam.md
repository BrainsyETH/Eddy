# Verified Identifiers — Bagnell Dam (Osage River / Lake of the Ozarks, MO) · ameren-bagnell-dam

Primary-source transcription from Ameren Missouri's hydro reporting API,
probed live 2026-08-15. The first NON-FEDERAL dam in the registry: FERC
license No. 459, no Corps district, no CWMS, no SWPA column. Companion:
`docs/DAM_EXPANSION_SURVEY_2026-08.md` §3 (how the API was found after the
legacy .aspx reports died) and `src/lib/ameren/osage.ts` (the client).

## The API (all unauthenticated GETs on www.ameren.com)

### metrics source ✅ `/api/ameren/Hydroelectric/getHeadWaterTailWaterReportData`
- `?startDate=MM/DD/YYYY&endDate=MM/DD/YYYY&interval=1h&zone=`
- Rows: `{dateTimeStamp, headWaterLevel, tailWaterLevel, discharge, intakeDO,
  intakeTDG}` — **numbers as strings**, stamps in **America/Chicago wall
  clock** (pinned against the SHEF twin below: 00:00 local ↔ 05:00Z,
  identical values). `interval=15m` also works.
- Probed live: pool 659.04 ft, tailwater 551.87 ft, 1,033 cfs at 12:00
  Central. Registry mapping: headWaterLevel → poolElevation, tailWaterLevel →
  tailwaterElevation (with the standard 3-hour trend), discharge → release.
- intakeDO / intakeTDG (dissolved oxygen, total dissolved gas) parsed by no
  metric yet — no registry concept for water-quality gas; recorded here so
  the exclusion is deliberate.

### Truman rider ✅ `/api/ameren/Hydroelectric/getBagnellDamDailyReportData`
- `?startDate=…&endDate=…` → `{dischargeData: hourly cfs, levelandFlowData:
  {dateTimeStamp, hstDamHeadLevelAtMidnight, damOutflow,
  lakeOzarkInflowYesterday, lakeOzarkInflow7DayAve, prescribedMinFlow,
  bagnellDamDischargeYesterday, bagnellDamAnticipatedDischargeToday}}`
- `hstDamHeadLevelAtMidnight` (705.51 ft) and `damOutflow` (1,509 cfs) feed
  `nwk-truman-dam`'s poolElevation and release — the only observed Truman
  data anywhere (Kansas City publishes nothing to CWMS). About a day in
  arrears; the readings carry the report's own stamp and render dimmed with
  their age, which is the truth.
- `bagnellDamAnticipatedDischargeToday` (8,000 cfs on probe day) is Ameren's
  stated PLAN for the day — parsed by nothing yet. Surfacing a daily
  intent figure needs its own copy discipline (a plan may not wear a
  measurement's voice); deliberate follow-up, not an oversight.
- `prescribedMinFlow` (1,142 cfs) is the FERC minimum — also unrendered.

### SHEF twin ✅ `/api/ameren/Hydroelectric/getDailyShefitGMTReport?interval=1h`
- Same values as NWS SHEF text, GMT stamps (`BAGLAMUE…  HF/HT/QR`). Used to
  pin the JSON timezone; not consumed by the client.

## Facts

- Nameplate **8 main units × 21.5 MW, 176 MW licensed** — the FERC Biological
  Opinion's own figure ("8 main turbines … total installed capacity of
  176.0 MW", plus two 2 MW station-service units). 2026-08-15.
- Coordinates 38.2019 / -92.6228 — Wikipedia/FERC relicensing records; no
  CWMS location exists to prefer.
- `tailwaterFishery: 'warmwater'` — paddlefish, catfish and crappie water
  below a shallow reservoir; nothing hypolimnetic.
- infoPhone **573-365-9205** — Ameren's recorded Lake of the Ozarks daily
  operations report (Ameren mediaroom).
- No generationFlow: Ameren publishes total discharge only, so `generating`
  stays null. Bagnell spills through gates as well as turbines; inferring
  generation from discharge is forbidden for the same reason
  releaseExcludesGeneration is declared, never derived.
- Downstream cross-check: USGS `06926000` (Osage River near Bagnell) runs
  15-minute discharge+stage a few miles down and agreed with the morning's
  release pattern on probe day. It joins Eddy through the normal USGS
  pipeline the day an Osage reach exists — it is a river gauge, not a dam
  metric.
