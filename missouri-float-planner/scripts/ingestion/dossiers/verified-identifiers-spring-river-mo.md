# Verified identifiers — Spring River (Missouri) (spring-river-mo)

Onboarded 2026-07-14 per owner request as a NEW river, distinct from the Arkansas
`spring-river` (Mammoth Spring/Hardy). Same name, different basin/HUC/gauges.
Status: **STAGED — HELD INACTIVE** (no authoritative numeric float key exists).

## USGS gauges (verified live 2026-07-14 against the USGS site + IV services)

### 07185765 — Spring River at Carthage, MO  ★ PRIMARY
- coords 37.18863889, -94.3259167 · HUC 11070207 · drainage 425 sq mi.
- Live: 220 cfs @ 08:45 on 2026-07-14. Reports 00060 (cfs) + 00065 (ft).
- Sits mid-reach (≈ Civil War Road access, geom mile 31) — the representative gauge.

### 07186000 — Spring River near Waco, MO  (secondary)
- coords 37.2456111, -94.5664167 · HUC 11070207 · drainage 1164 sq mi.
- Live: 555 cfs / 2.56 ft @ 08:30 on 2026-07-14.
- Lower gauge near the Kansas line (≈ Maple Lane Bridge, geom mile 53).

Both linked via link-gauges.ts with threshold_unit='cfs' and **level_* left NULL**.

## Geometry
- NHD HR import, HUC **11070207** (gnis 'Spring River'): 348 flowlines → 101.4 mi
  mainstem, Carthage → Kansas line (mile 60.4 crossing at -94.617, 37.194) → into KS.
  The MO float reach is the upstream subset; access points define the floatable section.

## Access points (owner-provided per-access GPS map)
- 15 imported; **14 approved** (snap 0–42 m to geometry, monotonic mile 0→56.2).
- **Robert E. Talbot Access HELD** — its coord (37.128777, -93.920050) is 1139 m off the
  line because the NHD-named 'Spring River' reach in this HUC starts ~1.5 mi below it.
  Needs a corrected riverbank coordinate (or an upstream geometry extension) before approve.
- Low-head dams flagged in facilities: **Hwy 96** (portage river-right) and the old mill
  dam near **Galesburg** — scout/portage.
- La Russell Access confirmed as an MDC access (independent corroboration).

## Services — NONE verified (do NOT seed a fabricated outfitter)
- Deep research (2026-07-14) found **zero** dedicated outfitters/liveries/campgrounds/cabins.
  The Missouri Canoe & Floaters Association directory lists none on the Spring; JoplinKayak's
  Spring River page lists access only. It is a **self-shuttle** river using free public
  accesses (MDC La Russell; City of Carthage river parks — Kellogg Lake, Spring River Park).
- ⚠ A "**Carthage Outfitters**" with a "Rainbow Bridge" put-in and "**Ragin' Waters Landing**"
  take-out appears in web/AI search summaries but traces ONLY to an unsourced AI travel-guide
  page (app.advcollective.com) with no phone/address/website ("Ragin' Waters" is a Joplin
  waterpark; the page even lists an Oklahoma state park). Treated as **fabricated — excluded**.

## Calibration / activation gate
- **NO published numeric float key.** The owner-provided source only says "never float on
  high water; if the water is brown or carrying debris, stay out." No optimal/high/dangerous
  band exists on either gauge's datum.
- Per the standing rule (never ship estimated thresholds), the river ships **held inactive**.
- To activate: source an authoritative optimal (and ideally high/dangerous) key for
  07185765 (Carthage) — outfitter/agency/observed-trip calibration — then set it via
  update-thresholds.ts and run activate-rivers.ts. Also fix the Talbot coordinate.
