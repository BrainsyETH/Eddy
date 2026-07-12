# Verified Identifiers — James River (MO)

Primary-source transcription from the USGS Site Service, distilled from the
James research pass (james-findings-partial.md), 2026-07-12. [verify] gate for
ingest-dossier.ts — every gauges[].siteId in james.json must appear here.

## USGS gauges (in gauges[])

### 07052500 — James River at Galena, MO  ✅ PRIMARY (lower/Galena reach representative)
- USGS site id: 07052500
- name: James River at Galena, MO
- USGS monitoring-location URL: https://waterdata.usgs.gov/monitoring-location/USGS-07052500/
- dec lat/lon: 36.80539, -93.46158 (NAD83) · Stone Co · HUC 11010002 · drainage 987 sq mi
- params: uv 00060 (discharge, cfs) + uv 00065 (gage height, ft). POLLABLE.
- NWS LID GLNM7 (action 11 ft / flood 15 ft) — CROSS-CHECK ONLY, not the threshold anchor.
- serves section: james-galena. Co-located with the Galena Y-Bridge take-out.

### 07050700 — James River near Springfield, MO  ⚠️ UNCALIBRATED (upper/urban reach representative)
- USGS site id: 07050700
- name: James River near Springfield, MO
- USGS monitoring-location URL: https://waterdata.usgs.gov/monitoring-location/USGS-07050700/
- dec lat/lon: 37.14997, -93.20339 (NAD83)
- params: uv 00060 (discharge, cfs) + uv 00065 (gage height, ft). POLLABLE.
- drainage area: UNKNOWN (toVerify). NWS LID: UNKNOWN (toVerify).
- serves section: james-upper. Urban headwater; NO OBSERVED floatability calibration → thresholds[] empty by design.

## Candidate NOT adopted (recorded for the record, NOT in gauges[])

### 07052250 — James River near Boaz, MO  (middle/upper floatable candidate)
- USGS site id: 07052250
- USGS monitoring-location URL: https://waterdata.usgs.gov/monitoring-location/USGS-07052250/
- dec lat/lon: 37.00658, -93.36467 (NAD83) · drainage 462 sq mi · uv 00060 + 00065 · NWS LID JAMM7 (medium conf)
- Sits between the two modeled reaches. The two-reach model keys Galena to 07052500 and the upper
  reach to 07050700, so Boaz is intentionally omitted from gauges[]. Revisit if a middle reach is split out.

## Other identifiers
- GNIS feature id: 750497 · NHD reachcode: 11010002000005 · NHDPlus COMID: 7609749
- NHD Permanent_Identifier GUID: UNKNOWN (toVerify — National Map NHDPlus_HR, MO HUC 11010002).

## Ingest readiness / ACTION
- Lower/Galena reach representative = 07052500 (active, pollable), the river-level primaryGaugeSiteId.
- Upper/urban reach representative = 07050700 (active, pollable) but UNCALIBRATED — no thresholds; must not badge live.
- Both site ids present above satisfy the [verify] gate for james.json.
- Still open before signoff: 07050700 drainage + LID, NHD Permanent_Identifier GUID, access-point coordinates/river miles.
