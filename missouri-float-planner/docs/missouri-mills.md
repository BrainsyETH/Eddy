# Missouri mills collection

The default `/embed/display` is a ten-scene illustrated tour. `?theme=river`
keeps the original River Window. This is the web display, not a native Roku
channel. The Roku prompt supplied during design was a visual/motion reference.

## Interaction and data

Each scene lasts 80 seconds at 30 fps. The camera travels left at 24 scene
pixels/second. Each 1920 × 1080 panel and its live HTML sign share one transform.
A separate, alpha-transparent foreground tree grove covers joins between
places; scenes recycle offscreen without mirroring. Two panels are mounted,
and the following panel is decoded ahead. The artwork is a stylized reference
illustration, not a survey or a representation of current water levels.

Mills opens a keyboard-accessible picker; choosing a mill seeks to its full
view. Next mill advances one scene. Readings and Mills pause motion while open.
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

`public/display/mills/` holds ten local WebPs and the alpha foreground grove.
Generated with the built-in image-generation tool. The approved Dillard concept
was the style reference for the remaining seven images. Conversion to WebP is
encoding only. No text or live values are baked into the artwork.

`src/lib/display/mill-scenes.ts` owns the scene manifest, painted sign rectangles,
water-only masks, river associations, filtering and loop geometry. Inspect each
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
spillway. Grove prompt: dense vertical oak/cedar trunks and foliage, opaque
center from top to bottom, irregular transparent outer edges.

## Validation

Run `make check-web` and `node scripts/check-river-window.mjs`. The browser
script intercepts data with fixtures and captures all ten signs, the mobile
reader, and checks the classic theme, filters, missing API, motion and picker.
Screenshots from that script contain fixture readings, not live conditions.

Physical TV performance, overnight operation and native Roku behavior are
unconfirmed. Browser checks do not establish hardware verification or release.
