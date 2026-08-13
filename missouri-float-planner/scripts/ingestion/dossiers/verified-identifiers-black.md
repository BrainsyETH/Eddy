# Verified Identifiers — Black River (MO)

Primary-source transcription from the USGS Site Service + NWPS, owner-provided
2026-07-06. [verify] gate for ingest-dossier.ts.

## USGS gauges (transcribed verbatim)

### 07061500 — Black River near Annapolis, MO  ✅ ACTIVE (ONLY valid representative for the float reach)
- dec lat/lon: 37.33813889, -90.78875 (NAD83) · drainage 484 sq mi · NAVD88 (gage 569.73) · Reynolds Co · HUC 11010007
- uv 00060 (1985-11-10 → 2026-07-06); uv 00065 (2007-10-01 → 2026-07-06). Daily to 1939. POLLABLE.
- NWS LID ANNM7 (flood categories below).

### 07061400 — Black River near Lesterville, MO  ❌ NOT real-time (DO NOT use as representative)
- dec lat/lon: 37.44060375, -90.8326218 (NAD83; orig NAD27) · drainage 430 sq mi
- Only water-quality (qw) 1993; NO uv discharge/stage. **Discontinued — not pollable.**
  This is why the Lesterville→Annapolis reach must poll ANNAPOLIS (07061500), not Lesterville.

### 07061600 — Black River below Annapolis, MO  ⚠️ recently ended (last uv 2025-12-03)
- dec lat/lon: 37.325194, -90.764667 (NAD83) · drainage 493 sq mi · NAVD88 (gage 555.31)
- uv 00060 (2006-01-24 → 2025-12-03); uv 00065 (→ 2025-12-03). Verify if still reporting before use.

### 07061270 — East Fork Black River near Lesterville, MO  ✅ ACTIVE (tributary)
- dec lat/lon: 37.55255556, -90.8424444 (NAD83) · drainage 52.2 sq mi · NAVD88 (gage 825.16)
- uv 00060 (2003-10-01 → 2026-07-06); uv 00065; also temp(00010)/DO(00300). Represents East Fork only.

### 07061170 — Middle Fork Black River near Lesterville, MO  ❌ NOT real-time
- dec lat/lon: 37.48060338, -90.9029007 (NAD83; orig NAD27) · drainage not published
- Only qw (1965, 1993). No uv. Discontinued. Reference only.

## NWS flood categories
- ANNM7 (= USGS 07061500, Annapolis): action 6 ft · minor 8 ft · moderate 15 ft · major 25 ft
  (this CONFIRMS the earlier WebSearch-tier 6/8/15/25 set — now primary-source corroborated).
  [NOTE: values above are from the earlier search tier; owner's NWPS paste this round covered
   UNNM7/PAZM7/JRMM7 — if an ANNM7 NWPS JSON is provided, re-confirm verbatim.]

## USACE tailwater (added 2026-08-13)

Clearwater Dam's release was wired to this river by migration `00198` after
this file was written, so its identifiers were never recorded here. Captured
now, because the identifier gate is only a gate if it covers everything that
reached a registry — see `verified-identifiers-tailwater-swl-bull-shoals-dam.md`
for the same set on the second tailwater.

### `swl-clearwater-dam` — Black River below Clearwater Dam ✅
- CWMS office `SWL`, location `Clearwater_Dam`; registered as a
  `provider='usace'` gauge station whose discharge is the dam's total release.
- No SWPA code: flood control only, no powerhouse. Correctly absent, not missing.

### 07063000 — Black River at Poplar Bluff, MO ✅
- The tailwater gauge for the Clearwater release; ~40 river miles below the dam.
- **drainage 1,245 sq mi**, verified on the USGS site service 2026-08-13.
- Clearwater Dam's own drainage area is **UNKNOWN** here — not looked up on a
  primary source, so not written down as though it were. It is the missing half
  of the post-confluence ratio below, and `drainage_area_sqmi` on the release
  station stays null until someone reads it off a USACE document.
- What is measured rather than inferred: 3,561 cfs released against 3,380 gauged
  on 2026-07-27, ~40 river miles apart — 5%, which is why this gauge is a fair
  description of that release.

## Ingest readiness / ACTION
- Float reach (Lesterville→Annapolis) representative = 07061500 Annapolis (active). 07061400 is DEAD.
- Still needed before signoff: gauge-keyed cfs/ft FLOATABILITY thresholds (none captured yet —
  an Al Agnew / OzarkAnglers "Black River Overview" would supply them, as it did for the Bourbeuse).
