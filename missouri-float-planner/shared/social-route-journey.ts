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

export type JourneyBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

/** The on-screen stage the camera composes into (all in canvas pixels). */
export type JourneyStage = {
  width: number;
  height: number;
  /** Where the boat sits once the camera is following it. */
  boatX: number;
  boatY: number;
  /** Inset kept clear around the whole-route overview. */
  padding: number;
};

/** screen = world * scale + translate. */
export type JourneyCamera = {
  scale: number;
  translateX: number;
  translateY: number;
};

export const DEFAULT_TIMING: JourneyTiming = {
  // The overview (whole float, every stop, the put-in callout) holds through
  // the intro, so frame 0 — the grid thumbnail — is a complete, branded card.
  introFrames: 45,
  travelFrames: 210,
  pauseFrames: 38,
  outroFrames: 90,
};

/** Frames over which the camera pushes in from the overview to the boat. It
 *  starts a beat before travel does so the first paddle strokes land mid-zoom
 *  rather than after a hard cut. */
const PUSH_IN_LEAD = 15;
const PUSH_IN_FRAMES = 48;

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
  maxPoints = 400,
  smooth = true,
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
  // The stored channel is Douglas-Peucker'd to ~50 m at import (see migration
  // 00116), so a 9-mile section is ~35 vertices and draws as visible facets at
  // reel scale. A Catmull-Rom pass through those vertices reads as a river
  // again without inventing geometry: every stored vertex is still on the line.
  const smoothed = smooth ? smoothRoute(rotated) : rotated;
  const total = routeLength(smoothed);
  if (!(total > 0)) return null;

  const scale = travelPixels / total;
  const scaled = smoothed.map((point) => ({ x: point.x * scale, y: point.y * scale }));
  return sampleByDistance(scaled, maxPoints);
}

/**
 * Centripetal-ish Catmull-Rom through every vertex, `samplesPerSegment` points
 * per original segment. Endpoints are preserved exactly; interior vertices lie
 * on the curve. Two points (or fewer) come back unchanged — there is nothing
 * to smooth.
 */
export function smoothRoute(
  points: ReadonlyArray<JourneyPoint>,
  samplesPerSegment = 8,
): JourneyPoint[] {
  if (points.length < 3 || samplesPerSegment < 2) return [...points];
  const at = (index: number) => points[Math.max(0, Math.min(points.length - 1, index))];
  const out: JourneyPoint[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    for (let j = 0; j < samplesPerSegment; j += 1) {
      const t = j / samplesPerSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

export function routeBounds(points: ReadonlyArray<JourneyPoint>): JourneyBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }
  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, centerX: 0, centerY: 0 };
  }
  return {
    minX, minY, maxX, maxY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

/**
 * Overview → follow camera. Through the intro the whole float is fitted inside
 * the stage (never magnified past the travel scale, so a short float doesn't
 * balloon); it then pushes in on the boat and stays anchored to it. Pure, so
 * the thumbnail frame is a testable fact rather than a hope.
 */
export function journeyCamera(
  frame: number,
  route: ReadonlyArray<JourneyPoint>,
  current: JourneyPoint,
  stage: JourneyStage,
  timing: JourneyTiming = DEFAULT_TIMING,
): JourneyCamera {
  const bounds = routeBounds(route);
  const usableW = Math.max(1, stage.width - stage.padding * 2);
  const usableH = Math.max(1, stage.height - stage.padding * 2);
  const fit = Math.min(
    1,
    bounds.width > 0 ? usableW / bounds.width : 1,
    bounds.height > 0 ? usableH / bounds.height : 1,
  );
  const start = timing.introFrames - PUSH_IN_LEAD;
  const k = smoothstep(clamp01((frame - start) / PUSH_IN_FRAMES));

  const scale = Math.exp(Math.log(fit) * (1 - k)); // log-lerp fit → 1
  const anchorWorldX = bounds.centerX + (current.x - bounds.centerX) * k;
  const anchorWorldY = bounds.centerY + (current.y - bounds.centerY) * k;
  const anchorScreenX = stage.width / 2 + (stage.boatX - stage.width / 2) * k;
  const anchorScreenY = stage.height / 2 + (stage.boatY - stage.height / 2) * k;
  return {
    scale,
    translateX: anchorScreenX - anchorWorldX * scale,
    translateY: anchorScreenY - anchorWorldY * scale,
  };
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
