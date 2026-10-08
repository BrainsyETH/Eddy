# Buffalo gauge repair — 2026-10-08

Owner authorized the data repair and quick iOS overview selection. Production
migration `20261008014150_buffalo_section_gauges_and_pruitt` is applied and recorded
in the repository ledger. Existing recreational thresholds were preserved;
the historical dossier is not a replacement for current St. Joe calibration.

| Reach (guide miles, end exclusive) | Reference gauge |
| --- | --- |
| Hailstone / above Ponca (<6) | Boxley 07055646 |
| Ponca–Pruitt (6–29.9), including Steel Creek | Ponca 07055660 |
| Pruitt–Hasty (29.9–36.7) | Pruitt 07055680 |
| Hasty–Gilbert (36.7–76.9) | St. Joe 07056000 |
| Gilbert downstream (76.9+) | Harriet 07056700 |

The new reach follows NPS's documented Pruitt–Hasty alternative when upriver
conditions are too low. An Ozark extension remains unverified and was not
applied. Existing section slugs are retained for bookmarks.

Pruitt uses the captured NPS cfs thresholds: 100 / 200 / 1000 / 2000. Its
Moderate band remains Good; no extra Good/Flowing boundary was invented.
The station was already in the national catalog with real readings. Curated
history was seeded from that observation with its original timestamp.

## Application changes

- Access details honor bounded section assignments before proximity or the
  river-wide primary. A failed explicit assignment reads unavailable.
- The gauge API includes river miles for upstream-to-downstream ordering.
- iOS shows a native selection menu on access and river overviews and river
  details. One tap opens choices; selecting updates the reading in place.
  Count comes from available gauges. Menu rows include readings and conditions,
  with explicit delayed, historical, missing, or suspect states.
- Dossier ingestion validates and persists representative gauges together
  with their bounds. Legacy unbounded sections cannot capture the whole river.

## Verification and release

- 3,265 automated tests passed, including reach boundaries, unavailable
  assignments, gauge ordering, units, and freshness labels.
- Web TypeScript, ESLint and design-token checks passed. Mobile TypeScript,
  lint, iOS Metro export and EAS archive checks passed.
- `tsx` CLI IPC is blocked in this workspace; web tests/token checks ran through
  `node --import tsx`. The linked Supabase CLI was unavailable; production
  migration versions were read through the connector and compared using the
  repository's ledger checker (no differences).
- The migration itself asserts the segment RPC's boundary routing. Public
  API reads subsequently confirmed Steel Creek uses Ponca and the Buffalo
  gauge catalog includes all five stations, including Pruitt.
- Server and iOS code still require release. The new native menu dependency
  requires a new iOS binary, not an OTA-only update. A device/simulator build
  was not available here. Before release, check tap selection, subtitles,
  VoiceOver, large text, both themes, and the access sheet's loading layout.

Sources: [USGS Pruitt](https://waterdata.usgs.gov/monitoring-location/USGS-07055680/),
[NPS Pruitt–Hasty](https://www.nps.gov/thingstodo/paddle-pruitt-to-hasty.htm),
and the existing `buffalo-thresholds-captured.md` source capture.
