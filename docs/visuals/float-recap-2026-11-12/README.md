# Float recap presentation review — November 12, 2026

These are browser-rendered layout previews of the actual `FloatRecap`,
`FloatRecapMap` SVG fallback, `FloatInfoTip`, `FloatShareButton`, weather artwork,
and Eddy assets/fonts, using React Native Web with fixture archive data.
They are **not native iOS screenshots**. Route geometry is synthetic fixture
geometry, including in the Huzzah example; it is not that river's map or a GPS
recording. Native Mapbox, OS glyphs, safe-area/navigation chrome, archive services
and the system share sheet are substituted. The map's native basemap wash and
collision-aware labels therefore still require an iPhone check.

| Preview | Viewport | Purpose |
| --- | --- | --- |
| [Huzzah layout](huzzah-layout.png) | 393 × 852 | Short float, confirmed arrival, partial tracking; main route/time card and Share placement |
| [Complete, light](complete-light.png) | 393 × 852 | Full recap with water and weather rows |
| [Complete, dark](complete-dark.png) | 393 × 852 | Theme roles, card separation and supporting text |
| [Large text](large-text.png) | 320 × 852, simulated 1.8× text | Long river/access/gauge names, stacked statistics and wrapping readings |

The browser check exercised 16 cases: short float, complete, dark, unconfirmed
arrival, narrow long names, larger text, untracked, missing conditions,
weather-only, stale conditions, legacy snapshot, missing map, loading map,
unavailable recap, loading recap and backup failure. No page errors or horizontal
page overflow were reported; all visible buttons measured at least 44 × 44 CSS px.
The route/time/conditions information actions, Share busy state, History action,
backup retry and delete confirmation were exercised against stubs, without
sending shares or deleting data.

Layout changes only: tracker calculations, route coverage/progress, arrival,
time classification, condition/weather eligibility, archive and share-image
behavior are unchanged. The moving/breaks section is grouped beneath the main
statistics; its existing info action is beside moving speed (or the time label
when speed is unavailable).

Native verification remains unconfirmed: Finish and History entry points,
Mapbox overlay ordering/labels/attribution, VoiceOver, true Dynamic Type,
system share sheet and content clearance above the native tab bar. The existing
automatic content-inset behavior remains enabled, with 48 pt of footer spacing.
