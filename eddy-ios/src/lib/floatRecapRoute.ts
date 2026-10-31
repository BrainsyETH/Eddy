import { boundsForLine, lineMetersAtMile, pointAt, sliceLine, type LngLat, type RouteIndex } from '@eddy/geo';
import type { CompletedFloat, FloatRouteSnapshot } from '@eddy/conditions/float-archive';
import { floatTracking, riverExplored, spanCalibration } from '@eddy/conditions/float-recap';
import type { FloatRoute } from './floatSession';

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

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
  if (!route || river.riverSlug !== trip.riverSlug || spanCalibration(river.anchors) !== route.calibration) return null;
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
