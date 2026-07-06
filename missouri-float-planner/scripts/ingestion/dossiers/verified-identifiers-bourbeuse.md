# Verified Identifiers — Bourbeuse River (MO)

Primary-source transcription from the USGS Site Service (siteOutput=expanded +
seriesCatalogOutput), owner-provided 2026-07-06. This file is the [verify] gate
for ingest-dossier.ts: every gauge siteId in bourbeuse.json must appear here.

## USGS gauges (transcribed verbatim)

### 07015720 — Bourbeuse River near High Gate, MO  ✅ ACTIVE (representative, upper reach)
- dec lat/lon: 38.14691667, -91.5808889 (NAD83)
- drainage area: 135 sq mi · datum NAVD88 · HUC 07140103 · Maries County
- Real-time: uv 00060 discharge (1996-03-25 → 2026-07-06); uv 00065 gage height (2007-10-01 → 2026-07-06)
- Daily discharge back to 1965-07-01. POLLABLE (00060/00065).

### 07016500 — Bourbeuse River at Union, MO  ✅ ACTIVE (representative, lower reach)
- dec lat/lon: 38.44413889, -90.9954722 (NAD83)
- drainage area: 808 sq mi · datum NAVD88 · HUC 07140103 · Franklin County
- Real-time: uv 00060 (1994-10-01 → 2026-07-06); uv 00065 (2007-10-01 → 2026-07-06)
- Daily discharge back to 1921-06-07; peaks to 1897. POLLABLE.
- NWS LID: UNNM7 (see flood categories below). NAVD88 gage datum 488.63 ft.

### 07016400 — Bourbeuse River above Union, MO  ❌ NOT real-time (do not poll)
- dec lat/lon: 38.431996, -91.0198653 (NAD83; coord datum orig NAD27) · drainage 808 sq mi
- Only water-quality (qw) + annual peaks; NO uv discharge/stage. Discontinued for flow. Secondary/reference only.

### 07015750 — Bourbeuse River near Owensville, MO  ❌ NOT real-time (do not poll)
- dec lat/lon: 38.22388889, -91.4477778 (NAD83) · drainage not published
- Only surface-water field visits (sv) 1943→2006; NO uv. Discontinued. Secondary/reference only.

- NOTE: the brief's guessed "07016000 near Noser Mill" did NOT appear in the USGS
  site service for this river — treat as NON-EXISTENT. Not ingested.

## NWS flood categories (NWPS gauge UNNM7 = USGS 07016500), verbatim
- action 13 ft · minor 15 ft · moderate 22 ft · major 26 ft (flow thresholds not published)
- upstream LID HTGM7; RFC NCRFC; WFO LSX; record crest 34.31 ft / 64,000 cfs (2015-12-29)
- These populate river_gauges.action_stage_ft / flood_stage_ft via fetch-nws-flood-stages.ts.

## Ingest readiness
Representative gauges (High Gate 07015720, Union 07016500) are both POLLABLE with
00060+00065. Coordinates + drainage areas above are ready to backfill into bourbeuse.json.
