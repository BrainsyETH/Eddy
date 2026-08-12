# Verified identifiers — White River (Bull Shoals Tailwater) (`white-river-bull-shoals`)

Phase 3 of `TAILWATER-INGESTION.md`: the independent pass. Every identifier
below was confirmed on its **primary source**, not on the page that first
mentioned it and not on the research dossier's prose. No identifier reaches a
registry, migration, or database row until it appears here.

Verified **2026-08-12** against:

- the USGS site service (`waterservices.usgs.gov/nwis/site`), with
  `seriesCatalogOutput=true` for the parameter/date catalogue and the IV service
  for a live value;
- the CWMS CDA API (`cwms-data.usace.army.mil`), per timeseries id;
- SWPA's own project table, as parsed in `src/lib/usace/swpa.ts`;
- USACE Little Rock's Bull Shoals MER fact sheet, "As of: 02/27/2026";
- AGFC's Bull Shoals Tailwater page.

---

## USGS — wire these two

### 07057370 — White River near Norfork, AR ✅
- **params (IV):** `00060` discharge from 2003-04-09, `00065` gage height from
  2007-10-01 — both current to 2026-08-12. Daily `00060` back to 1996-05-18.
- **live check:** 3,100 cfs / 5.33 ft at 2026-08-12 16:30 CDT, 15-minute cadence.
- **coords:** 36.2236111, -92.3000000 · alt 350.75 ft · **DA 8,040 sq mi**.
- **already in `gauge_stations`** as a bulk-catalogue row: `active=true`,
  `curated=false`, 0 readings, 0 `river_gauges` links. Wiring it is a curation
  flip plus a link, not a new station.
- **KNOWN BIAS — record it on the link, do not average it away.** Bull Shoals'
  own DA is 6,050 sq mi and Norfork Dam's is ~1,800; 6,050 + 1,800 + local ≈
  8,040. This gauge sits **below the North Fork confluence** and therefore reads
  Bull Shoals *plus* Norfork. It is the nearest live stage/discharge gauge to
  the fishery and it is at the Norfork Access creel boundary — both reasons to
  carry it, neither a reason to let it describe the upper tailwater.

### 07060500 — White River at Calico Rock, AR ✅
- **params (IV):** `00060` from 1987-01-22, `00065` from 2007-10-01, `00010`
  water temp, `00045` precipitation (new, from 2026-04-14) — all current to
  2026-08-12. Daily `00060` back to 1939-10-01.
- **coords:** 36.1166667, -92.1430556 · alt 316.38 ft · **DA 9,980 sq mi**.
- **already in `gauge_stations`**, same shape as above: `curated=false`, 0
  readings, 0 links.
- ~62 river miles below the dam. Lower reach only.

## USGS — DO NOT WIRE

### Water-quality only — no discharge, no stage

The research proposed these as the upper tailwater's gauges. The catalogue is
unambiguous: **`00010` (water temp) and `00300` (dissolved oxygen), nothing
else.** All three are live and current to 2026-08-12 — they are healthy
stations measuring something Eddy cannot use as a level.

| site | name | IV params | record |
|---|---|---|---|
| 07054501 | White River at Bull Shoals Dam near Flippin | 00010, 00300 | IV from 2007-10-01, daily from 1991-05-03 |
| 07054502 | White River below Bull Shoals Dam at Bull Shoals | 00010, 00300 | IV from 2007-10-01 |
| 07054527 | White River below Bull Shoals Dam near Fairview | 00010, 00300 | IV from 2007-10-01, daily from 1992-06-03 |

Assigning any of these as a representative flow gauge is now blocked in code —
`primary_gauge_no_flow_params` (error) in
`20260812220000_regime_aware_validation_for_dam_tailwaters`. Their DO is
`requires_schema_ui`: Eddy has no dissolved-oxygen model, and `gauge_readings`
has exactly two value columns (`gauge_height_ft`, `discharge_cfs`).

### Discontinued — metadata only, never in the polling path

| site | name | last data |
|---|---|---|
| 07055000 | White River near Flippin | daily `00060` 1928-10-01 → **1981-04-08** |
| 07055500 | White R. at Cotter, Ark. | **no IV or daily series in the catalogue at all** |

Cotter still resolves as a site record (36.2667355, -92.5501628, alt 480 ft
NGVD29) — which is exactly how a discontinued gauge looks alive to research
that stops at the site page.

## USGS — already verified elsewhere in Eddy, do not duplicate

- **07055607** — Crooked Creek at Kelly Crossing at Yellville, AR. Primary gauge
  of the live `crooked-creek` river; see
  `verified-identifiers-crooked-creek.md`. Confirmed still reporting.
- **07056000** — Buffalo River near St. Joe, AR. Primary gauge of `buffalo`.

## USACE / CWMS

- **office:** `SWL` · **cdaLocation:** `Bull_Shoals_Dam` · already registered as
  `swl-bull-shoals-dam` in `src/lib/flow-providers/usace-registry.ts`.
