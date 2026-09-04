// Pure geometry + timing for the scrolling social float reel.
//
// Kept in shared/ so the Next.js data assembler and isolated Remotion bundle
// use the same route maths. Nothing here touches the DOM or Remotion.

export type LngLat = [number, number];

export type RoutePointKind =
  | 'put_in'
  | 'take_out'
  | 'access'
  | 'campground'
  | 'spring'
  | 'poi'
  | 'hazard';

export type SocialRoutePoint = {
  id: string;
  name: string;
  kind: RoutePointKind;
  riverMile: number;
  /** Arc-length position on the selected LineString. */
  progress: number;
  detail?: string;
  severity?: string;
};

export type JourneyPoint = {
  x: number;
  y: number;
};

export type JourneyStop = {
  progress: number;
};

export type JourneyTiming = {
  introFrames: number;
  travelFrames: number;
  pauseFrames: number;
  outroFrames: number;
};

export type JourneyState = {
  progress: number;
  activeStop: number | null;
  /** 0 at the pause edges, 1 through its readable middle. */
  calloutProgress: number;
  complete: boolean;
};

const DEFAULT_TIMING: JourneyTiming = {
  introFrames: 30,
  travelFrames: 210,
  pauseFrames: 38,
  outroFrames: 90,
};

export function validRouteCoordinates(
  coordinates: ReadonlyArray<LngLat> | null | undefined,
): LngLat[] {
  return (coordinates ?? []).filter(
    (point): point is LngLat =>
      Array.isArray(point) &&
      Number.isFinite(point[0]) &&
      Number.isFinite(point[1]),
  );
}

/** Bound workflow payload size while always retaining the true endpoints. */
export function sampleRouteCoordinates(
  coordinates: ReadonlyArray<LngLat> | null | undefined,
  maxPoints = 180,
): LngLat[] {
  const clean = validRouteCoordinates(coordinates);
  if (clean.length <= maxPoints || maxPoints < 2) return clean;
  const step = (clean.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, index) => clean[Math.round(index * step)]);
}

/**
 * Project and rotate a real river so its overall downstream direction points
 * upward. Scale is based on travelled path length, not its bounding box: the
 * camera follows the route, so broad bends may pan sideways without flattening
 * or stretching the geography to fit one frame.
 */
export function buildJourneyRoute(
  coordinates: ReadonlyArray<LngLat> | null | undefined,
  travelPixels = 2550,
  maxPoints = 180,
): JourneyPoint[] | null {
  const clean = validRouteCoordinates(coordinates);
  if (clean.length < 2 || !(travelPixels > 0)) return null;

  const midLat = (Math.min(...clean.map((p) => p[1])) + Math.max(...clean.map((p) => p[1]))) / 2;
  const lngScale = Math.cos((midLat * Math.PI) / 180);
  const origin = clean[0];
  const planar = clean.map(([lng, lat]) => ({
    x: (lng - origin[0]) * lngScale,
    y: -(lat - origin[1]),
  }));

  const first = planar[0];
  const last = planar[planar.length - 1];
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  if (Math.hypot(dx, dy) < 1e-12) return null;

  const rotation = -Math.PI / 2 - Math.atan2(dy, dx);
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const rotated = planar.map((point) => ({
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  }));
  const total = routeLength(rotated);
  if (!(total > 0)) return null;

  const scale = travelPixels / total;
  const scaled = rotated.map((point) => ({ x: point.x * scale, y: point.y * scale }));
  return sampleByDistance(scaled, maxPoints);
}

export function routeLength(points: ReadonlyArray<JourneyPoint>): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return total;
}

export function pointAtRouteProgress(
  points: ReadonlyArray<JourneyPoint>,
  rawProgress: number,
): JourneyPoint {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  const progress = clamp01(rawProgress);
  const total = routeLength(points);
  const target = progress * total;
  let travelled = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const segment = Math.hypot(b.x - a.x, b.y - a.y);
    if (travelled + segment >= target) {
      const t = segment === 0 ? 0 : (target - travelled) / segment;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    travelled += segment;
  }
  return points[points.length - 1];
}

