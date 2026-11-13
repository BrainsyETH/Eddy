# River scenery selections — November 13, 2026

The shared `RIVER_PHOTOS` catalog is an explicit editorial selection, not a
runtime first-access fallback. Before this review, 17 of its 24 entries matched
the first photographed approved access point in river-mile order. Several were
roads, ramps or bridges rather than river scenery.

This review compared 325 photo entries from 312 approved access points across
27 active rivers, plus the existing 24 header entries. There were 289 distinct
URLs; 288 could be viewed. The one unavailable URL was the old Kings River
canoe image, repeated at three accesses and in the header. Commons images that
initially returned 429 were retrieved through their file metadata. Taneycomo
had no access-point photos. Existing, credited guide photography was also
compared for rivers without a suitable access photo.

Selections favor identifiable river scenery, visible water, distinctive bluffs
or springs, and a useful wide crop. They do not follow access order, rotate,
or depend on Favorites. These are location photographs, not current conditions
or a promise that the pictured waterfall lies on a selected float route.

## Selected scenes

The **scene** column names what the photograph actually shows. Some existing
access records reuse a photograph taken elsewhere on the same river; their
attachment is not evidence of the photographed location.

| River | Selected scene | Decision | Reason |
| --- | --- | --- | --- |
| Big Piney | Devils Elbow bluff and river reflection | Replace Baptist Camp | Clear water and a limestone bluff; strong landscape composition. The existing photo is attached to Warren Bridge and other accesses, but its source identifies Devils Elbow. |
| Big River | Cedar Hill mill and dam | Keep | The current photograph is clearer in a wide crop than the narrow county-site alternatives. |
| Black | Johnson's Shut-Ins in autumn | Replace Lesterville | Distinctive rocks, water and fall color. East Fork scenery, not Hilliard Access despite that catalog attachment. |
| Bourbeuse | Mill Rock | Replace Mint Spring | Bluff and flowing water instead of a ramp foreground. |
| Bryant Creek | Waterfall at Bryant Creek State Park | Keep | A distinctive creek landscape that survives the wide crop. Not a claim that the fall is at Monastery Bridge. |
| Buffalo | Autumn river bend viewed from above | Replace Misty Bluff | The river's curve and wooded valley remain visible in the header. Source: Doug Wertman's Buffalo National River photograph; not labeled South Maumee based on its access attachment. |
| Caddo | Caddo River at Norman | Keep | Calm water, gravel bank and forest. The location of the more dramatic chamber-of-commerce rock photo was not established. |
| Courtois | Canoes beside the creek | Keep | Bright, recognizable floating scenery with a useful landscape crop. |
| Crooked Creek | Crooked Creek at Highway 14 in Yellville | Replace Pyatt bridge | Water and wooded banks take priority over bridge infrastructure. Source identifies Highway 14, not Snow Access. |
| Current | Montauk waterfall | Keep | Explicit user selection; the exact existing URL is retained. |
| Eleven Point | Boze Mill Spring | Replace Thomasville bridge | Clear turquoise water and reflections instead of a winter concrete bridge. |
| Elk | Mount Shira | Add | Best of the two available access photos; a modern river view. A sharper, more distinctive photograph is still desirable. |
| Gasconade | Sunset from the Gasconade Hills Resort catalog photo | Replace Camp Branch | Warm sky and river reflections. Its portrait original retains the horizon in the wide center crop. |
| Huzzah | Dillard Mill and waterfall, summer view | Replace muted Dillard Mill aerial | Brighter color and a clearer landmark. The source identifies Dillard Mill, not the Highway V access record that contains it. |
| Jacks Fork | Blue Spring across the river | Replace generic rocky-water header | Clear shallows, autumn trees and bluff; the river's character is immediately visible. |
| James | James River near Springfield | Keep | The five access photos show roads or parking areas. A stronger summer river photograph is a remaining opportunity. |
| Kings | Kings River Falls | Replace unavailable canoe photo | Waterfall, rock shelf and green pool read clearly at phone width. This is an upstream scenic landmark, not a claim about Marble Access. |
| Meramec | Onondaga bluff and river reflection | Keep | One of the strongest existing photographs. |
| Mulberry | Flowing river above Yale | Keep | Clear water movement and green banks; retained source and attribution. |
| Niangua | Bennett Spring stone bridge | Keep | Recognizable landmark with water and reflections. |
| Norfork Tailwater | River below Norfork Dam | Add existing guide photo | The access alternatives show the park entrance or fishing on Dry Run Creek. This reviewed photo shows the tailwater itself. |
| North Fork | Hebron river bend and gravel bar | Replace Highway 76 bridge | Water, wooded hills and autumn color rather than concrete infrastructure. |
| Spring River, Arkansas | Mammoth Spring waterfall | Keep | Strong, wide composition with the waterfall and historic structure. |
| Spring River, Missouri | Spring River at La Russell | Keep | The alternative open-water photograph is from Baxter Springs, Kansas; the Missouri scene remains the more accurate choice. |
| St. Francis | Silver Mines river and boulders | Replace dam close-up | A broader summer river landscape, with the river visible between the rocks. |
| Taneycomo | Morning fog over the lake | Add existing guide photo | A calm, recognizable tailwater scene; there were no access photos to choose from. |
| War Eagle | Creek at Withrow Springs State Park | Keep; add verified credit | Identifiable creek scenery. The dramatic third-party bluff image lacks a verified scene identity. |
| White | Anglers drifting below Bull Shoals Dam | Add existing guide photo | Existing, credited river photography. The two access images are a truck at a ramp and the small spring beside Cotter access. |

