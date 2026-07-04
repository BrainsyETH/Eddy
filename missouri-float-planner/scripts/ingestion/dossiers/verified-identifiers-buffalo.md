# Buffalo National River — Primary-Source Verified Identifiers

> The [verify] pass for the Buffalo dossier (see dossier.ts gates). Every id
> below was confirmed against a USGS monitoring-location page on 2026-07-03,
> independently of the research pass — diff the research dossier's `gauges[]`
> against this list before ingest. Anything the dossier claims that is NOT
> here needs its own primary-source check.
>
> Cautionary note: an from-memory guess during this session had Ponca as
> 07055646 — wrong (that's Boxley). This is why the gate exists.

## USGS gauges (verified via waterdata.usgs.gov/monitoring-location/…)

| Site ID  | Name (USGS)                              | Reach (expected)      |
|----------|------------------------------------------|-----------------------|
| 07055646 | Buffalo River near Boxley, AR            | Hailstone / headwaters|
| 07055660 | Buffalo River at Ponca, AR               | Upper (Ponca–Pruitt)  |
| 07055780 | Buffalo River at Carver Access nr Hasty  | Upper/Middle boundary |
| 07055820 | Buffalo River D.S. of Carver, AR         | Middle                |
| 07056000 | Buffalo River near St. Joe, AR           | Middle (Tyler Bend)   |
| 07056700 | Buffalo River near Harriet, AR           | Lower                 |
| 07057000 | Buffalo River near Rush, AR              | Lower (Rush)          |

Sources:
- https://waterdata.usgs.gov/monitoring-location/USGS-07055646/
- https://waterdata.usgs.gov/monitoring-location/USGS-07055660/
- https://waterdata.usgs.gov/monitoring-location/USGS-07055780/
- https://waterdata.usgs.gov/monitoring-location/07055820/
- https://waterdata.usgs.gov/monitoring-location/USGS-07056000/
- https://waterdata.usgs.gov/monitoring-location/USGS-07056700/
- https://waterdata.usgs.gov/monitoring-location/USGS-07057000/

## High-value calibration sources surfaced during verification

- USGS "Buffalo National River Floating Conditions — Arkansas" data product:
  https://www.usgs.gov/data/buffalo-national-river-floating-conditions-arkansas
  (USGS itself publishes floatability guidance for this river — pair with the
  NPS river-levels page as the two authoritative calibration anchors.)
- Dedicated USGS Buffalo River page: https://ar.water.usgs.gov/buffaloriver/
- NPS partners level page: https://bnrpartners.org/riverlevels
- Outfitter level pages (datum capture required):
  https://www.buffaloriver.com/river-levels/ (Buffalo Outdoor Center)
  https://dirstcanoerental.com/water-levels/ (Dirst)

## Still to verify (not yet confirmed against a primary source)

- NHD Permanent Identifier for the Buffalo River flowline
- NPS park code (expected `buff`) against the NPS API
- Parameters available per gauge (00060/00065), drainage areas, periods of
  record — pull from each monitoring-location page or the site inventory
  during the ingest verification pass