/** Nearest along-line progress for a real feature coordinate. */
export function progressAlongRoute(
  coordinates: ReadonlyArray<LngLat> | null | undefined,
  target: LngLat | null | undefined,
): number | null {
  const clean = validRouteCoordinates(coordinates);
  if (clean.length < 2 || !target || !Number.isFinite(target[0]) || !Number.isFinite(target[1])) return null;
  const midLat = (Math.min(...clean.map((p) => p[1])) + Math.max(...clean.map((p) => p[1]))) / 2;
  const lngScale = Math.cos((midLat * Math.PI) / 180);
  const flat = (point: LngLat) => ({ x: point[0] * lngScale, y: point[1] });
  const points = clean.map(flat);
  const needle = flat(target);
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const length = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    lengths.push(length);
    total += length;
  }
  if (!(total > 0)) return null;

  let bestDistance = Infinity;
  let bestProgress = 0;
  let before = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const denominator = vx * vx + vy * vy;
    const t = denominator === 0
      ? 0
      : clamp01(((needle.x - a.x) * vx + (needle.y - a.y) * vy) / denominator);
    const x = a.x + vx * t;
    const y = a.y + vy * t;
    const distance = Math.hypot(needle.x - x, needle.y - y);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestProgress = (before + lengths[i - 1] * t) / total;
    }
    before += lengths[i - 1];
  }
  return clamp01(bestProgress);
}

export function journeyDuration(
  stopCount: number,
  timing: JourneyTiming = DEFAULT_TIMING,
): number {
  return timing.introFrames + timing.travelFrames + Math.max(0, stopCount) * timing.pauseFrames + timing.outroFrames;
}

/**
 * Piecewise route progress: travel at a consistent average pace, hold at every
 * intermediate feature, then continue. Stops at either endpoint are ignored.
 */
export function journeyState(
  frame: number,
  rawStops: ReadonlyArray<JourneyStop>,
  timing: JourneyTiming = DEFAULT_TIMING,
): JourneyState {
  const stops = rawStops
    .map((stop) => clamp01(stop.progress))
    .filter((progress) => progress > 0.015 && progress < 0.985)
    .sort((a, b) => a - b);
  const elapsed = Math.max(0, frame - timing.introFrames);
  const travelPerProgress = timing.travelFrames;
  let cursor = 0;
  let previous = 0;

  for (let i = 0; i < stops.length; i += 1) {
    const stop = stops[i];
    const travel = Math.max(1, Math.round((stop - previous) * travelPerProgress));
    if (elapsed < cursor + travel) {
      const local = (elapsed - cursor) / travel;
      return {
        progress: previous + (stop - previous) * smoothstep(clamp01(local)),
        activeStop: null,
        calloutProgress: 0,
        complete: false,
      };
    }
    cursor += travel;
    if (elapsed < cursor + timing.pauseFrames) {
      const local = clamp01((elapsed - cursor) / timing.pauseFrames);
      return {
        progress: stop,
        activeStop: i,
        calloutProgress: Math.min(1, local * 5, (1 - local) * 5),
        complete: false,
      };
    }
    cursor += timing.pauseFrames;
    previous = stop;
  }

  const finalTravel = Math.max(1, Math.round((1 - previous) * travelPerProgress));
  if (elapsed < cursor + finalTravel) {
    const local = (elapsed - cursor) / finalTravel;
    return {
      progress: previous + (1 - previous) * smoothstep(clamp01(local)),
      activeStop: null,
      calloutProgress: 0,
      complete: false,
    };
  }
  return { progress: 1, activeStop: null, calloutProgress: 0, complete: true };
}

function sampleByDistance(points: ReadonlyArray<JourneyPoint>, maxPoints: number): JourneyPoint[] {
  if (points.length <= maxPoints || maxPoints < 2) return [...points];
  return Array.from({ length: maxPoints }, (_, index) =>
    pointAtRouteProgress(points, index / (maxPoints - 1)),
  );
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}
