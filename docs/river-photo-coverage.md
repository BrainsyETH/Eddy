# River photography for Today

The 24 active rivers were checked against their published Eddy river pages on 2026-09-16. Twenty already had river-specific imagery. The new registry exposes those existing images directly to Today rather than relying on whichever routes happen to appear in Favorites. It adds four openly licensed images for the uncovered rivers:

- big-river: Marcusscotus1 · Public domain — https://commons.wikimedia.org/wiki/File:Cedar_Hill_Dam_on_Big_River_in_Missouri.JPG
- bryant-creek: Missouri State Parks · Public domain — https://commons.wikimedia.org/wiki/File:BryantCreek_02.jpg
- james: Cold417 · CC BY-SA 3.0 — https://commons.wikimedia.org/wiki/File:James_River_in_Springfield_Missouri_USA.jpg
- spring-river-mo: Traveler7 · Public domain — https://commons.wikimedia.org/wiki/File:Spring_River%2C_La_Russell_Mo.JPG

James River is used under CC BY-SA 3.0 (https://creativecommons.org/licenses/by-sa/3.0/). The source photo is unchanged; the card crops its display and overlays text. Credit and source/license links are exposed on the cards. Public-domain status for the other three is documented on each linked file page.

The registry uses hosted image URLs. Network failures can still prevent a photo loading; every active river has a source, but images are editorial scenery rather than live-condition evidence. Original image downloads were blocked in the development environment; visual inspection of all new photo crops on device remains required.

## Original river guide seed review — October 2026

This table records the original seed payload. The read-time guide-photo registry
now supplies 12 credited local covers on the blog and guide cards, preserving
editor overrides. It also replaces the historical St. Francis dam hero. See
[the October 11 audit](photo-coverage-2026-10-11.md) for the current behavior and
remaining gaps; the source seed payload and route-photo opt-out are unchanged.

The October 11 guide batch does not assume that an image already used elsewhere
in Eddy can be reused on every new surface. Credits below are stored with each
article's exact hero URL in `guide_data.hero.photo_credit`; changing that URL
without updating its credit suppresses the old attribution. These are scenery,
not photographs of current conditions or necessarily of a featured route.

| River | Article hero | Rights evidence |
| --- | --- | --- |
| Big River | Eddy canoe artwork | Cedar Hill Dam has documented public-domain rights, but sits well below the featured routes. Excluded from the article and its cards because it misrepresents this guide’s setting. |
| Bryant Creek | Existing creek photo | Missouri State Parks; public domain, per the September 16 file-specific review above; fresh page retrieval was unavailable |
| James | Existing James River photo | Cold417; CC BY-SA 3.0, per the September 16 file-specific review above; fresh page retrieval was unavailable |
| Spring River MO | Existing La Russell photo | Traveler7; public-domain release on [file page](https://commons.wikimedia.org/wiki/File:Spring_River,_La_Russell_Mo.JPG), rechecked October 11 |
| Buffalo | Misty Bluff photo | Thomas & Dianne Jones; [CC BY 2.0 file page](https://commons.wikimedia.org/wiki/File:Misty_Bluff_along_the_Buffalo_River.jpg), checked October 11 |
| Caddo | Norman river photo | Brandonrush; [CC0 1.0 file page](https://commons.wikimedia.org/wiki/File:Norman,_AR_002.jpg), checked October 11 |
| St. Francis | Existing river photo | Formattc; [CC BY-SA 3.0 file page](https://commons.wikimedia.org/wiki/File:Saint_Francis_River,_USA_04-09.jpg), checked October 11 |
| Mulberry | Forest Service photo above Yale | Tim Palmer / USDA Forest Service; [Flickr photo page](https://www.flickr.com/photo.gne?id=25631401007) identifies the photograph and Public Domain Mark, checked October 11 |
| Big Piney, Black, Bourbeuse, Crooked Creek, Gasconade, Kings, North Fork, Spring River AR, War Eagle | Eddy canoe artwork | Reuse permission for the catalog image was not established. State-agency/tourism hosting is not a license; the North Fork and War Eagle file pages could not be verified. Those images are not included in the new guides. |
| Elk | Eddy canoe artwork | No reviewed river scenery selected |

Article captions link the author/source and license and disclose display
cropping. Buffalo, James, and St. Francis use Eddy artwork for the uncaptioned
blog-index and iOS cards, avoiding a separate uncited CC BY/SA use. Public-domain
photos can be used on those cards. All 18 social-share images use Eddy artwork.
Route cards in this batch opt out of the automatic access-photo fallback;
separately reviewed scene photos can be added later. This review does not grant
new rights to unrelated uses of the older river-photo catalog.

## Main images for the last four guides — November 10, 2026

The White, Lake Taneycomo, Norfork Tailwater and Elk guides used the Eddy
illustration. Each now has a credited main image, registered in
`missouri-float-planner/src/data/guide-photos.json` and resolved at read time
like the earlier twelve. Licenses were read from each Wikimedia Commons file
page's metadata on November 10, 2026.

| Guide | Image | Author and license |
| --- | --- | --- |
| White River | Anglers drifting below Bull Shoals Dam, September 2017 | Brett Billings / U.S. Fish and Wildlife Service; public domain. [File page](https://commons.wikimedia.org/wiki/File:Group_fishing_in_boat_near_Bull_Shoals_Dam_on_White_River.jpg) |
| Lake Taneycomo | Morning fog on the lake, May 2007 | Luke Wisley; CC BY 2.0. [File page](https://commons.wikimedia.org/wiki/File:Taneycomo_fog.jpg) |
| Norfork Tailwater | Norfork Dam with the tailwater in the foreground | Brandonrush; CC0. [File page](https://commons.wikimedia.org/wiki/File:Norfork_Dam_and_Norfork_River.jpg) |
| Elk River | Linen postcard of the bridge near Noel, about 1930 to 1945 | Ozark Postcard Publishers; public domain. [File page](https://commons.wikimedia.org/wiki/File:Bridge_over_beautiful_Elk_River_near_Noel,_Mo.,_alongside_U.S._Highway_71_(78310).jpg) |

The Elk image is historical, and its caption says so: no reusable modern
photograph of the Elk was found. Replace it when one is. The copies are 1280
pixels wide because the image host throttled larger downloads.

Still open: the original seven guides carry 26 images captured from other
websites with no credit recorded (five main images, twenty float-card photos,
and a main image loaded directly from nps.gov). They need licensed
replacements.

## Float-card and sight photos — November 10, 2026

Thirty-three credited photos were added to float cards and sights across the guides, each stored with its author, source page and license in the guide content (`photo_detail` on a float, `photo` on a sight) and shown under the image. A float card gets a photo taken on that stretch or of its put-in or take-out; a sight gets a photo of that sight. Every photo was looked at before use, and two candidates were dropped (a Maramec Spring image that did not show the spring and a Ha Ha Tonka image too dark to read).

Sources: Wikimedia Commons (public domain or Creative Commons, license read from each file page), and four federal photographs already reviewed in `src/data/reviewed-place-photos.json` (Jam Up Cave, Blue Spring on the Jacks Fork, Dam-Quarry, Big Spring Park at Cotter).

State after this change: 21 of 71 float cards have a credited photo, 28 show an image added by hand or an access-point photo (out of scope here), and 22 have none. 19 of 49 sights have a photo.

No located, reusable photograph was found for the following. A generic river photo was not substituted.

| Guide | Float card with no photo |
| --- | --- |
| Big Piney River | Mason Bridge Access → Slabtown Recreation Area |
| Big Piney River | East Gate Access → Crossroads Access |
| Big River | Washington State Park Access → Mammoth Access |
| Big River | Mammoth Access → Merrill Horse Access |
| Big River | Merrill Horse Access → Brown's Ford Access |
| Black River | Markham Springs Recreation Area → Hammer Access (Bradley A. Hammer Memorial CA) |
| Bourbeuse River | Mill Rock MDC Access → Wenkel Ford MDC Access |
| Bourbeuse River | Mayers Landing MDC Access → Union MDC Access |
| Bryant Creek | Sycamore Access → Warren Bridge Access |
| Bryant Creek | Warren Bridge Access → Florence C. Cook Access |
| Caddo River | Swinging Bridge Access (Caddo Gap) → Glenwood Access (City Park Boat Ramp) |
| Caddo River | Glenwood Access (City Park Boat Ramp) → Hwy 182 Amity Boat Ramp |
| Crooked Creek | Snow Access → Mark Oliver Access |
| Gasconade River | Buzzard Bluff Access → Wilbur Allen Memorial Conservation Area |
| Gasconade River | Rollins Ferry Access → Pointers Creek Access |
| James River | Delaware Town Access → Shelvin Rock Access |
| James River | Shelvin Rock Access → Hootentown Access |
| Kings River | Rockhouse Access → Trigger Gap Landing |
| Mulberry River | Wolf Pen Recreation Area → High Bank Recreation Area |
| North Fork River | Highway 14 bridge (Twin Bridges) over North Fork → North Fork Recreation Area (Hammond) |
| North Fork River | Blair Bridge Access → Patrick Bridge Access |
| St. Francis River | Roselle Access → Millstream Gardens Fisherman's Access |

| Guide | Sight with no photo |
| --- | --- |
| Black River | Markham Springs |
| Buffalo National River | Tyler Bend trails |
| Courtois Creek | Upper Courtois bluffs |
| Courtois Creek | Bass River gravel bars |
| Courtois Creek | Courtois–Huzzah confluence (Scotia) |
| Crooked Creek | Fred Berry Crooked Creek Nature Center |
| Current River | Medlock Cave & Spring |
| Current River | Welch Spring & Hospital |
| Current River | Cave Spring |
| Current River | Pulltite Spring |
| Eleven Point River | Turner Mill (Turner Spring) |
| Eleven Point River | Boze Mill Spring |
| Elk River | Pineville city access |
| Elk River | Mount Shira Access |
| Elk River | Cowskin Access |
| Huzzah Creek | Red Bluff |
| Huzzah Creek | Huzzah Conservation Area |
| Jacks Fork River | Ebb and Flow Spring |
| Meramec River | Green's Cave |
| Meramec River | Fisher Cave |
| Niangua River | Berry Bluff |
| Niangua River | Ha Ha Tonka Spring & Castle |
| Norfork Tailwater | Bill Ackerman River Ridge Access |
| North Fork River | Blue Spring Trail at North Fork Recreation Area |
| Spring River (Missouri) | La Russell Access |
| St. Francis River | Tiemann Shut-Ins overlook |
| Lake Taneycomo | Shepherd of the Hills Fish Hatchery |
| Lake Taneycomo | Rockaway Beach |
| Lake Taneycomo | Empire Park, Forsyth |
| White River | The Narrows |

## iOS river detail headers — November 13, 2026

The iOS river detail header reuses this catalog (Current: the existing Montauk
waterfall access photo). No new images are acquired. The existing October
file-specific credits for Buffalo, Caddo, Mulberry and St. Francis are now
carried in `RIVER_PHOTO_CREDITS` as well as the guide data, so their header
credits are visible and linked. Headers disclose cropping. Failed or absent
photos leave a plain title. Other catalog selections are unchanged.
