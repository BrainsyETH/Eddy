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
- The inspected place has a persistent ring and a name or attached callout on
  the map. Its selected state is separate from put-in/take-out roles.
- River-line taps preserve the camera. Place taps only pan enough to reveal a
  covered marker; they do not change zoom. Search, **Show route**, **All rivers**,
  and Undo are intentional navigation actions. Loading data must not refit the
  camera or replace the mobile map. A manual pan takes precedence over resizing.
- `/plan` estimates use canoe pace, including incoming vessel links. The time
  infotip explains that rafts may be slower and that water, wind, and stops
  affect the estimate. The infotip renders outside scroll containers.

The fixture-backed `npm run test:planner-map` covers these interactions with the
real MapLibre map, including keyboard, desktop, mobile, delayed data, fullscreen,
and camera deep links. It does not need production credentials.
