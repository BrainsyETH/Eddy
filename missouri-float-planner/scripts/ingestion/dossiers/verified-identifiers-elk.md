# Elk identifiers — checked 2026-10-04

Elk is held inactive. This file verifies identifiers and provider metadata, not
thresholds or permission to activate. It supersedes the July assertion that only
the gauge remained unfinished; the full review also found access and route gaps.

## Candidate primary: USGS 07188925, Noel

- Provider name: **Elk Rv at MO-59, Noel, MO**.
- Coordinate: **36.549703, -94.493144**; USGS reports NAD83 origin.
- Drainage area: **801 square miles**. Station altitude/datum: **796.22 ft NAVD88**.
- Published continuous hydrologic parameter: **00065, gage height in feet**.
  The other returned series is battery voltage; no 00060 discharge series was found.
- Stage series: `1d9e1029c2414830b5bbe99ba1e834b3`, beginning
  **2026-06-02 19:15 UTC**. Metadata end at retrieval: 2026-10-03 07:15 UTC;
  Eddy's reference latest table had a newer 2026-10-04 00:15 UTC reading.
- Current production station exists, active and reference-tier (`curated=false`),
  but is not linked as Elk's representative. Curated history is empty; that does
  not mean its reference polling stopped.

Sources: [station metadata](https://api.waterdata.usgs.gov/ogcapi/v0/collections/monitoring-locations/items/USGS-07188925?f=json),
[time-series metadata](https://api.waterdata.usgs.gov/ogcapi/v0/collections/time-series-metadata/items?f=json&monitoring_location_id=USGS-07188925&limit=100),
[monitoring page](https://waterdata.usgs.gov/monitoring-location/USGS-07188925/).

USGS metadata's operational suppression limits describe instrument/data handling;
they are **not recreational thresholds**. No Noel ladder is signed off.

## Historical primary: USGS 07189000, Tiff City

The inspected continuous stage **and** discharge series both end
**2026-04-27 16:30 UTC**. The earlier statement that stage history did not exist
was based on an incomplete legacy response and is superseded by the current
USGS series catalogue. It does not change the inactive-gauge conclusion.

- Stage series: `dfd3126b293649b583f4f77ba7174cfa` (begins 2007-10-01).
- Discharge series: `348b29f569234f46bf24509ebe10a66b` (begins 1990-05-01).
- Production station: inactive; still Elk's linked primary pending replacement.
- The historical owner-reviewed Tiff City ladder remains archived in production:
  too low 2.5 ft, optimal 3.5–5 ft, dangerous 6 ft. These are **not Noel values**.
  July notes also mention a 6.5-ft operator closure; that inconsistency is another
  reason not to treat the archive as a current Noel calibration.
- The [operator's level page](https://www.elkriverfloats.com/river-levels/)
  still embeds **07189000**, not Noel, as of this review.

Source: [Tiff City series catalogue](https://api.waterdata.usgs.gov/ogcapi/v0/collections/time-series-metadata/items?f=json&monitoring_location_id=USGS-07189000&limit=100).

There is no overlapping continuous record between Tiff City and Noel in these
catalogues. No cfs transfer or fixed stage offset is supported. Final gauge
selection and recreational anchors require owner signoff through the existing
dossier process.

## NHD identity and confluence POIs

USGS NHD Large Scale Flowline layer was queried in WGS84 for the upper Elk
envelope `-94.505,36.545,-94.375,36.605`. It returned 493 flowlines without a
transfer-limit flag. Elk's GNIS ID is **01092538**. Representative mainstem
Permanent_Identifier **86154255** starts at its formation; it is not the ID of
the whole multisegment river.

| Feature | Shared vertex, latitude / longitude | NHD Permanent_Identifiers |
| --- | --- | --- |
| Big Sugar + Little Sugar → Elk | 36.5882863657504, -94.3826795944845 | Big Sugar 86154253; Little Sugar 86154453; Elk 86154255 |
| Indian Creek → Elk | 36.58150982744679, -94.45037527837668 | Indian 86154681; upstream Elk 86155147; downstream Elk 86154679 |

Source: [USGS NHD query](https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/6/query?where=permanent_identifier%20IN%20%28%2786154253%27%2C%2786154453%27%2C%2786154255%27%2C%2786154681%27%2C%2786155147%27%2C%2786154679%27%29&outFields=*&outSR=4326&f=pjson).

Both vertices fall within one metre of Eddy's existing line. These are dataset
coordinates, not surveyed launch points. Proposed POIs identify the confluences
without adding tributary routes or claiming permission to land.