- **live smoke test 2026-08-12, 8/8 metrics resolving** (via
  `scripts/check-usace-resolver.ts`): release 20,400 cfs · releaseForecast 4,500
  cfs (+102h) · poolElevation 659.13 ft · pctFloodPool 0.00% · inflow 2,518.63
  cfs · generationFlow 20,400 cfs · tailwaterElevation 457.96 ft ·
  tailwaterTempF 54.82°F.
- **`generationFlow` pin checked explicitly.** The resolver flags
  `DIFFERS-FROM-PIN` here — it would choose `Flow-Plant.…Comp-rev` while the
  registry pins `Flow-Plant.…CCP-Comp`. Worth checking rather than waving off,
  because `resolve.ts` documents a Bull Shoals **release** series in CCP-Comp
  that died in Feb 2020. Queried both directly over 72 hours: 72/72 points each,
  identical values, both current to 2026-08-12 22:00Z. **The pin is good.**
- 54.82°F tailwater in August corroborates the declared deep-draw cold release
  (`tailwaterFishery: 'trout'`).

## SWPA

- **project code `BSD`**, 8 units, `capacityMw` 391, `fullPowerCfs` 26,400.
- 391 and 26,400 are **one pair** and must stay together —
  `megawattsToCfs()` divides by the first and multiplies by the second.
- 26,400 cfs is SWPA operational metadata, **not** the local-expert figure the
  research filed it as.

## Capacity — three numbers, all published, none of them 380

Per the MER fact sheet (Little Rock District, as of 02/27/2026): *"Bull Shoals
Dam Powerplant is an 8-unit hydroelectric plant with a combined installed power
capacity of 340 MW. This project will increase the power capacity to 362 MW."*

| value | meaning | where it lives |
|---|---|---|
| 340 MW | installed today | `nameplate.megawatts` |
| 362 MW | after the MER project | `nameplate.plannedMegawatts` |
| 391 MW | SWPA scheduling capability | `SWPA_PROJECTS.BSD.capacityMw` |

The registry previously said 380, which matches none of them. Corrected.

Same sheet, useful for the stable-facts pass: commercial generation began 1952,
**final installation of all eight units completed 1963** — so "8 units" is not
true of the 1951/52 dates the research attached to the project.

## Fishery boundary

AGFC's Bull Shoals Tailwater page, retrieved 2026-08-12, states the Commission
"manages trout fisheries in the White River from Bull Shoals Dam to the Arkansas
Highway 58 Bridge at Guion," and that "Emergency Trout Regulations have been put
in place." Both confirmed directly, not via the eRegulations mirror.

---

## Corrections to the research dossier

Feed these back before the dossier is used again, or the next pass re-proposes
both.

1. **07055600 is not the Yellville gauge.** The dossier lists it as "Crooked
   Creek at Yellville" for tributary influence near Cotter. USGS: **07055600 =
   CROOKED CREEK AT PYATT, ARK.** Eddy's verified Yellville gauge is 07055607,
   and `verified-identifiers-crooked-creek.md` already records catching a
   near-identical miss (07056000 turned out to be the Buffalo).
2. **07057370 is missing entirely.** The dossier states Calico Rock (mile ~62)
   is the only live discharge/stage gauge in the study reach. The nearest one is
   at Norfork, ~45 miles down, live, and sitting on the creel-zone boundary the
   same document defines.
3. **Conflict C4 is resolved backwards.** 391 is not a local source confusing MW
   with MWh; it is SWPA's published scheduling capability. Adopting the
   dossier's fix (use 380, treat 391 as approximate) would have put an operator
   nameplate into one half of a two-half conversion.
4. **Source S8's URL is elided** (`swl.usace.army.mil/.../Dam-and-Lake-Information/`)
   and the obvious reconstruction 404s — against the dossier's own "use exact
   URLs" rule. The MER fact sheet above is the citable primary source for
   capacity.

The dossier's central safety finding **stands, independently confirmed**: a
bounding-box sweep of active USGS IV sites carrying `00060`/`00065` between the
dam and below Cotter returns only Buffalo near Harriet, White near Norfork, Big
Creek near Elizabeth, and Calico Rock. There is no live stage or discharge gauge
between Bull Shoals Dam and Rim Shoals.

## Not verified — still open before ingest

- **River miles** for every access point. AGFC's tailwater map is the canonical
  source; the 2010 guidebook mirror the research leaned on is dated.
- **Access coordinates and public/private status.** Use the AGFC ArcGIS *Public
  Use Facilities* layer, per README Phase 8. Nothing ships `is_public` on a
  guide page, a tourism site, or an old map.
- **NHD reach + HUC8** for `rivers.geom` — not yet looked up. Activation error
  until it exists.
- **Reach boundaries R2–R5.** Candidates only; R1 is the sole reach the research
  treats as verified.
