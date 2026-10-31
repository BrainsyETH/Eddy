# One-off access-point enrichment (November 2026)

A single pass that proposes values for **existing** `access_points` columns
from agency map data. It is not a pipeline and nothing refreshes it.
Proposals only: **nothing in this folder has been written to the database.**

## Files

- `review.csv`: 295 proposals across 200 of the 362 approved access points,
  generated 2026-10-31 by `scripts/ingestion/oneoff-access-enrichment-2026-11.ts`.
  Columns:
  - `accept`: blank. A reviewer fills it in.
  - `confidence`
  - `river`, `slug`, `name`, `access_point_id`
  - `field`
  - `current` / `proposed`: JSON-encoded. `driving_pin` is `[lat, lng]`.
  - `evidence`, `evidence_url`
  - `launch_map` / `proposed_map`: Google Maps links to the launch pin and the proposed pin.
  - `note`
- `sources.json`: retrieval time, layer URLs, feature counts, and the
  attributes of every agency feature a proposal cites. Together with the
  `evidence_url` links, this is the record.

## What was proposed

| Field | high | medium | low | flag |
| --- | ---: | ---: | ---: | ---: |
| `driving_pin` | 71 | 20 | | |
| `managing_agency` | 19 | 23 | 21 | 39 |
| `amenities` (additions) | | 57 | | |
| `ownership` (spelling) | 14 | | | 3 |
| `road_surface` | | 12 | | |
| `official_site_url` | | 6 | 2 | |
| `parking_info` | 4 | 4 | | |

## Rules

Only empty fields get proposals. Amenities are additions only.

**`driving_pin`.** The primary parking pin comes from one of:
- an MDC Parking Lot (FeatureServer/26) sharing the `Area_ID` of the place's linked MDC boat ramp;
- an AGFC Parking Area already linked to the place in `agency_gis_features`;
- an unlinked AGFC Parking Area with the same name.

A lot is refused when it is more than 600 m away, on the opposite bank (by
side of the river line), nearer another access point, or within 25 m of the
launch, where it adds nothing to directions.

Confidence:
- **high:** linked or same-area, within 400 m, bank checked;
- **medium:** otherwise.

A launch pin on the river line itself can't be assigned a bank, so it is
marked "bank not checked".

**`managing_agency`.** Signals:
- the smallest PAD-US fee parcel at the launch. Easements and overlays are
  ignored, and Wild and Scenic corridors are used only when no other parcel
  contains the launch;
- the linked agency feature;
- the ownership text.

Confidence:
- **high:** two independent sources agree;
- **medium:** a map source;
- **low:** ownership text only.

Conflicts and managers the check constraint can't hold are **flags**. 35 of
the 39 flags are AGFC-managed sites, because `AGFC` is not an allowed value.

**`official_site_url` / `fee_required` / USFS restrooms and camping.** Taken
from the nearest USFS INFRA recreation site within 300 m (medium within
150 m). Check that the site named is the same place.

**`road_surface`.** Taken from the nearest MVUM road within 150 m, only on
Forest Service ground. It is the nearest road, not necessarily the approach.
Roads limited to high-clearance vehicles are marked low and say so.

**`ownership`.** Exact spelling duplicates only ("County" → "county"). A
"private" record whose launch sits on a public parcel is a flag, never a change.

## Review

1. Put `y` in `accept` for rows to apply. Flags have no value and are never
   applied, whatever `accept` says.
2. Open `proposed_map` for every `driving_pin` before accepting it. Directions
   on the web and iOS route to it as soon as it is set.

The apply step (`scripts/repair-access-enrichment-2026-11.ts`, not written yet) will read only
accepted rows. It checks each field still holds the `current` value, and
conditions every write on an unchanged `updated_at`. It needs
`EXPECTED_SUPABASE_REF` and explicit authorization.

## Sources and terms

- MDC Area Feature Layers (Parking Lots 26, Privies 21, Camping Sites 27):
  factual GIS fields only (see the [MDC terms](https://mdc.mo.gov/terms-use)).
- USFS EDW INFRA Recreation Sites and MVUM Roads (public domain).
- USGS PAD-US v3.0, via `public_lands`.
- AGFC Public Use Facilities, already in `agency_gis_features`
  (see [`../README.md`](../README.md)).

Retain agency attribution when displaying derived facts. Ownership is not
permission: none of these values says a launch is open.
