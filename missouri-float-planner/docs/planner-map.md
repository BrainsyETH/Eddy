# Planner map interactions

The `/plan` map uses Eddy's framed surfaces, warm neutrals, hard offset shadows,
shared place artwork, and canonical condition colors. Access previews and route
endpoints share `PlannerAccessDetails`; desktop and mobile share `PlanSidebar`.
Mobile keeps the existing draggable sheet and its three snap positions.

- With no put-in, inspect a place first, then choose **Use as put-in**.
- With a put-in and no take-out, selecting another eligible access completes
  the downstream pair and expands the selected access's details.
- Selecting an existing endpoint expands it. Removal is a separate action.
- With a complete route, another access opens a separate preview: an anchored
  map callout on desktop, a bottom sheet on mobile. Replacing either endpoint
  is explicit. A non-launch POI never changes the route.
- The inspected place uses its actual Eddy artwork in a stronger rectangular
  frame, with one combined name/endpoint label. Put-in is river blue; take-out
  is coral orange. Selection never adds a second circle over the pin.
- Access points, POIs, and gauges share a MapLibre cluster source. Wide-view
  numbered clusters zoom to reveal their members; a labeled endpoint cluster
  opens its chooser directly. At close zoom (including coincident
  coordinates), a place chooser exposes each member to pointer, touch, and
  keyboard input. An inspected member or route endpoint stays anchored at its
  true coordinates and retains a count badge for nearby places. Marker taps
  cannot also trigger map drag or double-tap zoom.
- Clicking blank space closes the inspected card without clearing the route.
  Dragging the map or using its controls preserves inspection. Clicked gauges
  persist when the pointer leaves and through basemap changes; their full
  readings use the existing gauge components.
- **View details** from a compact access callout opens the shared full access
  card in the side panel, with **Back to route**. It does not expand a second
  scrolling detail view inside the small map callout.
- **Clear route** lives to the right of **Build a Route**, including the mobile
  sheet header. Endpoint action colors match the map's role colors.
- River-line taps preserve the camera. Place taps only pan enough to reveal a
  covered marker; they do not change zoom. Cluster expansion, search, **Show route**,
  **All rivers**,
  and Undo are intentional navigation actions. Loading data must not refit the
  camera or replace the mobile map. A manual pan takes precedence over resizing.
- **All rivers** hides the river's access-point strip while retaining the
  planned endpoints. Selecting the river again or **Show route** restores it
  on desktop.
- `/plan` estimates use canoe pace, including incoming vessel links. The time
  infotip explains that rafts may be slower and that water, wind, and stops
  affect the estimate. The infotip renders outside scroll containers.

The fixture-backed `npm run test:planner-map` covers these interactions with the
real MapLibre map, including keyboard, desktop, mobile, delayed data, fullscreen,
and camera deep links. It does not need production credentials.
