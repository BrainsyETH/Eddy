// src/lib/map/viewport.ts
// Viewport-cache arithmetic for the web map's bbox-driven layers.
//
// ── Why this is a copy ─────────────────────────────────────────────────────
// These three functions are `packages/eddy-geo`, verbatim, and this file exists
// because Vercel installs only missouri-float-planner/ — `@eddy/*` is not
// resolvable from shippable web code, so a shared module cannot be imported
// here no matter how much both apps want it. Same situation as
// src/lib/navigation/deepLinks.ts and the MapGaugeLite mirror in
// /api/gauges/map.
//
// The guard is src/lib/map/viewport-parity.test.ts, which imports BOTH this
// file and @eddy/geo (web TESTS may reach outside the app — they run under
// tsconfig.test.json, not the build) and asserts they agree on a grid of
// fixtures. Change one, that test goes red.
//
// ── What they are for ──────────────────────────────────────────────────────
// A raw camera bbox is a fresh URL on every pan, which is a CDN miss every
// time, and a fresh request for a viewport we already hold the answer to.
//
//   quantizeBbox  — snap OUTWARD onto a zoom-dependent grid, so a metro area
//                   collapses to a handful of cacheable URLs.
//   padBbox       — ask for more than the screen, so small pans stay inside
//                   what we already have.
//   bboxContains  — the test that skips the request entirely.

/** [minLng, minLat, maxLng, maxLat] — the order /api/rivers/[slug] returns. */
export type Bounds = [number, number, number, number];

/**
 * Grid size in degrees for a zoom level.
 *
 * Coarser when zoomed out, where a cell covers a lot of screen and the payload
 * is capped anyway, and finer when zoomed in, where snapping too coarsely would
 * request most of a state to draw one valley.
 */
export function bboxGridSize(zoom: number): number {
  if (zoom < 8) return 0.5;
  if (zoom < 11) return 0.1;
  return 0.02;
}

/**
 * Snaps bounds outward onto a grid.
 *
 * OUTWARD in both directions — floor the minimums, ceil the maximums — so the
 * snapped box always CONTAINS the real viewport. Rounding to nearest would
 * sometimes return a box smaller than the screen, and the missing strip would
 * show as features that appear only after you pan past them.
 */
export function quantizeBbox(bounds: Bounds, zoom: number): Bounds {
  const g = bboxGridSize(zoom);
  const [minLng, minLat, maxLng, maxLat] = bounds;
  // Rounded to kill the floating-point dust that would otherwise make two
  // identical viewports produce two different cache keys.
  const snap = (v: number) => Math.round(v * 1e6) / 1e6;
  return [
    snap(Math.floor(minLng / g) * g),
    snap(Math.max(-90, Math.floor(minLat / g) * g)),
    snap(Math.ceil(maxLng / g) * g),
    snap(Math.min(90, Math.ceil(maxLat / g) * g)),
  ];
}

/**
 * Grows bounds by a fraction of their own size, clamped to the world.
 *
 * Proportional rather than a fixed distance: the point is to buy roughly one
 * screen's worth of slack at any zoom, and a screen is a different number of
 * degrees at z6 than at z14.
 */
export function padBbox(bounds: Bounds, fraction = 0.2): Bounds {
  const [minLng, minLat, maxLng, maxLat] = bounds;
  const lngPad = (maxLng - minLng) * fraction;
  const latPad = (maxLat - minLat) * fraction;
  return [
    Math.max(-180, minLng - lngPad),
    Math.max(-90, minLat - latPad),
    Math.min(180, maxLng + lngPad),
    Math.min(90, maxLat + latPad),
  ];
}

/** True when `inner` lies entirely within `outer` — the "skip the fetch" test. */
export function bboxContains(outer: Bounds, inner: Bounds): boolean {
  return (
    outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3]
  );
}
