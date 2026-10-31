import { ANCHOR_TOLERANCE_M, boundsForLine, buildRouteIndex, lineMetersAtMile, locateOnRoute, pointAt, sliceLine, type LngLat, type RouteIndex } from '@eddy/geo';
import type { CompletedFloat, FloatRouteSnapshot } from '@eddy/conditions/float-archive';
import { floatTracking, riverExplored, spanCalibration } from '@eddy/conditions/float-recap';
import type { FloatRoute } from './floatSession';

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Keep only the original, accepted calibration anchors needed by this stretch. */
export function recapMapAnchors(river: FloatRoute, index: RouteIndex, start: number, end: number) {
  if (!finite(start) || !finite(end) || end <= start) return undefined;
  const ordered = [...index.anchors].sort((a, b) => a.riverMile - b.riverMile);
  let first = 0;
  while (first < ordered.length - 2 && start >= ordered[first + 1].riverMile) first++;
  let last = first + 1;
  while (last < ordered.length - 1 && end > ordered[last].riverMile) last++;
  const needed = ordered.slice(first, last + 1);
  if (needed.length < 2 || needed.length > 128) return undefined;
  const saved: NonNullable<FloatRouteSnapshot['mapAnchors']> = [];
  for (const anchor of needed) {
    const source = river.anchors.find(a => {
      if (a.riverMile !== anchor.riverMile) return false;
      const hit = locateOnRoute(index, a.lngLat);
      return hit && hit.offsetMeters <= ANCHOR_TOLERANCE_M && Math.abs(hit.lineMeters - anchor.lineMeters) < 0.001;
    });
    if (!source) return undefined;
    saved.push({ id: source.id, riverMile: anchor.riverMile });
  }
  return saved;
}

/** Downloaded summaries are not schema-parsed. A malformed new field is never trusted. */
function savedMapAnchors(value: unknown): NonNullable<FloatRouteSnapshot['mapAnchors']> | null {
  if (!Array.isArray(value) || value.length < 2 || value.length > 128) return null;
  const ids = new Set<string>();
  let previous = -Infinity;
  for (const anchor of value) {
    if (!anchor || typeof anchor !== 'object' || typeof anchor.id !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(anchor.id) || ids.has(anchor.id) ||
      !finite(anchor.riverMile) || anchor.riverMile < -100 || anchor.riverMile > 10000 || anchor.riverMile <= previous) return null;
    ids.add(anchor.id);
    previous = anchor.riverMile;
  }
  return value;
}

function historicalIndex(route: FloatRouteSnapshot, river: FloatRoute, index: RouteIndex): RouteIndex | null {
  if (route.mapAnchors === undefined) return spanCalibration(river.anchors) === route.calibration ? index : null;
  const saved = savedMapAnchors(route.mapAnchors);
  if (!saved) return null;
  const current = new Map(river.anchors.map(anchor => [anchor.id, anchor]));
  const anchors = saved.flatMap(anchor => {
    const point = current.get(anchor.id);
    return point ? [{ lngLat: point.lngLat, riverMile: anchor.riverMile }] : [];
  });
  if (anchors.length !== saved.length) return null;
  // Rebuild with the OLD miles, including intermediate anchors. New access
  // points and today's mile edits cannot move historical coverage. If a
  // required anchor disappeared or no longer fits, do not silently skip it.
  const built = buildRouteIndex(river.line, anchors);
  return built.ok && built.index.anchors.length === saved.length ? built.index : null;
}

/** A historical denominator, never rebuilt from today's access-point miles. */
export function recapRouteModel(trip: CompletedFloat) {
  const route: unknown = trip.routeSnapshot;
  if (!route || typeof route !== 'object' || Array.isArray(route)) return null;
  const value = route as FloatRouteSnapshot;
  if (!finite(value.startMile) || !finite(value.takeOutMile) || value.takeOutMile <= value.startMile ||
    typeof value.startName !== 'string' || !value.startName.trim() ||
    typeof value.calibration !== 'string' || !/^[0-9a-f]{8}$/.test(value.calibration)) return null;
  const tracking = floatTracking(trip);
  const lastMile = tracking !== 'none' && finite(trip.lastMile) ? trip.lastMile : null;
  // Gaps in recording do not undo confirmed arrival. Conversely, a rounded
  // percentage must never be the thing that declares arrival.
  const percent = trip.reachedTakeOut ? 100 : tracking === 'measured' && lastMile != null
    ? Math.min(99, Math.max(0, Math.floor((lastMile - value.startMile) / (value.takeOutMile - value.startMile) * 100)))
    : null;
  return { ...value, percent, lastMile, tracking };
}

