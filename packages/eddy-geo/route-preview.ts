// packages/eddy-geo/route-preview.ts
// A river's own shape, fitted to a small box.
//
// The plan tells you it is 7.4 miles from Akers to Pulltite. It does not show
// you the stretch — which, in a map app, is the one thing the answer screen was
// missing. A 120pt strip carrying the actual line between the two ends is the
// difference between reading "7.4 mi" and believing it, and the geometry has
// been on the wire the whole time: FloatPlan.route.geometry, drawn on the map
// tab and ignored everywhere else.
//
// ── Pure, and here rather than in the app ───────────────────────────────────
//
// Projection is arithmetic, it is the part that can be wrong in ways nobody
// notices (a mirrored river still looks like a river), and eddy-ios has no test
// runner. So it lives beside the other map maths, where the web suite covers
// it — see missouri-float-planner/src/lib/route-preview.test.ts.
//
// ── The projection ─────────────────────────────────────────────────────────
//
// Equirectangular with a cos(lat) correction on longitude, not Web Mercator.
// Over a float stretch — tens of miles, well inside one degree of latitude —
// the two are indistinguishable, and this one is four lines and cannot produce
// a NaN. What the correction buys is aspect: without it an east-west river in
// Missouri renders about 20% too wide, which is the sort of error that makes a
// shape look plausible and wrong.
//
// The line is then fitted to the box with ONE scale factor for both axes and
// centred, so it is never stretched to fill. A route preview that fills its
// frame has drawn a different river.

/** [lng, lat], the order GeoJSON uses and RiverGeometry carries. */
export type LngLat = [number, number];

export interface RoutePreview {
  /** An SVG path — "M x y L x y …" — in the box's own pixel space. */
  path: string;
  /** Where the float begins, already projected. */
  start: { x: number; y: number };
  /** Where it ends. */
  end: { x: number; y: number };
}

export interface RoutePreviewOptions {
  width: number;
  height: number;
  /** Space left for the endpoint markers and their shadows. */
  padding?: number;
  /**
   * Cap on the points drawn.
   *
   * A full NHD flowline for a long stretch can run to thousands of vertices,
   * which is a path string measured in tens of kilobytes for a strip a
   * thumbnail wide — every one of them landing inside the same pixel. Sampled
   * evenly, with the first and last always kept so the ends stay exact.
   */
  maxPoints?: number;
}

/**
 * Fit a LineString into a box.
 *
 * Returns null rather than something drawable when the geometry cannot support
 * a preview:
 *
 *   - fewer than two points — there is no line
 *   - a box with no area
 *   - every point identical, so the stretch has no extent at all
 *
 * NULL IS THE IMPORTANT RETURN. The caller draws nothing on it. An invented
 * route — a straight line between two ends, a fallback squiggle — would be a
 * picture of a river that does not exist, presented at the exact moment
 * somebody is deciding whether to drive four hours to paddle it.
 */
export function routePreview(
  coordinates: ReadonlyArray<LngLat> | null | undefined,
  options: RoutePreviewOptions,
): RoutePreview | null {
  const { width, height, padding = 8, maxPoints = 160 } = options;
  if (!coordinates || coordinates.length < 2) return null;
  if (!(width > 0) || !(height > 0)) return null;

  const points = coordinates.filter(
    (c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]),
  );
  if (points.length < 2) return null;

  // cos of the mid-latitude, so longitude degrees are scaled to the width they
  // actually have at this river rather than the width they have at the equator.
  const lats = points.map((p) => p[1]);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const lngScale = Math.cos((midLat * Math.PI) / 180);

  const flat = points.map(([lng, lat]) => ({ x: lng * lngScale, y: lat }));
  const minX = Math.min(...flat.map((p) => p.x));
  const maxX = Math.max(...flat.map((p) => p.x));
  const minY = Math.min(...flat.map((p) => p.y));
  const maxY = Math.max(...flat.map((p) => p.y));

  const spanX = maxX - minX;
  const spanY = maxY - minY;
  if (spanX === 0 && spanY === 0) return null;

  const innerW = Math.max(width - padding * 2, 1);
  const innerH = Math.max(height - padding * 2, 1);
  // One scale for both axes — see the header. A stretch that is long and
  // narrow stays long and narrow.
  const scale = Math.min(spanX === 0 ? Infinity : innerW / spanX, spanY === 0 ? Infinity : innerH / spanY);
  const drawnW = spanX * scale;
  const drawnH = spanY * scale;
  const offsetX = padding + (innerW - drawnW) / 2;
  const offsetY = padding + (innerH - drawnH) / 2;

  // Rounded, and the SAME rounding the path gets — the markers have to land on
  // the line's own ends, not a fraction of a pixel off them.
  const project = (p: { x: number; y: number }) => ({
    x: round(offsetX + (p.x - minX) * scale),
    // Latitude increases northward and SVG y increases downward, so this
    // subtracts rather than adds. Getting it wrong flips the river vertically
    // and nothing about the result looks broken, which is why it is asserted
    // in the tests.
    y: round(offsetY + (maxY - p.y) * scale),
  });

  const sampled = samplePoints(flat, maxPoints).map(project);
  const path = sampled.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');

  return {
    path,
    // Off the FULL set, not the sample: the ends are the two access points
    // somebody chose, and a marker that has drifted to a nearby vertex is a
    // marker on the wrong gravel bar.
    start: project(flat[0]),
    end: project(flat[flat.length - 1]),
  };
}

/** Evenly spaced, first and last always kept. */
function samplePoints<T>(points: ReadonlyArray<T>, max: number): T[] {
  if (max < 2 || points.length <= max) return [...points];
  const step = (points.length - 1) / (max - 1);
  const out: T[] = [];
  for (let i = 0; i < max; i += 1) out.push(points[Math.round(i * step)]);
  return out;
}

/** Two decimals is well under a device pixel and keeps the path string short. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}
