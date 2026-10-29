# MDC and AGFC GIS ingestion

Imported into Eddy production (`ilefwfpvphadsbptiaur`) on **2026-10-29 UTC**.
The source inventory and pending access rows are already in the database;
the refresh tooling and import record accompany this branch.

| Source | Canonical layer | Imported features |
| --- | --- | ---: |
| Missouri Department of Conservation | [Boat Ramps](https://gisblue.mdc.mo.gov/arcgis/rest/services/Discover_Nature/Area_Feature_Layers/FeatureServer/17) | 554 |
| Arkansas Game and Fish Commission | [Public Use Facilities](https://gisec2.agfc.com/arcgis/rest/services/GIS/AGFC_DATA/MapServer/1) | 3,361 |

The full inventories are in `public.agency_gis_features`, including facilities
outside Eddy's current rivers. AGFC covers boating/canoe access, walk-in access,
parking, toilets, camping and other facility types. RLS and grants restrict this
table to service-role use. No new public API or automatic publishing is enabled.

## What changed

- 3,915 source features stored with original agency attributes, WGS84 coordinates,
  source identifiers, URLs, retrieval times and agency verification dates where supplied.
- 220 source features associated with **130 existing places**. These are evidence
  relationships, not edits to their pins, names, roles, amenities or review state.
- **17 new candidates** (9 MDC, 8 AGFC) inserted with `approved=false` and
  `is_float_endpoint=false`. They appear in the existing access/geography review
  workflow. All are within 97 m of their assigned river geometry; miles are
  geometry-derived and need review before publication.
- Two almost coincident MDC ramp features at T. L. Wright Memorial Access in
  Doniphan point to one candidate. In total, **238 features link to 147 places**.
- Every column of all **397 pre-existing access rows** remained unchanged.
  No rivers were activated and no candidate was published as a trip endpoint.

The new locations cover Big Piney, Black, Current, Eleven Point, James, Meramec
and Mulberry. Arkansas locations on the lower Black, Current and Eleven Point
still need review of reach coverage, gauge relevance and trip suitability.
AGFC's name/owner/waterbody classifications are source evidence; they are not a
claim that access is currently open. In particular, review WMA seasonal restrictions.

## Reproducible records

[`2026-10-29/`](2026-10-29/) contains:

- `mdc-features.json` and `agfc-features.json`: complete source snapshots, limited
  to the documented field allowlists; internal staff/editor fields are omitted.
- `existing-place-links.json`: the explicit reviewed associations. Names,
  spatial proximity and river context were checked; nearest distance alone is
  insufficient. These links are not recomputed on refresh.
- `candidates.json`: source identities, proposed river/place slugs, official
  evidence links and outstanding review requirements for the 17 candidates.
  Agency GIS pins are staging inputs, not independently verified launch pins.
- `apply-reviewed-sites.sql`: the exact, atomic data transaction used to stage
  those candidates and associations. It refuses changed identities, moved source
  coordinates, conflicting links, slug collisions or distant snaps, and asserts
  that no pre-existing access row changed. A repeat application makes no new places.

The SQL uses `snap_to_river` for each new candidate only. The generic dossier RPC
also fills other null miles on the same river; six existing null-mile records
were left intact by this narrower transaction. The SQL contains no generated
production IDs. Execute only against the explicitly confirmed Eddy project.

## Refresh

From `missouri-float-planner/`, with Node 20:

```bash
npx tsx scripts/ingestion/import-agency-gis.ts --download /tmp/eddy-agency-snapshot
npx tsx scripts/ingestion/import-agency-gis.ts --from /tmp/eddy-agency-snapshot
EXPECTED_SUPABASE_REF=ilefwfpvphadsbptiaur npx tsx scripts/ingestion/import-agency-gis.ts --from /tmp/eddy-agency-snapshot --apply
```

The write invocation also needs the normal Supabase service-role environment.
The initial import used the authenticated Supabase connector with that explicit
project ID; no credentials were copied into the repository.

The downloader enumerates IDs, fetches batches of 200 in EPSG:4326, checks every
returned ID, and rejects partial, duplicated, invalid or truncated snapshots.
Both snapshots are validated before any write. Source upserts are in batches;
a transport failure may leave a partially refreshed internal inventory. Retry
the same validated snapshot to finish; curated places remain untouched.

AGFC identity uses GlobalID. MDC lacks a durable feature GUID in this layer, so
identity uses area ID plus coordinates rounded to six decimal places, preserving
identity across OBJECTID renumbering. A moved MDC point becomes a new unmatched
source feature. Refreshes preserve `first_seen_at` and `access_point_id` and
never delete disappeared features or change public place fields. Use the newest
snapshot: historical replays replace source attributes and retrieval timestamps.

`fetched_at` means downloaded, not field-verified. Some AGFC verification dates
are years old; MDC provides none in this layer. Never replace an unknown agency
verification date with the retrieval date.

## Held for review

Lake ramps near a river line were retained only in the source inventory, including
DeGray/Ozark Lake records and MDC's Bismarck, Larry R. Gale and Kellogg Lake sites.
Same-name sites with substantially offset pins (for example Mineral Springs,
Boiling Spring, Blair Bridge, and Woolum/Steel Creek features) were not treated as
new launches or used to move existing ones. Ambiguous amenity associations also
remain unlinked. Existing inactive-river associations do not activate the river.

Review each candidate's exact launch pin, approach/parking, restrictions, fees,
river assignment and duplicate status in `/admin/access-points` or
`/admin/geography`; then deliberately set approval and endpoint eligibility.
Amenity source links do not automatically rewrite public amenity fields.

## Attribution and scope

Retain the agency attribution and original source links when displaying derived
facts. MDC intake uses factual GIS fields, not copied website descriptions,
photographs or videos. Its public endpoint alone is not treated as a blanket
open-content license. See [MDC terms](https://mdc.mo.gov/terms-use).
The Arkansas state's [facility metadata](https://gis.arkansas.gov/metadata/HTML/asdi.location.OUTDOOR_RECREATIONAL_FACILITIES_export.html)
lists no access/use limitations. Agency data remains subject to its accuracy and
currency disclaimers. No external messages or permission requests were sent.

## Validation

- Source previews and a fresh end-to-end downloader run: 554 MDC + 3,361 AGFC, all normalized with unique source identities.
- The complete application transaction passed a rollback rehearsal and a second
  committed replay; access rows remained at 414 and links at 238.
- Re-upserting 250 source rows after linking preserved the checksum of the full
  inventory, including `first_seen_at` and place associations.
- The before/after checksum of all original access rows matched:
  `1be94b5e2fbb64e90e64295484aab518` (397 rows).
- Production migration version `20261029034952` matches the migration filename
  and applied ledger. Live migration/ledger and access-slug checks passed
  (eight pre-existing absent-slug exceptions); client-access contract returned
  no problems. Source-table RLS is enabled; anon/authenticated have no SELECT
  grant and service role can write.
- Web and test TypeScript checks, ESLint, token checks and all **4,247 tests** passed.
  `make check-web` / `make check-db` hit this environment's denied tsx Unix socket;
  checks were completed using `node --import tsx` with the same test list/config
  and the database connector for the same live catalog checks. No test was skipped.
