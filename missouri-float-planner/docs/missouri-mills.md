# Missouri mills collection

The default `/embed/display` is a ten-scene illustrated tour. `?theme=river`
keeps the original River Window. This is the web display, not a native Roku
channel. The Roku prompt supplied during design was a visual/motion reference.

## Interaction and data

Each scene lasts 80 seconds at 30 fps: 73 seconds of the whole painting, then
a seven-second journey to the next mill. Each 1920 × 1080 painting and its live
HTML sign share one transform. Only one painting is mounted; the next is
decoded ahead. The artwork is a stylized reference illustration, not a survey
or a representation of current water levels.

**Formats.** Landscape screens get the full painting with a slow push toward
the live board, which therefore never leaves the frame. Portrait walls (a TV
or kiosk mounted on end, a phone held upright: any viewport at or taller than
4:5) get the vertical format, a 1080 × 1920 composition: the painting fills the
top window, opens centred on its mill (`focus` in the manifest) and drifts to
its board, which there carries only the mill's name. Below it a dock, tinted
from the painting's own foreground colour, holds the reading at room
distance, plus the distance to the next mill. `?format=vertical` or
`?format=landscape` overrides the automatic choice.

**Taller than 9:16.** An ultrawide monitor on end or a phone is taller than
the 1080 × 1920 composition; instead of letterbox bands the composition
stretches to the screen's shape (up to 1:3, in 8px steps). With at least 300
extra pixels, a tour band below the dock shows the whole tour on the map,
cropped to the mills: legs travelled, the leg to the next mill filling in as
the scene plays, and the stops in order (Now / Next), or just Now and Next
when there is no room for the list. The band tops out at 900 pixels; any
further height, or extra too small for the band, goes to the painting window.
The journey between mills covers the whole stage and stays centred. The classic River Window
(`?theme=river`) remains landscape only.

**Between mills.** There is no foreground prop covering a seam. The painting
dims into a veil tinted from both scenes, and a route map draws the leg from
this mill to the next over the six rivers the collection reports (Missouri /
Arkansas line for orientation), with the next mill's name, distance, heading
and its river's live reading. The next painting is swapped in only under the
opaque veil, then opens out of its own dot on the map as an iris until it
fills the screen. Every join is therefore different: its own leg, rivers,
reading and opening point. Nothing is mirrored, crossfaded or seamed. A
browser without `clip-path: path()` gets a short fade instead of the iris.
With a single selected mill, the card reads "Once more at" without a route.

Mills opens a keyboard-accessible picker; choosing a mill seeks to its full
view (frame 0 of every pass is the painting, never the veil). Next mill
advances from the mill on screen, including mid-journey. Readings and Mills pause motion while open.
Play/Pause, reduced motion, hidden-tab pause and full screen retain the existing
behavior. Overlays drift gently over ten minutes (disabled by reduced motion).
On small screens the Readings table is the accessible alternative.

`?rivers=huzzah,jacks-fork` filters scenes by their fixed river associations.
With no filter, all ten scenes and their six distinct river reports are used.
Unsupported selections show an explicit empty state, never a substituted river.
A missing river does not remove its scene or borrow another river's reading.

The existing `/api/rivers` and `toWindowSign` remain authoritative. Five-minute
refresh, 15-second timeout, one retry, last-success retention, 30-second local
aging, rated units, and stale/unknown suppression are unchanged. The data sign
always names its river. Related river / Nearby river distinguishes a broader
river report from a measurement of the pictured spring branch. No demo data
is used at runtime. High/dangerous reports retain the persistent warning strip.

## Scene associations and reference sources

