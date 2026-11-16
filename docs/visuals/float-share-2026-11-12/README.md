# Float share previews — November 12, 2026

Illustrative data rendered from the implementation in this PR. These are not
recorded user trips or proof of a released build. The share uses a photo-free
postcard composition with an oversized title, a decorative water shape, Eddy
overlapping the curve and open stats. The curve is not a route map.

- `complete.png`: server PNG, reached take-out and verified starting condition.
- `partial.png`: server PNG, unconfirmed arrival and limited GPS tracking.
- `untracked.png`: server PNG, no credited distance or condition.
- `long-names.png`: server PNG, wrapping place names, high water, maximum allowed
  duration and flow (deliberately extreme layout fixtures, not actual readings).
- `short-float.png`: server PNG, on-water start, under a minute, under 0.1 mi.
- `offline.png`, `offline-long.png`, `offline-untracked.png`: actual local export
  component SVG primitives, rendered by headless Chromium with the app's bundled
  fonts and otter. Effects/native file export were stubbed. This verifies layout,
  not iOS rasterization, native font loading, or share-sheet delivery.
- `layout-check.json`: offline text bounding boxes checked against each element's
  allotted width and the canvas safe area; no overflow in the three fixtures.

Both renderers consume `shared/float-share-layout.ts`. The server keeps its
existing credited-mile/mood/verified-condition inputs; the local renderer keeps
its saved-distance/arrival/tracking inputs and standard otter. No route geometry,
weather, new measurements or tracker behavior are added to the export.

Native device verification remains: share a newly completed and historical float,
force an offline fallback, confirm names/fonts/status fit, then deliver through
Messages, AirDrop and Save Image. Older cached server posters should be rebuilt.
