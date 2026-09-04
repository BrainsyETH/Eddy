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

/**
 * A feature known to be on the float but with no coordinate — placed by a
 * guidebook river mile only, on a mile scale that disagrees with the DB's by
 * over a mile in places (Powder Mill: 58.7 vs 60.73). Never pinned to the line
 * or given a timed pause; surfaced once as an "also along this float" note so
 * the fact survives without the false precision.
 */
export type UnanchoredRoutePoint = {
  id: string;
  name: string;
  kind: RoutePointKind;
  riverMile: number;
  detail?: string;
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
  /** Hold for the "also along this float" card, only when there is one. */
  summaryFrames?: number;
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

/**
 * The rendered journey: the authoritative projected LineString, the polyline
 * that is actually stroked, and the mapping between them.
 */
export type Journey = {
  /** Raw projected LineString — rotated and scaled, nothing else. Authoritative. */
  raw: JourneyPoint[];
  /** What gets stroked: `raw` with each corner rounded inside a bounded radius. */
  points: JourneyPoint[];
  /** The most any stroked point may sit from the raw line, in canvas px. */
  maxDeviationPx: number;
  /**
   * Raw arc-length fraction → the stroked point standing in for it, plus the
   * stroked arc-length fraction needed to reach it (for draw-on dash offsets,
   * so the drawn line and the boat never disagree at a corner).
   */
  locate(progress: number): { point: JourneyPoint; renderedProgress: number };
};

export const DEFAULT_TIMING: JourneyTiming = {
  // The overview (whole float, every stop, the put-in callout) holds through
  // the intro, so frame 0 — the grid thumbnail — is a complete, branded card.
  introFrames: 45,
  travelFrames: 210,
  pauseFrames: 38,
  outroFrames: 90,
  summaryFrames: 54,
};

/** Frames over which the camera pushes in from the overview to the boat. It
 *  starts a beat before travel does so the first paddle strokes land mid-zoom
 *  rather than after a hard cut. */
const PUSH_IN_LEAD = 15;
const PUSH_IN_FRAMES = 48;

/**
 * Migration 00116 simplified the NHD flowlines with Douglas–Peucker at 0.0005°
 * (~50 m), so the stored line is already up to this far from the channel. The
 * stroked line may leave the stored line by at most the same distance: the
 * render never claims more precision than the data has, and never less.
 */
export const MAX_DEVIATION_METERS = 50;
const METERS_PER_DEGREE_LAT = 111_320;
/** Samples per rounded corner. Enough that a 44px stroke shows no facets. */
const CORNER_SAMPLES = 6;

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
 * upward, scaled so the travelled path is `travelPixels` long. Scale is based
 * on path length, not bounding box: the camera follows the route, so broad
 * bends may pan sideways without flattening or stretching the geography.
 *
 * Returns null for anything that cannot be drawn honestly (fewer than two
 * distinct points). The caller falls back; it never invents a line.
 */
export function buildJourney(
  coordinates: ReadonlyArray<LngLat> | null | undefined,
  travelPixels = 2550,
  roundCornersEnabled = true,
): Journey | null {
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
  const lengthDegrees = routeLength(rotated);
  if (!(lengthDegrees > 0)) return null;

  const scale = travelPixels / lengthDegrees;
  const raw = rotated.map((point) => ({ x: point.x * scale, y: point.y * scale }));

  // Both axes are in latitude-degree units (longitude was pre-scaled by
  // cos(lat)), so one planar degree ≈ 111.3 km everywhere on the route.
  const pxPerMeter = travelPixels / (lengthDegrees * METERS_PER_DEGREE_LAT);
  const maxDeviationPx = MAX_DEVIATION_METERS * pxPerMeter;
  // A quadratic corner with control point V bulges at most r/2 from the
  // polyline (see roundCorners), so r = 2·bound keeps every stroked point
  // inside the bound by construction.
  const rounded = roundCorners(raw, roundCornersEnabled ? maxDeviationPx * 2 : 0, CORNER_SAMPLES);

  const rawCum = arcLengths(raw);
  const rawTotal = rawCum[rawCum.length - 1];
  const renderedCum = arcLengths(rounded.points);
  const renderedTotal = renderedCum[renderedCum.length - 1];

  const locate = (progress: number) => {
    const target = clamp01(progress) * rawTotal;
    const { rawArc, points } = rounded;
    // rawArc is non-decreasing; find the first sample at or past the target.
    let hi = rawArc.length - 1;
    let lo = 0;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (rawArc[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    if (lo === 0) return { point: points[0], renderedProgress: 0 };
    const span = rawArc[lo] - rawArc[lo - 1];
    const t = span <= 0 ? 0 : (target - rawArc[lo - 1]) / span;
    const a = points[lo - 1];
    const b = points[lo];
    const renderedArc = renderedCum[lo - 1] + (renderedCum[lo] - renderedCum[lo - 1]) * t;
    return {
      point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
      renderedProgress: renderedTotal > 0 ? renderedArc / renderedTotal : 0,
    };
  };

  return { raw, points: rounded.points, maxDeviationPx, locate };
}

/** The stroked polyline only. See buildJourney for the full mapping. */
export function buildJourneyRoute(
  coordinates: ReadonlyArray<LngLat> | null | undefined,
  travelPixels = 2550,
  roundCornersEnabled = true,
): JourneyPoint[] | null {
  return buildJourney(coordinates, travelPixels, roundCornersEnabled)?.points ?? null;
}

/**
 * Round each interior corner with a quadratic curve whose control point is the
 * vertex itself, tangent to both segments `r` before and after it. Straight
 * runs between corners are untouched, so the stroked line IS the raw line
 * everywhere except within `r` of a vertex — and there it stays inside the
 * triangle (A, V, B), never further than r/2 from the polyline.
 *
 * Returns, alongside the points, each point's position along the RAW line so
 * a raw arc-length fraction can be mapped to a stroked point without going
 * through the stroked line's own (slightly different) length.
 */
export function roundCorners(
  raw: ReadonlyArray<JourneyPoint>,
  radius: number,
  samplesPerCorner = CORNER_SAMPLES,
): { points: JourneyPoint[]; rawArc: number[] } {
  const cum = arcLengths(raw);
  if (raw.length < 3 || !(radius > 0)) {
    return { points: [...raw], rawArc: cum };
  }
  const points: JourneyPoint[] = [raw[0]];
  const rawArc: number[] = [0];
  const push = (point: JourneyPoint, arc: number) => {
    const prev = points[points.length - 1];
    if (Math.hypot(point.x - prev.x, point.y - prev.y) < 1e-9) return;
    points.push(point);
    rawArc.push(arc);
  };

  for (let i = 1; i < raw.length - 1; i += 1) {
    const before = raw[i - 1];
    const vertex = raw[i];
    const after = raw[i + 1];
    const lenIn = cum[i] - cum[i - 1];
    const lenOut = cum[i + 1] - cum[i];
    const r = Math.min(radius, lenIn / 2, lenOut / 2);
    if (!(r > 1e-9)) {
      push(vertex, cum[i]);
      continue;
    }
    const uIn = { x: (vertex.x - before.x) / lenIn, y: (vertex.y - before.y) / lenIn };
    const uOut = { x: (after.x - vertex.x) / lenOut, y: (after.y - vertex.y) / lenOut };
    const a = { x: vertex.x - r * uIn.x, y: vertex.y - r * uIn.y };
    const b = { x: vertex.x + r * uOut.x, y: vertex.y + r * uOut.y };
    for (let k = 0; k <= samplesPerCorner; k += 1) {
      const t = k / samplesPerCorner;
      const w0 = (1 - t) * (1 - t);
      const w1 = 2 * (1 - t) * t;
      const w2 = t * t;
      push(
        { x: w0 * a.x + w1 * vertex.x + w2 * b.x, y: w0 * a.y + w1 * vertex.y + w2 * b.y },
        cum[i] - r + 2 * r * t,
      );
    }
  }
  push(raw[raw.length - 1], cum[cum.length - 1]);
  return { points, rawArc };
}

/** Largest distance from any of `points` to the polyline `line`. */
export function maxDistanceToPolyline(
  points: ReadonlyArray<JourneyPoint>,
  line: ReadonlyArray<JourneyPoint>,
): number {
  let worst = 0;
  for (const point of points) {
    let best = Infinity;
    for (let i = 1; i < line.length; i += 1) {
      const a = line[i - 1];
      const b = line[i];
      const vx = b.x - a.x;
      const vy = b.y - a.y;
      const d2 = vx * vx + vy * vy;
      const t = d2 === 0 ? 0 : clamp01(((point.x - a.x) * vx + (point.y - a.y) * vy) / d2);
      const d = Math.hypot(point.x - (a.x + vx * t), point.y - (a.y + vy * t));
      if (d < best) best = d;
    }
    if (best > worst) worst = best;
  }
  return worst;
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

/**
 * Total frames: intro, travel, one pause per intermediate stop, the summary
 * hold when there are unanchored features to mention, then the outro.
 */
export function journeyDuration(
  stopCount: number,
  timing: JourneyTiming = DEFAULT_TIMING,
  withSummary = false,
): number {
  const summary = withSummary ? timing.summaryFrames ?? DEFAULT_TIMING.summaryFrames ?? 0 : 0;
  return (
    timing.introFrames +
    timing.travelFrames +
    Math.max(0, stopCount) * timing.pauseFrames +
    summary +
    timing.outroFrames
  );
}

/** Intermediate stops only, in order — endpoints never pause. */
function usableStops(rawStops: ReadonlyArray<JourneyStop>): number[] {
  return rawStops
    .map((stop) => clamp01(stop.progress))
    .filter((progress) => progress > 0.015 && progress < 0.985)
    .sort((a, b) => a - b);
}

function legFrames(from: number, to: number, timing: JourneyTiming): number {
  return Math.max(1, Math.round((to - from) * timing.travelFrames));
}

/**
 * The frame at which the boat reaches the take-out. Uses the same per-leg
 * rounding as journeyState, so it is exact rather than ±(stops) frames.
 */
export function arrivalFrame(
  rawStops: ReadonlyArray<JourneyStop>,
  timing: JourneyTiming = DEFAULT_TIMING,
): number {
  const stops = usableStops(rawStops);
  let frame = timing.introFrames;
  let previous = 0;
  for (const stop of stops) {
    frame += legFrames(previous, stop, timing) + timing.pauseFrames;
    previous = stop;
  }
  return frame + legFrames(previous, 1, timing);
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
  const stops = usableStops(rawStops);
  const elapsed = Math.max(0, frame - timing.introFrames);
  let cursor = 0;
  let previous = 0;

  for (let i = 0; i < stops.length; i += 1) {
    const stop = stops[i];
    const travel = legFrames(previous, stop, timing);
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

  const finalTravel = legFrames(previous, 1, timing);
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

function arcLengths(points: ReadonlyArray<JourneyPoint>): number[] {
  const cum = [0];
  for (let i = 1; i < points.length; i += 1) {
    cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  return cum;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}
