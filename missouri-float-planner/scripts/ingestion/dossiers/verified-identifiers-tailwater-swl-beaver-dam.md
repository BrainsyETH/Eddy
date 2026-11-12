# Verified Identifiers — Beaver Dam tailwater (White River, AR) · swl-beaver-dam

Primary-source transcription, probed live **2026-11-12**. Companion to
[`verified-identifiers-tailwater-swl-norfork-dam.md`](verified-identifiers-tailwater-swl-norfork-dam.md);
full evidence in [the research record](../reviews/BEAVER_TAILWATER_RESEARCH_2026-11-12.md).

## Dam and release (primary gauge)

| Identifier | Value | Source |
| --- | --- | --- |
| CWMS location | `Beaver_Dam`, office SWL, 36.421283333333, -93.847616666667 (WGS84), Carroll County | <https://cwms-data.usace.army.mil/cwms-data/locations/Beaver_Dam?office=SWL> |
| CWMS tailwater sub-location | `Beaver_Dam-Tailwater`, 36.4216715, -93.845085 (station coordinates) | <https://cwms-data.usace.army.mil/cwms-data/locations/Beaver_Dam-Tailwater?office=SWL> |
| Eddy station | `gauge_stations` provider `usace`, `site_id_external = 'swl-beaver-dam'` (registry entry `swl-beaver-dam` in `src/lib/flow-providers/usace-registry.ts`, same coordinates as CWMS) | migration `20261112162415` |
| Tailwater temperature | `Beaver_Dam-Tailwater.Temp-Water.Inst.1Hour.0.Decodes-rev` resolves (48.9 °F, 2026-11-12 15:00 UTC); the standard `swlSeries` id works here, unlike Norfork | CWMS catalog |

## USGS sites on the reach

| Site | Name | Measures | Use |
| --- | --- | --- | --- |
| 07049691 | White River at Beaver Dam near Eureka Springs, AR | Water temperature, dissolved oxygen; no discharge or stage | Registry `waterQualitySiteId` at activation, as Norfork's 07060000 |
| 07049698 | White River near Busch, AR (US 62 bridge) | Gage height only (since 2020-02), datum 908.81 ft NAVD88 | **Not wired**: sits on Table Rock's pool level |
| 07049693 | White River at campground E near Busch | Discrete water quality, inactive since 1998 | None |
| 07050000 | White River at Beaver, AR | Discontinued 1958; below the extent | None |

Source: <https://waterservices.usgs.gov/nwis/site/?format=rdb&bBox=-93.90,36.40,-93.70,36.52&siteStatus=all>

## Extent

**Beaver Dam → the boat ramp at Houseman Access**, AGFC regulation N1.03
(effective 2025-01-01): "White River from 100 yards below Beaver Dam to the
boat ramp at Houseman Access" — <https://www.law.cornell.edu/regulations/arkansas/002-01-24-Ark-Code-R-011>.
Houseman Boat Ramp is AGFC public-use facility **792**, 36.462934, -93.814377.
NHD HR White River, HUC **11010001**, sliced between those anchors: **6.99 mi**
(AGFC publishes 7–7.5 mi).
