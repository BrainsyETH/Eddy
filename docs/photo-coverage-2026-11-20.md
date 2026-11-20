# Missing-image review, web and iOS — November 20, 2026

A review of every place-photo slot on the website and in the iOS app: slots
with no image, images that fail to load, weak photos, and slots still showing
Eddy artwork. Sources allowed for this pass: Wikimedia Commons, U.S. federal
photography, and Flickr photos under CC BY, CC BY-SA, CC0 or the Public Domain
Mark. Where no reusable photo of the exact place was found, the slot is left
as it was and listed below. Nothing was written to production.

## What was measured

Read-only queries against production and the public API on November 20.

| Surface | Slots | Without a photo before | Without a photo after |
| --- | --- | --- | --- |
| River headers (iOS header, Today, find-a-float) | 28 active rivers | 0 | 0 (Elk and James replaced) |
| Dam headers and onboarding cards | 24 dams | 2 | 1 (Broken Bow) |
| Guide covers (blog, home, iOS guide card) | 28 guides | 0 | 0 |
| Access points, approved, on active rivers | 406 | 94 | 88 |
| Points of interest, active | 31 | 14 | 14 |
| Campgrounds on the camping overview | 36 | 13 (the October 11 list) | 12 |
| Lake launches, approved | 41 | 40 | 38 |
| Guide float cards, in the reviewed content | 71 | 22 with no image | 21 |
| Guide sights, in the reviewed content | 49 | 30 | 27 |

Lodging and outfitter services (143 rows) have no photo slot on either app,
and gauges, embeds and most link previews use Eddy illustration by design.
They were not treated as gaps.

### Broken images

All 440 distinct image URLs served by the river list, access-point, POI,
service and blog APIs were requested. 420 returned an image on the first
request. The other 20 were:

- 14 Wikimedia Commons links, refused with HTTP 429 (rate limiting). All 14
  files still exist, confirmed through the Commons API. On slow retries five
  loaded and nine were refused again after four spaced attempts each.
- 3 images on jeffcomo.gov and 3 on riverhillsretreats.com, which failed with
  connection errors from the review environment. All six loaded on retry.

No link was shown to be dead. Whether visitors hit the Wikimedia limit could
not be established from the review environment, which sent many requests
from one address. The nine that kept failing are worth opening on a phone:
the photos for Enke Road, Hog Trough Road and Hwy CC (Bourbeuse); Grinders
Ferry, Gilbert and Dillards Ferry (Buffalo); Salvation Army Camp (Jacks
Fork); Highway U (Meramec); the Highway 76 bridge (North Fork); Jewett
(St. Francis); and Cotter (White), which hot-links a 5,248 px original. The
72 Commons hot-links remain a reliability risk that local copies would
remove.

## Photos added

Every photo was viewed before use, and its license was read from its own
source page on November 20.

