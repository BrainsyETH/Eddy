# One-off access-point enrichment (November 2026)

A single pass that proposes values for **existing** `access_points` columns
from agency map data. It is not a pipeline, and nothing refreshes it.
Proposals only: **nothing in this folder has been written to the database.**

It adds no access points and moves no pins. Agency parking lots attach to the
access point they serve, as facts about that place (there is parking; its
surface). They never become a second coordinate.

## Files

- `review.csv`: 225 rows for approved access points, generated 2026-10-31 by
  `scripts/ingestion/oneoff-access-enrichment-2026-11.ts`. That's **177
  proposed edits and 48 flags**. Flags carry no value and can't be applied.
  - `accept` is pre-filled `y` on the 87 high-confidence rows. Review the rest.
  - `evidence_ids` names every feature the row rests on, one per fact (each
    added amenity cites its own feature). `evidence_url` gives their links in
    the same order.
  - The other columns are `confidence`, `river`, `slug`, `name`, `field`,
    `current` / `proposed` (JSON), `evidence`, `launch_map`, `note` and
    `access_point_id`.
- `sources.json`: retrieval time, layer URLs and counts. Under `evidence`, it
  holds every cited feature by ID, with its layer, link, geometry and
  attributes — enough to re-check each spatial match without refetching.
  PAD-US parcels are cited by `public_lands.id`, and their geometry stays in
  that table.

## What was proposed

| Field | high | medium | low | flag |
| --- | ---: | ---: | ---: | ---: |
| `managing_agency` | 19 | 20 | 21 | 42 |
| `amenities` (additions) | 35 | 22 | | |
| `parking_info` | 19 | 10 | | |
| `ownership` (spelling) | 14 | | | 3 |
| `road_surface` | | 9 | | 3 |
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

**`amenities`:** every contributing feature must pass the same belonging test
as parking: within range, same bank, and not nearer another access point. The
row is high only when every added amenity comes from a feature tied to the
place by a reviewed link or a shared MDC area ID, *and* its bank was checked.
It is medium when any amenity rests on proximity or a name (USFS sites,
unlinked AGFC features), or sits on the river line. USFS recreation sites pass
the same test before they supply a link, a fee flag or an amenity.

**`managing_agency`:** taken from the smallest PAD-US fee parcel at the
launch (easements and overlays are ignored; Wild and Scenic corridors are used
only when no other parcel contains the launch), the linked agency feature, and
the ownership text.
- **high** — two independent sources agree;
- **medium** — a map source;
- **low** — the ownership text alone.

Every identified manager is compared *before* asking whether the column can
hold it. An AGFC record therefore still contradicts a PAD-US USACE parcel, as
at Romp Hole and Dry Run Creek, and an AGFC record contradicts a City one, as
at Hardy Beach. Conflicts are flags, and so are uncontested managers the check
constraint can't hold (`AGFC`, `USFWS`).

**`official_site_url` / `fee_required`:** from the nearest USFS INFRA
recreation site within 300 m (medium within 150 m). Check that the named site
is the same place.

**`road_surface`:** only from an MVUM road within 150 m, on Forest Service
ground, *whose name shows it serves the access*: every distinctive word of the
road name must appear in the place name. Being the nearest road isn't evidence
of the approach. Turner Mill South is 130 m from road 3190 "Turner Mill North",
but MDC lists its approach as County Road 127/FS-3153. A nearby road that
fails the name test becomes a flag, never a value.

**`ownership`:** fixes exact spelling duplicates only ("County" → "county").
A "private" record whose launch sits on a public parcel is a flag, never a
change.

## Review

Clear `accept` on any pre-accepted row you disagree with, and put `y` on the
others you want applied. Flags carry no value and are never applied.

To apply, run `scripts/repair-access-enrichment-2026-11.ts` from
`missouri-float-planner/`. It reads only accepted rows, one compare-and-set
correction per access point. It previews by default and prints the current
values, which are the rollback.
- **Before any write:** each id must still carry its slug, and each field must
  hold either the sheet's `current` value or its `proposed` one (already
  applied). Any surprise stops the run with nothing written.
- **During the write:** each update is conditioned on an unchanged
  `updated_at`, and every row is read back afterwards.
- **To write:** `--apply` needs `EXPECTED_SUPABASE_REF=ilefwfpvphadsbptiaur`
  and explicit authorization.

## Applied (2026-10-31, production `ilefwfpvphadsbptiaur`)

The 87 pre-accepted rows were applied with explicit authorization, across 64
access points:
- 35 amenity additions
- 19 parking descriptions
- 19 managing agencies
- 14 ownership spellings

Every row was read back and verified, and a rerun of the preview reports 0
pending changes. `rollback-2026-10-31.json` holds the pre-apply values of
every touched column.

Approved access points (362) before → after:

| Field | Before | After |
| --- | --- | --- |
| Managing agency empty | 43% | 38.1% |
| No parking information | 30% | 24.9% |
| No amenities | 43% | 37.0% |
| Old ownership spellings | 14 | 0 |

The 90 medium/low rows and the 48 flags were **not** applied. To apply any of
them later, mark them `y` and rerun. Rows already applied are skipped.

## Sources and terms

- MDC Area Feature Layers (Parking Lots 26, Privies 21, Camping Sites 27):
  factual GIS fields only; see the [MDC terms](https://mdc.mo.gov/terms-use).
- USFS EDW INFRA Recreation Sites and MVUM Roads (public domain).
- USGS PAD-US v3.0, via `public_lands`.
- AGFC Public Use Facilities, already in `agency_gis_features`
  (see [`../README.md`](../README.md)).

Retain agency attribution when displaying derived facts. Ownership is not
permission: none of these values says a launch is open.
