# Eddy iOS App Store screenshot set

Target: iPhone 6.9-inch portrait, 1320 × 2868 px, PNG, no alpha.

The approved Field Notebook frame is the common visual system for every image:
warm sand stock, faint contour lines, dark ink border and hard shadow, coral
headline, teal mono eyebrow, Eddy lockup, and one real iOS app screenshot.
Feature-specific Eddy artwork changes across the set: river discovery, map,
route planning, gauge checking, access, and alerts each use a relevant mark.

## Capture sequence

1. **Find floatable water**
   - Native state: Search tab with current river conditions.
   - Supporting copy: Know what’s running well before you make the drive.
   - Purpose: answer the primary “what can I float today?” question immediately.

2. **See the whole river**
   - Native state: Map tab focused on the Current River and its access points.
   - Supporting copy: Live conditions, access points, and the route between them.
   - Purpose: show geographic context and the full river corridor.

3. **Plan put-in to take-out**
   - Native state: completed Current River plan from Cedar Grove to Akers Ferry.
   - Supporting copy: Compare access points, distance, and estimated float time.
   - Purpose: show the complete planning workflow, not only discovery.

4. **Know what the gauge means**
   - Native state: Current River gauge detail with live rating and recent history.
   - Supporting copy: Live readings, recent trends, and an Eddy rating in one view.
   - Purpose: distinguish Eddy from a raw gauge-data app.

5. **Find the right access point**
   - Native state: Current River access list with photos and field details.
   - Supporting copy: Put-ins, take-outs, parking, fees, and directions.
   - Purpose: make Eddy’s hand-researched access information tangible.

6. **Watch the water for you**
   - Native state: Courtois Creek condition-alert configuration.
   - Supporting copy: Set river alerts for the conditions that matter to you.
   - Purpose: close on repeat-use value and proactive monitoring.

## Capture rules

- Use real Eddy iOS captures supplied from an iPhone or Simulator.
- Use the production API data and native status bars present in the supplied captures.
- Hide debug banners, developer menus, touch indicators, and Simulator chrome.
- Do not composite, redraw, or invent the app UI.
- Select a river whose live data makes the screen legible and useful on capture day.
- Keep all screenshots in light mode for one coherent storefront sequence.
- Store raw native captures in `captures/native/` and final artwork in
  `exports/iphone-6.9-native/`.

## Optional seventh image

**Plan around dam releases** uses the supplied Bull Shoals Dam generation
schedule. It is the strongest expansion screen if the storefront story grows
beyond the primary six.

## Share landing page

The public share URL is `/app`. It owns the 1200 × 630 Open Graph image and
links onward to Apple rather than redirecting immediately, so link unfurlers
and visitors both receive useful Eddy context.

Set these deployment values after App Store Connect assigns the listing:

- `NEXT_PUBLIC_APP_STORE_URL` — the full `https://apps.apple.com/...` listing URL.
- `NEXT_PUBLIC_APP_STORE_CAMPAIGN_URL` — optional Apple-generated campaign link
  for the landing page. When set, it takes precedence over the plain listing URL
  and passes its provider and campaign tokens into the iOS Smart App Banner.
- `NEXT_PUBLIC_APPLE_APP_ID` — the numeric Apple app ID used by the iOS Smart
  App Banner.

The page uses Apple's unmodified preferred black App Store badge and includes a
QR code pointing to `https://eddy.guide/app`, so printed and desktop placements
still lead through Eddy's owned landing page. Generate the campaign URL in App
Store Connect Analytics after the listing is live; do not hand-build its tokens.

Until those values exist, `/app` renders a deliberate “Coming soon” state and
keeps the web river guide available as the secondary action.