| Place | Where it shows | Photo | Author and license |
| --- | --- | --- | --- |
| Clearwater Dam | Dam page header (web, iOS), onboarding card | Intake tower above Clearwater Lake, October 2012 | U.S. Army Corps of Engineers, Little Rock District; public domain. [DVIDS](https://www.dvidshub.net/image/2143657/clearwater-lake) |
| Elk River | River header | Gravel bar and wooded bluff, June 2008 | Thomas & Dianne Jones; CC BY 2.0. [Flickr](https://www.flickr.com/photos/freewine/2619043871/) |
| James River | River header | Riffle under summer trees | Paulisawoof; public domain. [Commons](https://commons.wikimedia.org/wiki/File:James_River_-_summer.tif) |
| Rim Shoals Access (White) | Access photo | Kayak on the ramp in morning mist, July 2008 | Thomas & Dianne Jones; CC BY 2.0. [Flickr](https://www.flickr.com/photos/freewine/2723908579/) |
| Gaston's Access (White) | Access photo | The river from the resort lawn, July 2009 | Jason Hunter; CC BY 2.0. [Flickr](https://www.flickr.com/photos/coreburn/3718327119/) |
| Echo Bluff State Park (Current) | Access photo | Echo Bluff above Sinking Creek, June 2015 | Missouri State Parks; public domain. [Flickr](https://www.flickr.com/photos/mostateparks/20552668338/) |
| Meramec State Park (Lower Ramp) | Access photo | Bluff reflected in the river, October 2014 | Missouri State Parks; public domain. [Flickr](https://www.flickr.com/photos/mostateparks/16035405342/) |
| St. Francois State Park Access 1 and 2 (Big River) | Access photo | Rafters on the Big River in the park, August 2008 | Missouri State Parks; public domain. [Flickr](https://www.flickr.com/photos/mostateparks/38483191401/) |
| Red Bluff Campground (Huzzah) | Camping overview, campground thumbnail | The rebuilt camping loop, January 2024 | USDA Forest Service; public domain. [Flickr](https://www.flickr.com/photos/usfs_eastern_region/53903842609/) |
| Table Rock State Park Boat Ramp | Lake launch list | State Park Marina beside the ramp, October 2010 | Missouri State Parks; public domain. [Flickr](https://www.flickr.com/photos/mostateparks/34047549820/) |
| Truman State Park | Lake launch list | Anglers off the park shore, October 2015 | Missouri State Parks; public domain. [Flickr](https://www.flickr.com/photos/mostateparks/22344471124/) |
| Turner Mill (Eleven Point guide sight) | Guide | The mill wheel in the spring branch, October 2023 | Roman Watson / USDA Forest Service; public domain. [Flickr](https://www.flickr.com/photos/usfs_eastern_region/53366980236/) |
| Boze Mill Spring (Eleven Point guide sight) | Guide | The spring pool, July 2010 | altonwoods; CC BY 2.0. [Flickr](https://www.flickr.com/photos/myboogers/4813047921/) |
| Ha Ha Tonka Spring (Niangua guide sight) | Guide | The spring below the bluff, July 2009 | mrwynd; CC BY 2.0. [Flickr](https://www.flickr.com/photos/mrwynd/3685186966/) |
| Twin Bridges to Hammond (North Fork guide float card) | Guide | The river at North Fork Recreation Area, the take-out, October 2016 | Chance Dry / USDA Forest Service; public domain. [Flickr](https://www.flickr.com/photos/usfs_eastern_region/30325885295/) |

Five entries show the named site rather than the ramp itself: Gaston's,
Echo Bluff, Meramec State Park, St. Francois State Park and Truman State
Park. Each caption says so, following the existing Cotter (Big Spring Park)
entry. A photo from elsewhere on the same river was never used for a place.

### Where each one lives

- Clearwater Dam: `missouri-float-planner/shared/place-photo-credits.json`
  with `public/lakes/swl-clearwater-dam.jpg`, and
  `eddy-ios/assets/onboarding/` (bundled card, `credits.json`, removed
  from `held.json`). The source photograph is 1280 px wide; the copy is not
  upscaled.
- Elk and James headers: `missouri-float-planner/shared/river-photos.ts`.
  James uses a local copy (`public/images/river-guides/james-river-summer.webp`)
  because the source is a TIFF.
- Access points and Red Bluff: `src/data/reviewed-place-photos.json`,
  applied at read time. An existing or later photo on the record always wins.
- Lake launches: `shared/place-photo-credits.json` with copies in
  `public/lakes/`.
- Guide photos: `scripts/content/river-guides/` with copies in
  `public/images/river-guides/`.

All of these are listed on `/photo-credits` except the river headers, which
show their credit on the header, and the guide photos, which show it under
the image.

## Needs a separate, authorized step

**Guide photos are not live until the guide refresh is applied.** The four
guide photos above are in the reviewed content only. The same is true of most
of the November 10 batch: the reviewed content carried 21 float-card photos
and 19 sight photos before this change, and production holds 6 and 5. For
example the two Lake Taneycomo float-card photos are not on the live guide.
`scripts/refresh-river-guides.ts` previews the difference; `--apply` writes
it and needs `EXPECTED_SUPABASE_REF`.

The access, campground, launch, dam and header photos need no database
write. They appear when the web app is deployed. The Clearwater onboarding
card ships with the next iOS build.

## Still open

**Broken Bow Dam.** Federal photographs found show the spillway, the
re-regulation weir, flooded recreation areas and events at the dam. None
shows the main dam, so it keeps Eddy artwork.

**River headers without a recorded license.** Not changed in this pass:
Courtois, Current, Eleven Point, Meramec, Niangua and Spring River (Arkansas)
carry no credit, and Bourbeuse, Gasconade and North Fork name a source but no
license. The 26 uncredited images in the original seven guides are also
unchanged.

**Places with no reusable photo found.** Searched by name on Flickr and
Openverse, and by coordinates on Wikimedia Commons for the first 47 places
before Commons rate limits stopped that search. Most are small ramps,
bridges and county-road accesses that nobody has photographed under an open
license; the outfitters would need the business's permission.

| Catalog | River or lake | Places |
| --- | --- | --- |
| Access point | big-piney | County Road 5328 Access; Simmons Ford Access; County Road 5117 Bridge; Henry River Access; High Log Eddy; Forest Road 1794 Access |
| Access point | black | Twin Rivers Landing; Mill Creek; Black River Bottoms Access; Mill Spring (Hwy 49) City Park; Hendrickson Boat Launch; Dan River Access; Coon Island Conservation Area; Kody Riggan Datto Boat Ramp; Brookings Boat Ramp; Schaeffer's Eddy Boat Ramp |
| Access point | bourbeuse | Laubinger Ford |
| Access point | buffalo | County Road 79 Access; County Road 252 Access |
| Access point | current | County Road KK-359 Access; Rocky Creek Conservation Area; County Road 126 Access; County Road M-135 Access; The Landing; County Road F-217 Access; Dunrovin; T. L. Wright Memorial Access (Doniphan); Johnston's Eddy Boat Ramp |
| Access point | eleven-point | County Road 405 Bridge; Long Hollow; Dalton Boat Ramp; Eleven Point Boat Ramp |
| Access point | elk | City of Pineville Elk River Access; Kozy Kamp River Access; Trestle Park River Access; Wayside Campground River Access |
| Access point | gasconade | Barlow Ford; Ruby's Landing; Whitehouse Ford; Indian Ford (MO 42 Bridge); Mt. Sterling Bridge (US 50) |
| Access point | huzzah | Highway 8 Bridge (Lower) |
| Access point | jacks-fork | Bee Bluff Access; Circle B Campground & Resort |
| Access point | james | Joe Crighton Access |
| Access point | meramec | Pacific Palisades Conservation Area; Allenton Access; Meramec Landing (Valley Park) |
| Access point | mulberry | Ozark Overland Trail Access; County Road 5440 Access; Indian Creek Access; County Road 88 Access; Big Eddy Canoe Access |
| Access point | niangua | Big John Access |
| Access point | norfork-tailwater | Dam-Quarry Boat Ramp; Norfork Access |
| Access point | st-francis | Gruner Ford (Hwy H bridge) |
| Access point | taneycomo | Shepherd of the Hills Hatchery Boat Ramp; Cooper Creek Access; Branson City Ramp (Branson Lakeside RV Park); Rockaway Beach Access; Empire Park Ramp (Forsyth) |
| Access point | white | Jim Griffin Access; Forrest and Nina Wood Rivercliff Access; Bull Shoals-White River State Park Ramp; Wildcat Shoals Access; Ranchette Access; Buffalo City Access; Cartney Access; Shipp's Ferry Access; Norfork Access; Red's Landing Access; Sneed Creek Access; Chesmond Ferry Access; Calico Rock City Park Access; Boswell Shoals Access; Mount Olive Access; Sylamore Ferry Access; Round Bottom Access; Guion Access (Izard County); Guion Access (Stone County) |
| Access point (not a float endpoint) | buffalo | Shine Eye |
| Access point (not a float endpoint) | norfork-tailwater | Bill Ackerman River Ridge Access |
| Access point (not a float endpoint) | taneycomo | Shepherd of the Hills Hatchery Bank Access; North Beach Park |
| Access point (not a float endpoint) | white | Bronie Yurkonis Walk-In Access (The Narrows); Armstrong Hole Walk-In Access; Roundhouse Shoals Walk-In Access |
| Point of interest | big-piney | Peck's Last Resort |
| Point of interest | black | Jeff's Canoe Rental |
| Point of interest | buffalo | Buffalo River Outfitters; Silver Hill Float Service |
| Point of interest | current | Carr's Canoe Rentals; Two Rivers Canoe Rental; Jadwin Canoe Rental |
| Point of interest | elk | Big Sugar / Little Sugar confluence; Indian Creek confluence |
| Point of interest | jacks-fork | Ebb and Flow Spring |
| Point of interest | james | James River Outfitters |
| Point of interest | kings-river | Eureka Springs Adventures at Wanderoo Lodge; Float Eureka |
| Point of interest | north-fork-white | Twin Bridges Canoe & Campground |
| Campground |  | Akers Group Campground; Cedar Spring Campground; Dee Murray Campground; Grubb Hollow Campground; Echo Bluff State Park campground; Meramec State Park campground; Montauk State Park campground; Onondaga Cave State Park campground; Silver Mines Campground; St. Francois State Park campground; War Eagle Campground; Washington State Park campground |
| Lake launch | table-rock | Cow Creek Boat Ramp; Cricket Creek Boat Ramp; Holiday Island Boat Ramp; Romp Hole Boat Ramp |
| Lake launch | truman | Talley Bend (high water ramp); Avery; Berry Bend; Brush Creek; Bucksaw Marina; City of Osceola; County Line; Crowes Crossing; Deepwater; Fairfield; Finey; Fox Run; Higgins Landing; Knisely; Lays Valley View; Long Shoal; Long Shoal Marina; Macks Camp; Mockingbird Hill; Old Timers; Osage Bluff; Pom-O-Sa; Shawnee Bend; South French Bridge; Sparrowfoot; Sterett Creek Marina; Talley Bend; Thibaut Point; Tightwad; Truman Reservoir Management Lands (Cross Timbers); Truman State Park Marina; TT Highway; Walnut Grove; Windsor Crossing |

Campground photos must show the campground: park scenery, caves and maps
were found for several state parks and not used.

## Checks

- `make check` on Node 20: web typecheck, lint and all 5,912 registered tests
  passed; iOS typecheck and lint passed with warnings only; the iOS production
  bundle exported and the `.easignore` archive check passed.
- Local dev server, no database credentials: `/photo-credits` showed the new
  entries at 390 px and 1280 px with no horizontal overflow, the Clearwater
  Dam page showed the new header, and each new local image copy loaded.
- Every hot-linked photo added here returned an image.

Unconfirmed: the access, campground and launch photos on their live pages
(they need production data and a deploy), the iOS onboarding card and dam
header on a device, and the guide photos until the guide refresh is applied.