Result: **12 replacements, 12 retained selections and 4 additions**. The catalog
now covers all 28 active rivers. Elk and James have usable choices but would
benefit most from better photography.

## Sources and attribution

Exact selected image URLs live in
[`shared/river-photos.ts`](../missouri-float-planner/shared/river-photos.ts).
Their matching source links and credits live alongside them in
`RIVER_PHOTO_CREDITS`. Existing Montauk, Boze Mill, Onondaga and Bennett Spring
uploads retain their catalog provenance; this review does not invent an author
for images whose records have no attribution.

Newly selected openly licensed images were checked against the exact file's
metadata, not a neighboring image or a hosting site's general terms:

| Scene | Credit and license | Source |
| --- | --- | --- |
| Devils Elbow | Richard Ricciardi · CC BY 2.0 | [Flickr photo](https://www.flickr.com/photos/ricricciardi/50113156763/) |
| Johnson's Shut-Ins | Kbh3rd · CC BY 3.0 | [Commons file](https://commons.wikimedia.org/wiki/File:Johnsons_Shutins_autumn_panorama-panini_20130126.jpg) |
| Buffalo autumn bend | Doug Wertman · CC BY 2.0 | [Commons file](https://commons.wikimedia.org/wiki/File:Overlooking_The_Buffalo_River.jpg) |
| Crooked Creek at Highway 14 | Brandonrush · CC BY-SA 4.0 | [Commons file](https://commons.wikimedia.org/wiki/File:Yellville,_AR_022.jpg) |
| Dillard Mill | Kbh3rd · CC BY-SA 3.0 | [Commons file](https://commons.wikimedia.org/wiki/File:Dillard_Mill_SHS_20090726_02.jpg) |
| Blue Spring, Jacks Fork | NPS / Jessica Poppa · Public domain | [NPS page](https://www.nps.gov/ozar/planyourvisit/blue-spring-campground.htm), already recorded in `reviewed-place-photos.json` |
| Kings River Falls | Brandonrush · CC BY-SA 3.0 | [Commons file](https://commons.wikimedia.org/wiki/File:Kings_River_Falls_002.jpg) |
| Silver Mines | Kbh3rd · CC BY 2.5 | [Commons file](https://commons.wikimedia.org/wiki/File:St._Francis_River_at_Silver_Mines_Recreation_Area_1.jpg) |
| Norfork Tailwater | Brandonrush · CC0 | [Commons file](https://commons.wikimedia.org/wiki/File:North_Fork_White_River_downstream_from_Norfork_Dam.jpg), existing guide photo and credit |
| Taneycomo fog | Luke Wisley · CC BY 2.0 | [Commons file](https://commons.wikimedia.org/wiki/File:Taneycomo_fog.jpg), existing guide photo and credit |
| White below Bull Shoals | Brett Billings / USFWS · Public domain | [Commons file](https://commons.wikimedia.org/wiki/File:Group_fishing_in_boat_near_Bull_Shoals_Dam_on_White_River.jpg), existing guide photo and credit |

Mill Rock, Hebron and Mount Shira reuse their existing MDC-hosted access images;
the Gasconade sunset reuses its existing resort-hosted access image. Their
credit names the source, without claiming a public-domain or Creative Commons
license. Existing unresolved catalog-rights gaps remain documented in
[the coverage history](river-photo-coverage.md).

The three guide fallbacks use already published Eddy-hosted WebP copies. Their
production image URLs returned HTTP 200 with image content. No access-point
records, guide selections or database rows were changed.

## Validation and delivery

The review included the available original images and representative 393 × 236
center crops with a title overlay. This checks composition, not native-device
rendering; the iOS component and layout are unchanged. Device verification of
the updated selection remains unconfirmed.

The registry is shared by the river API and the iOS fallback. After this change
is deployed in the API, refreshed river responses supply the new images to the
existing header implementation. An older cached API `photoUrl` still takes
precedence over the bundled fallback until that response refreshes. There is
no database migration or app-layout dependency.
