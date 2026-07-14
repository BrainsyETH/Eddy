# Verified identifiers — Spring River (AR), slug `spring-river`

Independent primary-source verification pass for the `[verify]` gate in
`ingest-dossier.ts`. Every `gauges[].siteId` in `spring-river.json` must appear
in this file or ingest refuses. Identifiers below were confirmed against the
provider APIs / authorities named in each row; coordinates are the provider
metadata values.

Verified: 2026-07-12 · River: Spring River, north-central Arkansas
(Fulton / Sharp / Lawrence counties) · State: AR · River type: spring_fed_float

## Gauges — INGESTED (in `gauges[]`)

| Site ID | Name | Lat | Lon | Params | Drainage (sq mi) | Serves | Status |
|---|---|---|---|---|---|---|---|
| **07069305** | Spring River at Spring Street Bridge at Hardy, AR | 36.3136 | -91.4828 | 00060 (cfs), 00065 (ft) | 845 | spring-reach1 | ACTIVE — both discharge (00060) and stage (00065) reporting live (443 cfs @ 2.96 ft, 2026-07-12). PRIMARY gauge. NWS/NWPS LID **HDYA4** (action 8 ft / minor flood 10 ft — cross-check only, NOT a floater-danger anchor). |
| **07069500** | Spring River at Imboden, AR | 36.20556 | -91.17167 | 00060 (cfs), 00065 (ft) | 1180 | spring-reach2 | ACTIVE — long record since 1936, mean ~1428 cfs. Represents the lower (Hardy → Imboden → Black River) reach. UNCALIBRATED (no thresholds yet). |

`primaryGaugeSiteId` = **07069305** (Hardy) — the only reach-1 gauge with live
discharge + stage and an NWS forecast point; carries the reach-1 thresholds
(optimal 206–694 cfs, AGFC).

## Gauge — EXCLUDED (deliberately NOT in `gauges[]`)

| Site ID | Name | Reason excluded |
|---|---|---|
| 07069220 | Spring River near Mammoth Spring, AR | Discharge (00060) **DISCONTINUED 2016**; gage height (00065, ft) only. American Whitewater references it, but with no live cfs it cannot key a floatability badge. Do NOT add to `gauges[]`. |

## Geospatial identifiers

- **HUC8: 11010010** (Upper Black watershed, White/Black drainage). Corrected
  from the brief's 11010012. NOTE the anomaly: the USGS Hardy site page reports
  **HUC 11010008** while NHD / NHDPlus_HR gives **11010010** for the flowline —
  flagged in `research.toVerify`; reconcile before ingest.
- **GNIS feature id: 00055122** (Spring River, AR).
- **NHD Permanent Identifier: NOT RESOLVED** — the mainstem is multi-segment and
  no single flowline PID was captured. `nhdFeatureId` left `UNKNOWN` in the
  dossier; resolve the NHDPlus_HR flowline PID(s) in AR HUC 11010010 during the
  geometry pass.
- Source: **Mammoth Spring** (~36.495, -91.535; Fulton Co., on the AR/MO line) →
  mouth at the **Black River near Black Rock** (Lawrence Co.).

## Jurisdiction / access law (verified once for the state)

- **AR recreational (public-use) navigability doctrine** — *State v. McIlroy*,
  268 Ark. 227 (1980) (Mulberry River); see **Ark. Code Ann. § 22-6-201**.
  Public may float/wade streams susceptible to recreational use by small craft
  for a substantial portion of the year; everything below the ordinary
  high-water mark is public, but riparian owners may bar crossing their land, so
  lawful entry is via public accesses. accessLaw confidence upgraded low → high;
  reusable across future AR rivers.
- Managing authorities: **Arkansas Game & Fish Commission** (public accesses:
  Dam 3 / Riverside, Bayou, Cold Springs) and **Arkansas State Parks**
  (Mammoth Spring State Park / Dam #1).

## Thresholds provenance (reach 1 only)

- optimal 206–694 cfs @ 07069305 from the **AGFC Spring River trout page**
  ("typical discharge 206–694 cfs",
  https://www.agfc.com/fishing/where-to-fish/trout-waters/spring-river/),
  confidence medium. Encoded in **cfs** — AGFC's "typical 4.0–5.3 ft" stage does
  NOT match the Hardy gauge datum (443 cfs read at 2.96 ft), so the ft figures
  are NOT used.
- **high / dangerous anchors: NONE.** No strongly-sourced high number; no
  floater do-not-float (dangerous) source exists. Source path: call outfitters
  **RiverStop 870-955-5088** and **River Wilderness Sports 870-955-5003**.
- **too_low: none** — spring-fed (~340 cfs constant, 58°F baseflow); effectively
  never too low to float on the upper reach.

## NOT verified here (still `[manual]` / open)

- **Access-point coordinates** — only the Hardy take-out (36.3136, -91.4828,
  from the USGS gauge) is sourced. Mammoth Spring SP/Dam 1, Cold Springs (~mi1),
  Lassiter (walk-in), Dam 3/Riverside (~mi3.2), Bayou (~mi6), Many Islands
  (private), Ravenden, and Imboden need a human to place coordinates.
- **River length** — 57 mi (Wikipedia) vs ~75 mi (Encyclopedia of Arkansas).

## 2026-07-14 — Imboden secondary gauge added; primary confirmed = Hardy

Clarified: the app's primary **07069305** is *Spring River at Spring St Bridge at HARDY, AR*
(drainage 845; the float-hub gauge, mid-reach at access mile 18) — NOT Imboden. Added
**07069500 = Spring River at Imboden, AR** (drainage 1180; 36.2056,-91.1717) as a SECONDARY
context/long-record gauge (82-yr record) per owner request; thresholds NULL. The dead
07069220 (near Mammoth Spring) remains unused. AR Spring still needs a Hardy-datum
too_low/low/high/dangerous key (only optimal 206–694 is set) — pending research + sign-off.
