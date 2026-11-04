import { MILL_RIVER_LINES } from './mill-map-data';

/** The southern Missouri Ozarks around the ten mills, in degrees. */
export const MILL_MAP_BOUNDS = { west: -92.72, east: -90.68, south: 36.12, north: 38.08 };
const K = Math.cos((37.1 * Math.PI) / 180);
/** viewBox height; width follows the bounds' true proportions. */
export const MILL_MAP_HEIGHT = 1000;
export const MILL_MAP_WIDTH = Math.round(
  (MILL_MAP_HEIGHT * (MILL_MAP_BOUNDS.east - MILL_MAP_BOUNDS.west) * K) / (MILL_MAP_BOUNDS.north - MILL_MAP_BOUNDS.south)
);
/** The Missouri–Arkansas line. */
export const STATE_LINE_LAT = 36.5;

export function projectMap(lat: number, lng: number): [number, number] {
  const { west, east, south, north } = MILL_MAP_BOUNDS;
  return [
    Math.round(((lng - west) / (east - west)) * MILL_MAP_WIDTH * 10) / 10,
    Math.round(((north - lat) / (north - south)) * MILL_MAP_HEIGHT * 10) / 10,
  ];
}

/** SVG `points` for each river line, already projected. */
export const MILL_MAP_RIVERS: Record<string, string> = Object.fromEntries(
  Object.entries(MILL_RIVER_LINES).map(([slug, line]) => [slug, line.map(([lng, lat]) => projectMap(lat, lng).join(',')).join(' ')])
);

/** A gentle arc from a to b (never a straight ruler line), bowing to one side
 * chosen by `side`, so successive legs of the tour do not overlap. */
export function routeArc(a: [number, number], b: [number, number], side: 1 | -1) {
  const [ax, ay] = a;
  const [bx, by] = b;
  const length = Math.hypot(bx - ax, by - ay) || 1;
  const bow = Math.min(120, length * 0.22) * side;
  const control: [number, number] = [(ax + bx) / 2 - ((by - ay) / length) * bow, (ay + by) / 2 + ((bx - ax) / length) * bow];
  const at = (t: number): [number, number] => [
    (1 - t) ** 2 * ax + 2 * (1 - t) * t * control[0] + t ** 2 * bx,
    (1 - t) ** 2 * ay + 2 * (1 - t) * t * control[1] + t ** 2 * by,
  ];
  return { d: `M${ax},${ay} Q${control[0]},${control[1]} ${bx},${by}`, at };
}

/** The tour band's crop: just around the ten mills (the full map keeps the
 * upper Huzzah, which leaves a small band mostly empty). */
export function tourViewBox(points: [number, number][], pad = 70): { x: number; y: number; width: number; height: number } {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return {
    x: Math.min(...xs) - pad,
    y: Math.min(...ys) - pad,
    width: Math.max(...xs) - Math.min(...xs) + 2 * pad,
    height: Math.max(...ys) - Math.min(...ys) + 2 * pad,
  };
}