/** Draw credited intervals, including the tracker’s bounded gap estimates; never fill additional gaps. */
export function recapRouteGeometry(trip: CompletedFloat, river: FloatRoute, index: RouteIndex) {
  const route = recapRouteModel(trip);
  if (!route || river.riverSlug !== trip.riverSlug) return null;
  const original = historicalIndex(route, river, index);
  if (!original) return null;
  index = original;
  const mileAt = (mile: number) => lineMetersAtMile(index, mile);
  const section = sliceLine(index, mileAt(route.startMile), mileAt(route.takeOutMile));
  const bounds = boundsForLine(section);
  if (!bounds || (bounds[0] === bounds[2] && bounds[1] === bounds[3])) return null;
  const explored = riverExplored(trip);
  const covered: LngLat[][] = [];
  if (explored && explored.span.calibration === route.calibration) {
    const span = explored.span.lastMile - explored.span.firstMile;
    for (const segment of explored.segments) {
      const start = Math.max(route.startMile, explored.span.firstMile + segment.start * span);
      const end = Math.min(route.takeOutMile, explored.span.firstMile + segment.end * span);
      if (end > start) covered.push(sliceLine(index, mileAt(start), mileAt(end)));
    }
  }
  const last = !trip.reachedTakeOut && route.lastMile != null && route.lastMile >= route.startMile && route.lastMile < route.takeOutMile
    ? pointAt(index, mileAt(route.lastMile)) : null;
  return {
    section, covered, bounds, last,
    // sliceLine follows the geometry's order, which may run upstream.
    start: pointAt(index, mileAt(route.startMile)), takeOut: pointAt(index, mileAt(route.takeOutMile)),
    startName: route.startName, takeOutName: trip.takeOutName,
  };
}

export type RecapRouteGeometry = NonNullable<ReturnType<typeof recapRouteGeometry>>;

/** Prefer the trip's original download, then today's river with saved calibration. */
export function recapRouteMap(trip: CompletedFloat, sources: readonly { route: FloatRoute; index: RouteIndex }[]) {
  let updated = false;
  for (const source of sources) {
    const geometry = recapRouteGeometry(trip, source.route, source.index);
    if (geometry) return { geometry, message: null };
    const snapshot = recapRouteModel(trip);
    if (snapshot && source.route.riverSlug === trip.riverSlug && !historicalIndex(snapshot, source.route, source.index)) updated = true;
  }
  return { geometry: null, message: updated
    ? 'The river’s map has been updated since this float.' : 'Route map unavailable' };
}

export function recapMapDescription(geometry: RecapRouteGeometry) {
  return `River route from ${geometry.startName} to ${geometry.takeOutName}.` +
    (geometry.covered.length ? ' Highlighted sections show recorded or estimated river coverage.' : 'No river coverage is shown.') +
    (geometry.last ? ' The last recorded position is marked.' : '');
}

/** North-up river-only fallback: the same real geometry without map tiles. */
export function recapRouteDrawing(geometry: RecapRouteGeometry, width: number, height: number) {
  const [west, south, east, north] = geometry.bounds;
  const k = Math.cos((north + south) / 2 * Math.PI / 180);
  const dx = (east - west) * k;
  const dy = north - south;
  const scale = Math.min((width - 48) / Math.max(dx, 1e-9), (height - 48) / Math.max(dy, 1e-9));
  const point = ([lng, lat]: LngLat) => ({
    cx: (width - dx * scale) / 2 + (lng - west) * k * scale,
    cy: (height - dy * scale) / 2 + (north - lat) * scale,
  });
  const path = (line: LngLat[]) => line.map((p, i) => {
    const { cx, cy } = point(p);
    return (i ? 'L' : 'M') + cx.toFixed(2) + ',' + cy.toFixed(2);
  }).join(' ');
  return { point, path };
}
