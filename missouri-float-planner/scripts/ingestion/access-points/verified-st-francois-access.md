# St. Francois State Park access verification

Reviewed 2026-10-27. This park is on the **Big River**, near Bonne Terre,
not on the St. Francis River. The campground already exists in Eddy as
`st-francois-state-park-campground`, with one live Missouri State Parks
facility (`83`). The missing records are the two canoe launches.

## Location evidence

[Missouri State Parks' boating page](https://mostateparks.com/park/st-francois-state-park/boating)
confirms two picnic-area canoe launches. The
[official park map, dated 08/24](https://mostateparks.com/sites/g/files/zuston361/files/media/pdf/2024/11/4STF_ColorMap.pdf)
places one south of the northern ballfield and one on the southern picnic loop
near Shelter 2. Both river-access symbols, their road approaches, parking and
vault toilets were visually checked on that map.

| Launch | Latitude | Longitude | Flowline mile | Snap distance |
| --- | ---: | ---: | ---: | ---: |
| Access 2 (upstream, southern picnic loop) | 37.956417 | -90.541217 | 52.45 | 45.91 m |
| Access 1 (downstream, northern day-use area) | 37.966933 | -90.534100 | 53.31 | 63.59 m |

Miles and distances above are the stored results of Eddy's `snap_to_river`
function, which supplies the application's mile convention.

The numeric coordinates and access numbers come from the published
[MoParkFeatures layer](https://services1.arcgis.com/g2TonOxuRkIqSOFx/arcgis/rest/services/moparkfeatures/FeatureServer/0),
features **1262** and **1261** respectively. This is a **third-party ArcGIS
publication**, not a verified DNR-owned layer. Its coordinates are retained
only after checking their locations against the current official park map.
The current official interactive park map omits both launches; the PDF and
boating page still show/describe both. The DNR facility GIS requires a token
and was not used as evidence.

Independent corroboration: OpenStreetMap's park roads and parking polygons
([southern parking](https://www.openstreetmap.org/way/320933578),
[northern parking](https://www.openstreetmap.org/way/320924510)) match the
official map's two road approaches. These are parking polygons, not OSM launch
nodes; their centroids were **not** substituted for the published access pins.
[Shelter 2's official page](https://mostateparks.com/key-location/shelter-2-3)
also identifies nearby Big River access. No geocoding or campground centroid
was used to place either launch. Geometry distance alone is not evidence of
legal access; that comes from the park's boating page and map.

These are carry-in canoe/kayak accesses, not verified concrete ramps. They
receive the `access` role and explicit float-endpoint eligibility. The
campground remains a separate map destination. Both launches use `located_at`
links to its existing service, which routes availability and booking to both
detail sheets without creating a second provider facility or hiding its pin.

## Campground evidence

- [Park page](https://mostateparks.com/park/st-francois-state-park): address
  8920 U.S. Highway 67 N., Bonne Terre, MO 63628-3598.
- [Camping page](https://mostateparks.com/park/st-francois-state-park/camping):
  basic, electric and sewer/electric/water sites; year-round camping with
  showers and water April through October. Its **Make a Reservation Now** link
  points directly to `https://icampmo1.usedirect.com/MSPWeb/#!park/83`.
- [DNR reopening announcement](https://oembed-dnr.mo.gov/communications/news/st-francois-state-park-campground-reopens-after-renovations):
  the new section opened October 2, 2026 with 63 physical sites (20 electric,
  43 full hookup). Camping itself is not new.
- [General information](https://mostateparks.com/basic-page/general-information-st-francois):
  campground restrooms, showers and dump stations.

At verification, Eddy's existing facility already held **171 bookable sites**,
including 62 in the new section. Physical-site counts and bookable units are
different measures. Preserve this inventory and its provider links. Clear the
old `rv_sites=63` and `$15-$27` range rather than present pre-expansion figures
as current totals/prices. Leave tent count unknown and let the live provider
inventory supply bookable counts.

The boating page has no per-place `og:image`; retain default access artwork.
No campground photo is assigned to a launch.

## Application and validation

Use the scoped `st_francois_river_access` migration, not a full Big River
dossier reimport, so existing access descriptions and review decisions stay
untouched. The migration inserts pending points, calculates geometry miles
only for these two slugs, checks snapping/order, then approves and links them.
It aborts if an existing slug has different coordinates or expected campground
prerequisites are missing. Run it in a rollback transaction before applying;
repeat it there to check idempotency. Check that the other nine access rows and
all campsite inventory remain unchanged. Record the production-assigned
migration version in the ledger, run `make check-web` and `make check-db`, and
verify both public access-detail responses include the same facility and
park-specific booking URL.

Applied as production version **20261027195705**. The rollback rehearsal ran
the migration twice and checked that the other nine Big River accesses, the
existing facility, all sites and both availability tables were unchanged.
After application, both launches are approved endpoints and the same facility
still holds 171 sites.

Both public access-detail APIs and HTML pages return HTTP 200 with the
campground's existing availability and its park-specific booking link.
TypeScript and ESLint passed; all **4,085** registered tests passed. The normal
`make` wrappers encounter the environment's blocked `tsx` IPC socket, so token
lint and the same registered test list ran through `node --import tsx` with
`TSX_TSCONFIG_PATH=tsconfig.test.json`. The production ledger's ten tests passed
again after recording the assigned version.

This checkout has no linked Supabase CLI credentials. The three `check-db`
contracts were therefore evaluated against connector-read production rows
using the repository's existing comparison functions and SQL: all 145
post-baseline migration versions match the files and ledger, the 397 access
slugs have no unexpected drift (eight documented legacy exceptions remain),
and the client-access catalog check reports no problems. The dossier validator
also passes both new endpoints.
