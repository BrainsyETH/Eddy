# Blog and place photo audit — 2026-10-11

Read-only checks of the published blog and active-river catalogs found 14 of 26
blog cards using Eddy artwork, 14 access points without photos, and 15 POIs
without photos. The camping overview had 14 places without a usable campground
photo (maps and numbered campsite photos are intentionally excluded).

## Additions

`missouri-float-planner/src/data/guide-photos.json` records 12 reviewed river
covers: Big Piney, Big River, Black, Bourbeuse, Buffalo, Crooked Creek, James,
Kings, North Fork, Spring River AR, St. Francis, and War Eagle. Each record
includes its exact published post/river identity, source image and rights page,
author, license, caption, and disclosed alterations. WebP copies ship in
`public/images/river-guides/`: 640px cards and heroes up to 1400px, without
upscaling. The copies retain their source licenses; `/photo-credits` links to
the originals, licenses, and adapted assets.

These are river scenery, not current-condition or route-endpoint evidence.
Kings Falls and the North Fork headwaters are explicitly captioned as upstream
of the featured floats. The St. Francis cover shows summer low water at Silver
Mines, replacing a historical image of the since-removed dam. Route cards retain
the seed's opt-out of automatic access-photo substitution.

The same resolver serves the blog index, article heroes/structured-data image,
homepage guide links, river-page guide card, and public blog APIs consumed by
iOS. New card photos carry visible source/license credits. The API returns
absolute asset URLs and optional attribution/alt text. Existing editor-selected
images win; only blank images, the exact Eddy placeholder, and explicitly
reviewed original aliases are replaced. An unrelated article on the same river
does not inherit these selections.

`withReviewedPlacePhoto` exposes the existing reviewed Dry Run Creek, Blue
Spring, Alley Spring Mill, and Pulltite selections when their exact records are
empty, plus a new NPS Jam Up Cave photograph. Access-point serialization (online
and offline), river POI/service APIs, and the camping overview use this helper.
It shares the guarded backfill's identity, provider-ownership, and
preserve-existing checks. It performs no database writes. Linked NPS POIs and
malformed provider metadata remain unchanged. Existing photographs still win.

## Remaining source gaps

Elk and Gasconade still use the intentional Eddy illustration. The Elk sources
reviewed did not establish suitable reusable modern Missouri scenery. Gasconade
USGS image/report candidates depicted floods, including a submerged building;
they were rejected as misleading float-guide covers. Other river covers are
not substituted for either river.

The following exact-place records still need suitable photos with documented
reuse rights. Generic river scenery is not evidence of a ramp, business,
confluence, or campground.

| Catalog | River | Place |
| --- | --- | --- |
| Access point | black | Mill Creek |
| Access point | black | Mill Spring (Hwy 49) City Park |
| Access point | black | Twin Rivers Landing |
| Access point | bourbeuse | Laubinger Ford |
| Access point | buffalo | Shine Eye |
| Access point | current | Echo Bluff State Park |
| Access point | elk | City of Pineville Elk River Access |
| Access point | gasconade | Barlow Ford |
| Access point | gasconade | Indian Ford (MO 42 Bridge) |
| Access point | gasconade | Mt. Sterling Bridge (US 50) |
| Access point | gasconade | Ruby's Landing |
| Access point | gasconade | Whitehouse Ford |
| Access point | niangua | Big John Access |
| Access point | st-francis | Gruner Ford (Hwy H bridge) |
| POI | big-piney | Peck's Last Resort |
| POI | black | Jeff's Canoe Rental |
| POI | buffalo | Buffalo River Outfitters |
| POI | buffalo | Silver Hill Float Service |
| POI | current | Carr's Canoe Rentals |
| POI | current | Jadwin Canoe Rental |
| POI | current | Two Rivers Canoe Rental |
| POI | elk | Big Sugar / Little Sugar confluence |
| POI | elk | Indian Creek confluence |
| POI | james | James River Outfitters |
| POI | kings-river | Eureka Springs Adventures at Wanderoo Lodge |
| POI | kings-river | Float Eureka |
| POI | north-fork-white | Twin Bridges Canoe & Campground |

The remaining campground gaps are Akers Group, Cedar Spring, Dee Murray,
Echo Bluff State Park, Grubb Hollow, Meramec State Park, Montauk State Park,
Onondaga Cave State Park, Red Bluff, Silver Mines, St. Francois State Park,
War Eagle Campground, and Washington State Park. Pulltite is covered by the
reviewed fallback in this change. These are an audit snapshot; future provider
or editorial photos automatically take precedence.

No production database update is required for these read-time additions.
The optional `backfill-reviewed-photos.ts` command can persist the five reviewed
place records after a fresh dry run and separately authorized guarded apply.
