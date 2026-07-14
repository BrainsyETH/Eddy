# Verified identifiers — Big River (big-river)

ingest-dossier.ts: every `gauges[].siteId` in big-river.json must appear below.

All gauge IDs below were verified against the live USGS site service on 2026-07-13
(station name, available parameters, coordinates, drainage area).

## USGS gauges (verified)

### 07018500 — Big River at Byrnesville, MO  ✅ PRIMARY
- params: uv 00060 (discharge, cfs) + uv 00065 (gage height, ft). POLLABLE.
- coords: 38.3917222, -90.6378056 · drainage 917 sq mi.

### 07018100 — Big River near Richwoods, MO  (secondary)
- params: uv 00060 (discharge, cfs) + uv 00065 (gage height, ft). POLLABLE.
- coords: 38.1596111, -90.7060556 · drainage 735 sq mi.
- note: Nearest gauge just downstream of Washington State Park and the popular upper float accesses (Blackwell RM 12, Washington SP RM 20, Mammoth RM 23.3, Merrill Horne RM 28.7); it is the gauge moherp pairs with those reaches (documented moherp trip 'Merrill Horne to Browns Ford' cited 572 cfs / 3.79 ft here). Also carried on moherp: https://rivers.moherp.org/gauge/?gauge=07018100

### 07017200 — Big River at Irondale, MO  (secondary)
- params: uv 00060 (discharge, cfs) + uv 00065 (gage height, ft). POLLABLE.
- coords: 37.83, -90.6908889 · drainage 175 sq mi.
- note: Uppermost gauge (St. Francois Mts., near Irondale/Leadwood). Small drainage with very low summer flow (USGS July p50 = 19 cfs, p90 = 83 cfs) — the headwater reach is usually TOO LOW to float outside spring/high water, confirming guide advice that the upper 'lead belt' section is not recommended. Included for completeness of the upper river; not a practical float-calibration gauge in summer. NOTE lat: DMS 37°49'48" = 37.8300 (use 37.83, not 38.0).

## Calibration key + sign-off notes

USGS day-of-year percentiles cross-checked with moherp live rating + OzarkAnglers seasonal normals (optimal band). high/dangerous OMITTED per owner — percentile inference only. Ships optimal-only. Popular Washington State Park reach is better represented by secondary gauge 07018100 (Richwoods).

## 2026-07-14 — DANGER ANCHOR ADDED from the section-by-section float guide (owner-provided)

Owner supplied an authoritative section-by-section Big River guide with explicit
navigability-by-cfs breakpoints. The app's primary gauge **07018500 = Big River at
Byrnesville, MO** (drainage 917) is the guide's **Section 4 (Morse Mill → Meramec)** gauge.
Applied Section 4's navigability to the ladder:
- optimal_min 200 → **300** ("300–600 cfs easily floatable"), high → **900** ("900–1200 high
  but usually still fishable"), dangerous → **1200** ("1200–1600 very high, possibly
  dangerous… the mill-dam areas will be especially dangerous"; >1600 too high).
- Kept too_low 90 / low 150 / optimal_max 600. validate_river_data(): 0 errors, 0 warnings.

⚠ REACH NOTE / open decision: Big River is onboarded as the whole 141-mi river (9 access
points, Leadwood → Rockford Beach) but has only ONE primary gauge (Byrnesville, the
downstream Section-4 end). The most popular float — Washington State Park (Section 3) — is
~55 mi upstream on the **Big River near Richwoods (07018100)** gauge, which runs much lower
(Section 3: easily floatable 100–400, high 400–800, dangerous 800–1200, >1200 too high).
A Byrnesville-driven badge over-reads for upstream (Washington State Park) floaters. Owner to
decide whether to switch the primary to Richwoods/Section 3 (the marquee reach) or keep
Byrnesville. Other section gauges: Big River near Irondale (Sections 1–2).
