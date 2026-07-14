# Verified Identifiers — St. Francis River (MO)

Primary-source transcription from the USGS Site Service + NWPS, owner-provided
2026-07-06. [verify] gate for ingest-dossier.ts.

## USGS gauges (transcribed verbatim)

### 07034000 — St. Francis River near Roselle, MO  ⚠️ USGS DISCHARGE ENDED 1997 — LIVE DATA VIA NWS
- dec lat/lon: 37.5961222, -90.4986472 (NAD83) · drainage 234 sq mi · datum NGVD29 (gage 684.99)
- USGS record: uv 00060 discharge ONLY 1993-05-08 → **1997-09-30** (then nothing); peaks 1983→1997; field visits to 1997-10-06.
- **The USGS gauge is discontinued.** BUT this is the whitewater reference gauge and
  the Eddy card shows a live stage ("NOAA Gauge Details"). Live data comes from the
  **NWS gauge ROZM7**, not USGS 07034000. → In the dossier, the flow provider for
  this reach must be `nws` (LID ROZM7), NOT `usgs`. Confirm ROZM7 reports stage(ft).

### 07036100 — St. Francis River near Saco, MO  ✅ ACTIVE
- dec lat/lon: 37.3845, -90.4738611 (NAD83) · drainage 664 sq mi · NAVD88 (gage 471.84)
- uv 00060 (1990-10-10 → 2026-07-06); uv 00065 (2007-10-01 → 2026-07-06). POLLABLE.

### 07037500 — St. Francis River near Patterson, MO  ✅ ACTIVE (lower-reach representative)
- dec lat/lon: 37.19452778, -90.5033056 (NAD83) · drainage 956 sq mi · NGVD29 (gage 370.45)
- uv 00060 (1995-02-28 → 2026-07-06); uv 00065 (2007-10-01 → 2026-07-06). Daily to 1921. POLLABLE.
- NWS LID PAZM7 (flood categories below).

### 07039500 — St. Francis River at Wappapello, MO  ✅ ACTIVE (below floated reaches)
- dec lat/lon: 36.9281111, -90.2652778 (NAD83) · drainage 1311 sq mi · NAVD88 (gage 314.56)
- uv 00060 (1994-10-01 → 2026-07-06); uv 00065 (2007-10-01 → 2026-07-06). At Wappapello Lake.

## NWS flood categories
- PAZM7 (= USGS 07037500, Patterson): action 10 ft · minor 16 ft · moderate 25 ft · major 32 ft.
  low threshold 1 ft; upstream SAZM7, downstream WPPM7; record 37.13 ft / 126,000 cfs (2017-04-30).
- ROZM7 (Roselle) flood categories NOT in this batch — capture separately if a whitewater danger cap is wanted.

## Ingest readiness / ACTION
- Whitewater reach representative = Roselle: change provider to `nws`/ROZM7 (USGS 07034000 dead since 1997).
- Lower reach representative = Patterson 07037500 (active, 00060+00065).
- Reconcile with the app's existing Roselle config (the Eddy card already renders the 3–6 ft ladder).

## 2026-07-14 — Patterson secondary gauge added (owner request "add both gauges")

Linked **07037500 = St. Francis River near Patterson, MO** (drainage 956; 37.1945,-90.5033)
as a SECONDARY gauge alongside the primary Roselle 07034000 (whitewater shut-ins reach, ft).
Thresholds left NULL: the downstream Patterson reach needs its own calibration, and the
moherp Patterson key is internally inconsistent (estimated "Good" 285 cfs vs an observed
"Good" trip at 2660 cfs), so it was NOT shipped. The whitewater reach still needs a `high`
anchor (American Whitewater) — pending research + sign-off.
