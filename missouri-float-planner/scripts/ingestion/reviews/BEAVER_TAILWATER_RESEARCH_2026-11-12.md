# Beaver tailwater research — November 12, 2026

Read-only research for onboarding the **White River below Beaver Dam, AR (the
"Beaver Tailwater")** as a dam-tailwater river, following the Norfork pattern
(`access-points/norfork-tailwater.json`,
`dossiers/verified-identifiers-tailwater-swl-norfork-dam.md`). Nothing was
written to any database. This is evidence, **not activation approval**, and no
field or device verification is claimed.

Eddy dam id: `swl-beaver-dam` (CWMS `Beaver_Dam`, office SWL), already in
`src/lib/flow-providers/usace-registry.ts` with `tailwaterFishery: 'trout'` and
no `tailwater` block yet.

## 1. Extent and downstream endpoint

**Decision proposed: dam → Houseman Access (AGFC Houseman Boat Ramp).**

| Statement | Source |
| --- | --- |
| Current regulation N1.03 text: "White River from 100 yards below Beaver Dam to the boat ramp at Houseman Access"; "No fishing, boating, or wading within 100 yards of Beaver Dam" (Ark. Register Vol. 49 No. 06, effective 1/1/2025) | [Cornell LII, 002.01.24 Ark. Code R. 011](https://www.law.cornell.edu/regulations/arkansas/002-01-24-Ark-Code-R-011) |
| AGFC e-regs heading: "Beaver Tailwater (White River from 100 yards below Beaver Dam to boundary signs at Houseman Access)" — search-result title only; the page returned **403** to direct fetch | [apps.agfc.com/regulations/N1.03](https://apps.agfc.com/regulations/N1.03) |
| 2016–17 creel survey: "the 7.5 mile stretch of the White River from 100 yards below Beaver Dam to the AGFC Houseman Access"; Figure 1 map labels **"End of Trout Waters"** just downstream of the Houseman Access boat-ramp symbol | [AGFC creel survey PDF](https://www.agfc.com/wp-content/uploads/2023/05/2016_2017_beavercreelsurvey.pdf) (p. 9) |
| Management plan 2012–17: tailwater "flows approximately 7.5 miles … before entering Table Rock Lake"; regulates "from Beaver Dam to Houseman Access" | [AGFC management plan PDF](https://www.agfc.com/wp-content/uploads/2023/05/beavertwmanagementplan2012-2017.pdf) |
| AGFC Beaver Tailwater page: "flows about 7.5 miles through northwest Arkansas before entering Table Rock Lake" | [agfc.com Beaver Tailwater](https://www.agfc.com/fishing/where-to-fish/trout-waters/beaver-tailwater/) |

**Endpoint coordinates:** Houseman Boat Ramp **36.462934, -93.814377** — AGFC
public-use-facilities layer feature **792** (live query 2026-11-12 matches the
2026-10-29 snapshot). Second source: howsyourriver.com "Houseman"
36.462756, -93.814486 (~20 m away), address 795 Carroll County Rd 214
([howsyourriver](https://howsyourriver.com/access_sites/houseman)). The exact
"boundary signs" location is **UNKNOWN**; the creel map draws it a few hundred
metres downstream of the ramp.

Harvest rules (not geometry, for copy only): from 2026-02-01 AGFC limits Beaver
tailwater to two trout daily, all trout ≥14 in released
([AGFC ?p=19587 via search](https://www.agfc.com/?p=19587),
[MidCurrent 2026-01-25](https://midcurrent.com/2026/01/25/77297/)). Not verified
against the 2026–27 guidebook — **open**.

## 2. Access candidates (dam → Houseman)

Miles are rough estimates: nearest-vertex distance along OSM way
[136170034](https://www.openstreetmap.org/way/136170034) ("White River") from
the CWMS dam point. Useful for ordering and sanity checks only, not stored mileage.

AGFC layer = `https://gisec2.agfc.com/arcgis/rest/services/GIS/AGFC_DATA/MapServer/1`
(queried live 2026-11-12; same values as `agency-gis/2026-10-29/agfc-features.json`).
USACE ledger = `lakes/usace-recreation-ledger.json` (USACE recreation area ids).

| ~Mile | Name | Kind | Owner | Facility ids | Lat, lon (source) | Facilities / notes | Corroboration | Confidence |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.3 | **Beaver Lake Dam Site Boat Ramp** (AGFC page: "Dam ramp"; creel map: "Dam Site Access") | Trailer ramp | USACE | AGFC 1608 ("Beaver Tailwaters", Concrete); USACE area 233024 "Beaver Lake Dam Site – Riverview" (1 ramp, 1 lane, boat status open; entrance 36.43073, -93.84509 is the park road entrance, not the ramp) | 36.422754, -93.842389 (AGFC 1608) | Inside Dam Site River Park (Riverview), USACE fee campground Recreation.gov [233099](https://www.recreation.gov/camping/campgrounds/233099) adjacent: drinking water, flush toilets. Likely the "first Corps boat ramp on the left descending bank" in the snagging rule (inference) | AGFC page text (search snippet of [fishing-map 531](https://intranet.agfc.com/en/zone-map/fishing-map/531)) lists "Dam ramp"; creel-survey Fig. 1. **No OSM slipway** on the tailwater | High (identity), medium (current condition) |
| 0.3–0.9 | Dam Site River Park Riverview Bank Fishing / Dam Site Walk-in Access | Walk-in / bank | USACE | AGFC 1990 (bank fishing), 2701 (paved parking 36.42625, -93.838591), 1767 (seasonal restroom), 160 (campground) | 36.426164, -93.837829 (AGFC 1990) | AGFC: "Three public walk-in accesses are available at Dam Site Park" | Creel Fig. 1 "Dam Site Walk-in Access" | Medium — fishing access, not a float endpoint |
| 1.9 | **Parker Bend Access** | Walk-in + ADA bank fishing | AGFC (bank area) / USACE (parking) | AGFC 894 (Handicap Access Bank Fishing), 2448 (gravel parking 36.431084, -93.821748); USACE area 29980 "Parker Bottoms" (no ramp listed) | 36.431122, -93.822560 (AGFC 894) | AGFC: "one walk-in access and handicap access is available at Parker Bend". Lure-only zone ends ~100 yd upstream of it | Creel Fig. 1 walk-in symbol; mgmt plan Strategies 1.5.2–1.5.3 | High identity; **exclude as float endpoint** (no boat access found) |
| 2.5–3.0 | Beaver Tailwaters Parking Areas #1–#3 | Walk-in parking | USACE | AGFC 2942 (#1, 36.435046, -93.824061), 2162 (#2, 36.438524, -93.8301), 1676 (#3, 36.439434, -93.831895) | AGFC layer | Gravel pull-offs; likely the creel map's "Bertrand Walk-in Access" area (inference) | Creel Fig. 1 | Medium; not float endpoints |
| 3.3 | **Bertrand Boat Ramp** ("Bertrand Access") | Trailer ramp | AGFC | AGFC 470 (Concrete, location "Rogers") | 36.440524, -93.833798 (AGFC 470) | AGFC lists it as a public boat access "at Dam Site Park"; mgmt plan 3.2.2 explored a portable restroom here — **restroom UNKNOWN** | Creel Fig. 1 "Bertrand Access" boat symbol. No OSM slipway; second coordinate source **not found** | High identity, medium pin |
| 4.5 | (US 62 bridge — hazard, not access) | — | ARDOT | OSM way 114223771 | 36.449064, -93.823641 | No public access found here | — | — |
| 6.8 | **Houseman Boat Ramp** ("Houseman Access") — trout-water endpoint | Trailer ramp | AGFC | AGFC 792 (Concrete) | 36.462934, -93.814377 (AGFC 792) | AGFC: public boat access "east of the town of Busch". Bank-fishing improvements noted in mgmt plan 3.2.3; **restroom UNKNOWN**, parking per paddling directories | howsyourriver 36.462756, -93.814486; creel Fig. 1 | High |

Total 6.8 mi along OSM vs AGFC's 7–7.5 mi published figure (AGFC page snippet
says 7 mi, plan and survey say 7.5 mi). A ~10% short reading from vertex
snapping is expected; recompute against NHD geometry.

### Not on the tailwater (Table Rock Lake, below the trout endpoint)

| Name | Coordinates | Evidence |
| --- | --- | --- |
| Table Rock Lake Beaver Park (town of Beaver, AR 187) | 36.47388, -93.76678 (USACE ledger area 286672, local government, 1 ramp) | ~13 mi by OSM; below Houseman. Near former USGS 07050000 "White River at Beaver" |
| Holiday Island Boat Ramp | 36.492458, -93.760303 (AGFC 1350, waterbody "Table Rock Lake", owner Other) | ~16 mi; already an approved Table Rock launch (`lakes/2026-11-12/README.md`) |
| Lake Leatherwood ramp (AGFC 8726) | 36.435168, -93.759102 | Separate city lake |
| Dam Site (lake) ramp AGFC 9097 / USACE 401230002, "James's Slip" OSM 12482483723, OSM slipway 8667105046 | ~36.42, -93.856 | Upstream of the dam, on Beaver Lake |

Note: the Table Rock lake polygon used by the 2026-11-09 launch queue reaches
Dam Site Boat Ramp (0 m), Bertrand (12 m) and Houseman (0 m) — Table Rock's
mapped pool extends up the tailwater. That is why these three were queued as
Table Rock launches.

## 3. Gauges

Probed 2026-11-12 via `waterservices.usgs.gov` (site + series catalog + IV).
`api.waterdata.usgs.gov` returned **OVER_RATE_LIMIT** (no API key) — not used.

| Site | Name | Lat, lon | Current params | Status |
| --- | --- | --- | --- | --- |
| **07049691** | White River at Beaver Dam near Eureka Springs | 36.4208333, -93.8472222 | 00010 water temp, 00300 dissolved oxygen | **Reporting**: 9.4 °C, DO 5.0 mg/L at 2026-11-12 09:00 CST. **No discharge/stage** (00060/00065 historical only). Analog of Norfork's 07060000 → `waterQualitySiteId` |
| **07049698** | White River near Busch, AR | 36.44955556, -93.8231667 (at US 62 bridge; OSM node 12091120212) | 00065 gage height only (since 2020-02) | **Reporting**: 1.52 ft at 09:00 CST. Datum 908.81 ft NAVD88 → WSE ≈ 910.3 ft. No discharge |
| 07049693 | White River @ campground E near Busch | 36.4317381, -93.8226958 | WQ discrete only | Inactive since 1998 |
| 07050000 | White River at Beaver, AR | 36.47229276, -93.7654721 | — | Discontinued (flow ended 1958); below endpoint |
| 07049690 | Beaver Lake near Eureka Springs | 36.42090508, -93.8474187 | — | Lake |

Sources: [NWIS site 07049691](https://waterdata.usgs.gov/monitoring-location/07049691/),
[07049698](https://waterdata.usgs.gov/monitoring-location/07049698/),
[IV query](https://waterservices.usgs.gov/nwis/iv/?format=json&sites=07049691,07049698&period=P2D).

**CWMS `Beaver_Dam` (SWL)** —
[location](https://cwms-data.usace.army.mil/cwms-data/locations/Beaver_Dam?office=SWL):
36.421283333333, -93.847616666667 (WGS84), Carroll County, nearest city Busch,
active, matches the registry. Catalog includes
`Beaver_Dam-Tailwater.Flow.Inst.1Hour.0.CCP-Comp`,
`Beaver_Dam-Tailwater.Temp-Water.Inst.1Hour.0.Decodes-rev` (48.9 °F at
2026-11-12 15:00 UTC — the standard `swlSeries` id resolves, unlike Norfork),
`Beaver_Dam-Tailwater.Conc-DO…Decodes-rev`, `Tailwater.Elev-Downstream`
(916.35 ft), Turbine1/2 and Tainter_Gate_01–07
([catalog](https://cwms-data.usace.army.mil/cwms-data/catalog/TIMESERIES?office=SWL&like=Beaver_Dam.*)).
Flow source should be the dam (as Norfork: `gaugeSiteId: 'swl-beaver-dam'`).

## 4. Fixed hazards

| Hazard | Location | Source |
| --- | --- | --- |
| Beaver Dam; **no fishing, boating or wading within 100 yards** | Dam 36.4213, -93.8476 (CWMS); OSM dam way 129105284 | [N1.03 text](https://www.law.cornell.edu/regulations/arkansas/002-01-24-Ark-Code-R-011); creel Fig. 1 hatches a "Restricted Fishing Area" at the dam |
| AR 187 crossing at the dam outlet | OSM way 1168259132, 36.4207–36.4220, -93.8476 | Inside the 100-yd closure (OSM) |
| **US 62 bridge** — only road bridge over the river on the reach | OSM way 114223771, 36.4481–36.4500, -93.8243 to -93.8229; USGS 07049698 at the bridge | OSM; USGS. AR 187 (36.4410, -93.8421) and County Road 135 (36.4417, -93.8390) bridges cross **Spider Creek tributaries**, not the river (OSM intersection check) |
| Low-water crossings | **None found** in OSM on the main channel | OSM API map 2026-11-12 |
| **Warning horn** below the dam: "When the horn sounds it means water is flowing and the river will begin to rise, move to higher ground immediately"; sounds when units run or spillway gates are open; restored Aug 2022 after a Feb 2022 outage | Location UNKNOWN | [Dredgewire 2022-08-15](https://dredgewire.com/warning-horn-below-beaver-dam-fully-restored), [5NEWS (undated outage)](https://www.5newsonline.com/article/news/local/warning-horn-below-arkansas-beaver-dam-not-working/527-e0a5aadd-3e93-46c0-8649-0fd1c4386321) |
| Generation: 2 turbines ~3,950 cfs each, ~9,085 cfs max through both; ~63 cfs base leakage + house unit | — | Management plan p. 3 |
| Artificial-lure/no-bait special area ~0.5 mi below dam to ~100 yd above Parker Bend (rules, not a hazard) | — | N1.03 A5 |
| USACE 36 CFR 327 restricted-area buoys/limits below the dam | **UNKNOWN** | Not found |

## 5. Reach length

Published: **7.5 mi** (AGFC management plan, creel survey, AGFC page); AGFC map
page snippet says **7 mi**. OSM rough: **6.8 mi** dam → Houseman.

## 6. Alert terms and weather point

- County: **Carroll County, AR** (CWMS location; creel survey; NWS zone
  `ARC015`). Beaver Lake upstream spans Benton/Washington/Carroll.
- Towns: Busch, Eureka Springs, Beaver, Holiday Island; terms "Beaver Dam",
  "Beaver tailwater", "Dam Site River", "Houseman Access", "White River".
- Weather point: Bertrand Boat Ramp 36.4405, -93.8338 →
  [api.weather.gov/points](https://api.weather.gov/points/36.4405,-93.8338): office
  **TSA** (Tulsa) grid 119,117, forecast zone **ARZ002**, county ARC015,
  ~5.1 km WNW of Eureka Springs.

## Open questions

1. **Backwater from Table Rock.** On 2026-11-12 Table Rock headwater was
   910.03 ft (`Table_Rock_Dam-Headwater.Elev…Decodes-rev`) and the Busch gauge
   WSE ≈ 910.3 ft (NAVD88; CWMS is NGVD29 — datums differ by a fraction of a
   foot). The lower ~2.3 mi (US 62 → Houseman) may be lake-backed at normal
   pool; Table Rock's mapped polygon already reaches the dam ramp. Decide
   whether float-time math treats the lower reach as river or slack water.
2. **Endpoint wording**: "boat ramp at Houseman Access" (LII, eff. 2025) vs
   "boundary signs at Houseman Access" (AGFC e-regs title, 403). Sign location
   unknown; ramp is the practical takeout either way.
3. **Lake vs river classification**: the three owner-pending lake launches are
   tailwater accesses (Dam Site ramp mile 0.3, Bertrand 3.3, Houseman 6.8).
   Decide whether they stay as Table Rock launches, move to the tailwater
   river, or both (linked places).
4. Facilities at Bertrand and Houseman (restroom, parking size) — not
   confirmed from an agency page. No photos.
5. Whether a second, separate boat ramp exists inside Dam Site River Park
   (Recreation.gov 233099 facility text not retrieved; JS page). USACE area
   233024 lists one ramp.
6. Horn location/lead time and any USACE restricted-area limit beyond AGFC's
   100 yards.
7. Current 2026–27 Beaver harvest rule (two trout, release ≥14 in, from
   2026-02-01) — confirm in the guidebook before any copy uses it.
8. Mileage from NHD geometry (the OSM figures here are vertex snaps).

## Sources

- AGFC regulation N1.03: https://www.law.cornell.edu/regulations/arkansas/002-01-24-Ark-Code-R-011 ; https://apps.agfc.com/regulations/N1.03 (403)
- AGFC Beaver Tailwater page: https://www.agfc.com/fishing/where-to-fish/trout-waters/beaver-tailwater/
- AGFC fishing map 531 (search snippet only; body not retrievable): https://intranet.agfc.com/en/zone-map/fishing-map/531
- AGFC management plan 2012–17: https://www.agfc.com/wp-content/uploads/2023/05/beavertwmanagementplan2012-2017.pdf
- AGFC 2016–17 creel survey (Fig. 1 map): https://www.agfc.com/wp-content/uploads/2023/05/2016_2017_beavercreelsurvey.pdf
- AGFC trout regs 2026: https://www.agfc.com/?p=19587 ; https://midcurrent.com/2026/01/25/77297/ ; emergency order https://www.agfc.com/TroutRegsNews
- AGFC public-use facilities layer: https://gisec2.agfc.com/arcgis/rest/services/GIS/AGFC_DATA/MapServer/1 (features 160, 470, 792, 894, 1350, 1608, 1676, 1767, 1990, 2162, 2448, 2701, 2942)
- USACE recreation ledger (repo): `scripts/ingestion/lakes/usace-recreation-ledger.json` (areas 233024, 29980, 286672, 401230002)
- Recreation.gov Dam Site River campground: https://www.recreation.gov/camping/campgrounds/233099
- howsyourriver Houseman: https://howsyourriver.com/access_sites/houseman
- USGS NWIS: https://waterservices.usgs.gov/nwis/site/?format=rdb&bBox=-93.90,36.40,-93.70,36.52&siteStatus=all
- CWMS location/catalog: https://cwms-data.usace.army.mil/cwms-data/locations/Beaver_Dam?office=SWL
- OSM API map bbox -93.86,36.415,-93.80,36.47 (ways 136170034, 114223771, 1168259132, 456589249, 1279143704, 129105284; nodes 12091120212, 12104606425). Overpass hosts (overpass-api.de, overpass.kumi.systems) were **unreachable through the proxy**.
- Warning horn: https://dredgewire.com/warning-horn-below-beaver-dam-fully-restored
- NWS points: https://api.weather.gov/points/36.4405,-93.8338

## Corrections after review (2026-11-12)

- **Backwater reaches nearly to the dam.** Open question 1 understated it.
  An outside review cited the Corps' Beaver water-control manual: at Table
  Rock's conservation pool (915 ft), only about the first river mile below
  Beaver Dam is outside Table Rock's backwater. Eddy's own CWMS read agrees:
  `Beaver_Dam-Tailwater.Elev-Downstream` was 916.35 ft on 2026-11-12. Backwater
  does not mean no current everywhere at all times. The river copy now says
  Beaver releases and Table Rock both affect the stretch, and that parts of it
  may paddle like a lake. The reach stays unrated with float time withheld.
- **Parker Bend's concrete driveway is hatchery-truck access to a stocking
  chute**, not a public boat ramp
  ([AGFC](https://www.agfc.com/news/agfc-boosts-stocking-capability-at-parker-bend)).
- **Bertrand Walk-in Access** (creel-survey Fig. 1) is a sixth candidate. It is
  not in the current AGFC facility layer. Corps gravel parking areas #2
  (AGFC 2162) and #3 (AGFC 1676) are 150–250 m upstream of the Bertrand ramp.
  It is held in `access-points/beaver-tailwater.json` without a coordinate.
- **Spillway series exists:** `Beaver_Dam.Flow-Tainter Total.Ave.1Hour.1Hour.Regi-Comp`
  returned 49 hourly values (0 cfs) for 2026-11-10/11, the same series the
  other SWL dams use.