| Scene | Setting | Eddy report | Reference page |
| --- | --- | --- | --- |
| Dillard | Huzzah Creek, Dillard | huzzah | https://mostateparks.com/page/dillard-mill-state-historic-site/general-information-dillard-mill |
| Alley | Alley Spring, ONSR | jacks-fork (related river) | https://www.nps.gov/places/alley-spring-and-mill.htm |
| Klepzig | Rocky Creek, ONSR | current (related river) | https://www.nps.gov/places/klepzig-mill.htm |
| Montauk | Montauk State Park, near Salem | current (related river) | https://mostateparks.com/park/montauk-state-park/montauk-mill |
| Falling Spring | Mark Twain NF, near Winona | eleven-point (nearby river, not a local spring measurement) | https://www.explorewestplains.com/falling-spring-mill/ |
| Greer | Wooded ridge above Greer Spring, near Alton | eleven-point (related river) | https://www.explorewestplains.com/greer-mill/ |
| Turner | Surviving wheel/site, Turner Spring | eleven-point (related river) | https://www.exploretheozarksonline.com/activities/parksnature/wildscenicrivers/elevenpoint/turnermillnorth.html |
| Hodgson | Sycamore, Ozark County | bryant-creek (related river) | https://gregdisch.com/2019/07/05/hodgson-water-mill/ |
| Dawt | Near Tecumseh, North Fork | north-fork-white | https://www.explorewestplains.com/dawt-mill/ |
| Rockbridge | Spring Creek, Rockbridge | bryant-creek (related river) | https://www.explorewestplains.com/rockbridge-mill/ |

Reference photographs were used to guide architecture and terrain. They are not
bundled or hotlinked in the app. Third-party reference-photo reuse rights were
not established; the references must not be added as production photo assets.
The generated interpretations are not certified architectural reproductions.
Greer and Montauk have dry foregrounds; Turner depicts the wheel/site, not an
invented surviving mill building. Wheels are not animated as operating machinery.

## Artwork and maintenance

`public/display/mills/` holds the ten local WebPs. (The repeated tree grove that
used to cover joins was removed with the route transition.)
Generated with the built-in image-generation tool. The approved Dillard concept
was the style reference for the remaining seven images. Conversion to WebP is
encoding only. No text or live values are baked into the artwork.

`src/lib/display/mill-scenes.ts` owns the scene manifest, painted sign rectangles,
water-only masks, river associations, filtering, the pass timeline
(`millMoment`), cameras and formats. Each scene's `focus` is the mill's
horizontal centre in the painting; `tone` is the painting's bottom-strip average
darkened (HSL lightness 0.13, saturation ≤ 0.45); `at` is an approximate site
for the route map only, not a navigation point. Re-check all three after any
art change. `mill-map.ts` projects the map; `mill-map-data.ts` is generated by
`node scripts/generate-mill-map.mjs` (read-only GETs of the public river API),
so the display never fetches geometry at runtime. Inspect each
sign at 1920 × 1080 after any art or typography change. Only explicitly masked
water regions shimmer; buildings, dry ground and signs must not move with water.
`MillWindowScene.tsx` draws the collection; `RiverWindow.tsx` owns live data and
controls. The classic scene and shared condition system remain separate.

Generation direction: detailed matte 2D illustrated realism; natural Ozark
colors, crisp contours, fine botanical and architectural detail, soft afternoon
light, distinct depth planes. Preserve each reference building's shape and
setting. No glossy 3D, bloom, fantasy architecture, text or fabricated readings.
Leave a blank dark timber sign in the lower right for HTML data.

Subject prompts: Dillard's red shallow-roof facade above the Huzzah cascade;
Alley's red clapboard mill beside the broad spring pool; Klepzig's small gray
mill above rhyolite shut-ins; Montauk's dark timber mill and raised central
gable in park grounds; Falling Spring's small mill, wheel, bluff waterfall and
pond; Greer's brown mill/cupola on a dry wooded ridge; Turner's surviving iron
wheel in a woodland spring branch; Hodgson's red mill, walkway and spring
spillway; Dawt's gray mill, porch and wheel above the North Fork without the
removed historic dam; Rockbridge's red mill, piers, porch and Spring Creek
spillway.

## Validation

Run `make check-web` and `node scripts/check-river-window.mjs`. The browser
script intercepts data with fixtures and captures all ten signs in both
formats (landscape boards; vertical docks and placards, each checked to fit;
the tall-screen tour band and the stage filling a 1080 × 2560 screen),
the mobile reader, automatic and forced format selection, and checks the
classic theme, filters, missing API, motion and picker. It does not wait out a
full pass, so the between-mills journey is covered by the unit tests
(`mill-scenes.test.ts`: the swap happens only under a full veil) rather than a
capture.
Screenshots from that script contain fixture readings, not live conditions.

Physical TV performance, overnight operation and native Roku behavior are
unconfirmed. Browser checks do not establish hardware verification or release.
