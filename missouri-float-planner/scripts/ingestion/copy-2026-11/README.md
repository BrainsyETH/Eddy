# User-facing copy cleanup (November 2026)

Access-point text fields that users read had picked up research notes from
data imports:
- coordinate sources ("Coord = MDC GIS Boat Ramps layer, corroborated by
  USGS 07018000 …");
- gauge and station IDs, map-layer names, river-mile references;
- "per floatmissouri" and "Agnew lists…";
- inline attribution like "(MDC)".

Many fields were also long, or used em dashes.

`copy-rewrite.csv` rewrites **426 fields across 228 approved access points**:

| Field | Rows |
| --- | ---: |
| `description` | 151 |
| `facilities` | 109 |
| `parking_info` | 91 |
| `road_access` | 42 |
| `local_tips` | 25 |
| `fee_notes` | 8 |

## Which fields were selected
A field was selected if it had research notes, an em dash, or was over its
length guide: description 260, facilities 180, parking 120, road 200, tips
260, fees 160 characters.

## Drafting rules
- Keep every fact a paddler needs: directions, hazards, closures, seasonal
  rules, private-property warnings, capacities, fees, phone numbers.
- Add nothing.
- Drop research notes and inline attribution.
- No em dashes.
- Plain, friendly wording.
- `local_tips` keeps its HTML.
- `removed` lists any non-note detail left out, for review.

## Checks
- **Mechanical:** every draft is within its limit, with no dashes, no
  remaining notes and HTML intact. Phone numbers, dollar amounts, dates and
  safety or restriction words are checked against the original.
- **By hand:** the 42 drafts the fact check flagged were reviewed.
- **Hand edits:** two rows (Rush road access, Eminence parking) were edited
  by hand after review.
- **Cleared fields:** two descriptions held only pin-placement notes and
  become empty (Tecumseh, Highway PP).

The original values are the sheet's `current` column, so nothing is lost.
There is no separate notes field, as decided.

## Attribution
Inline "(MDC)" is gone. The access page now shows one small line, for example
"Includes data from the Missouri Department of Conservation.", built from the
place's reviewed `agency_gis_features` links (`dataSources` on the detail API).

## Applying
```bash
npx tsx scripts/repair-access-enrichment-2026-11.ts --sheet=scripts/ingestion/copy-2026-11/copy-rewrite.csv
```
That previews. Add `--apply`, with `EXPECTED_SUPABASE_REF`, to write. Every
write is compare-and-set on the original text and read back.

The apply rules now refuse em dashes and research-note patterns in these six
fields (`isUserText`).

## Applied (2026-11-01, production `ilefwfpvphadsbptiaur`)

All 426 rows were applied with explicit authorization, across 228 access
points. Every write was compare-and-set on the original text and read back,
and a rerun previews 0 pending. Pre-write values are in
`rollback-copy-2026-11-01.json`.

After the apply, no approved access point has research notes or an em dash in
any of the six fields:

| Field | Average length before | Average length after |
| --- | ---: | ---: |
| `description` | 278 | 198 |
| `facilities` | 140 | 111 |
| `parking_info` | 65 | 57 |

Kyles Landing's rewritten parking text ("No parking on Kyles Landing Road")
briefly tripped the whole-table audit's "no parking" rule, which now treats
"no parking on <road>" as a road restriction. The scan is back to the two
known, accepted findings (Denny Hollow Float Camp and Horse Camp).
