# One-off access-point enrichment (November 2026)

A single pass that proposes values for **existing** `access_points` columns
from agency map data. It is not a pipeline, and nothing refreshes it.
Proposals only: **nothing in this folder has been written to the database.**

It adds no access points and moves no pins. Agency parking lots attach to the
access point they serve, as facts about that place (there is parking; its
surface). They never become a second coordinate.

## Files

- `review.csv`: 225 proposals for approved access points, generated
  2026-10-31 by `scripts/ingestion/oneoff-access-enrichment-2026-11.ts`.
  - `accept` is pre-filled `y` on the 89 high-confidence rows. Review the rest.
  - The other columns are `confidence`, `river`, `slug`, `name`, `field`,
    `current` / `proposed` (JSON), `evidence`, `evidence_url`, `launch_map`,
    `note` and `access_point_id`.
- `sources.json`: retrieval time, layer URLs, counts, and the attributes of
  every agency feature a proposal cites. With the `evidence_url` links, this is
  the record.

## What was proposed

| Field | high | medium | low | flag |
| --- | ---: | ---: | ---: | ---: |
| `managing_agency` | 19 | 23 | 21 | 39 |
| `amenities` (additions) | 37 | 20 | | |
| `parking_info` | 19 | 10 | | |
| `ownership` (spelling) | 14 | | | 3 |
| `road_surface` | | 12 | | |
| `official_site_url` | | 6 | 2 | |

**Parking match:** 141 agency parking lots (81 MDC, 60 AGFC) belong to 111
existing access points. Most of those places already had parking text and the
parking amenity, so the new facts are `parking_info` for 29 places and the
`parking` amenity for 32.

## Rules

Only empty fields get proposals. Amenities are additions only.

**Which lots belong to a place:**
- MDC Parking Lots (FeatureServer/26) sharing the `Area_ID` of the place's
  linked MDC boat ramp;
- AGFC Parking Areas linked to the place in `agency_gis_features`;
- unlinked AGFC Parking Areas with the same name.

A lot does not belong when it is more than 600 m away, on the opposite bank
(by side of the river line), or nearer another access point, in which case it
belongs to that one.

**`parking_info`:** surface only, e.g. "Paved lot (MDC)." or "2 lots: paved,
gravel (AGFC)." MDC's `Allows_Trailers` field is deliberately not used,
because its meaning is unconfirmed.

**Confidence:**
- **high** — every lot is linked or same-area, within 400 m, and the bank was checked;
- **medium** — otherwise.

A launch pin on the river line itself can't be assigned a bank.

**`amenities`:** high when every added amenity comes from a feature tied to
the place, by a reviewed link or a shared MDC area ID. It is medium when any
of them rests on proximity or a name (USFS sites, unlinked AGFC features).

**`managing_agency`:** taken from the smallest PAD-US fee parcel at the
launch (easements and overlays are ignored; Wild and Scenic corridors are used
only when no other parcel contains the launch), the linked agency feature, and
the ownership text.
- **high** — two independent sources agree;
- **medium** — a map source;
- **low** — the ownership text alone.

Conflicts, and managers the check constraint can't hold, are flags. 35 of the
39 flags are AGFC-managed sites, because `AGFC` is not an allowed value.

**`official_site_url` / `fee_required`:** from the nearest USFS INFRA
recreation site within 300 m (medium within 150 m). Check that the named site
is the same place.

**`road_surface`:** from the nearest MVUM road within 150 m, on Forest Service
ground only. That is the nearest road, not necessarily the approach.

**`ownership`:** fixes exact spelling duplicates only ("County" → "county").
A "private" record whose launch sits on a public parcel is a flag, never a
change.

## Review

Clear `accept` on any pre-accepted row you disagree with, and put `y` on the
others you want applied. Flags carry no value and are never applied.

The apply step (`scripts/repair-access-enrichment-2026-11.ts`, not written
yet) will read only accepted rows. It will check that each field still holds
the `current` value, and condition every write on an unchanged `updated_at`.
It needs `EXPECTED_SUPABASE_REF` and explicit authorization.

## Sources and terms

- MDC Area Feature Layers (Parking Lots 26, Privies 21, Camping Sites 27):
  factual GIS fields only; see the [MDC terms](https://mdc.mo.gov/terms-use).
- USFS EDW INFRA Recreation Sites and MVUM Roads (public domain).
- USGS PAD-US v3.0, via `public_lands`.
- AGFC Public Use Facilities, already in `agency_gis_features`
  (see [`../README.md`](../README.md)).

Retain agency attribution when displaying derived facts. Ownership is not
permission: none of these values says a launch is open.
