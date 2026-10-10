// packages/eddy-geo/river-progress.ts
// Where a paddler is on a river, in river miles, and how far is left.
//
// Float Mode's core question is "how much farther?", and the answer has to be
// in the same miles the planner quoted. This file is the pure half of that:
// snap a GPS fix to the river line, then convert its place on the line into
// river miles. No React, no GPS, no storage; the iOS session layer owns those.
// eddy-ios has no test runner, so this lives here and the web suite covers it
// (missouri-float-planner/src/lib/river-progress.test.ts).
//
// ── Why river miles are calibrated at access points ─────────────────────────
//
// The stored river lines were simplified on import (about 50 m tolerance), which
// cuts the inside of bends: the line runs roughly 2-4% shorter than the channel
// (see src/lib/trust/checks/river-geometry.ts in the web app). The planner's
// distance does not use the line at all; it subtracts the hand-entered river
// miles of the two access points (get_float_segment).
//
// So the line is used for ORDER and PLACE, and the access points' river miles
// are used for DISTANCE. Between two neighbouring anchors, distance along the
// line is scaled to the miles between them. That restores the bends, absorbs
// the shortfall, and makes the total match the planner exactly. It is the same
// linear referencing road and river mile systems use, and it needs no
// correction factor and no finer geometry.
//
// A stretch whose line and miles disagree by more than 10% end to end, the
// tolerance the web app's geometry check already uses, is refused rather than
// "corrected". So is one whose anchors do not sit on the line or run out of
// order. Callers show an unsupported-route state; they never invent progress.
//
// ── Why matching searches near the last position ────────────────────────────
//
// On an oxbow the nearest piece of line can be the other arm of the bend.
// Rather than a map-matching framework, the matcher searches only the part of
// the line the paddler could have reached since the last good fix (bounded by
// elapsed time and a generous top speed) and widens to the whole line only
// when that window has nothing close enough, which is how it recovers after a
// GPS gap or a wrong match.

import type { LngLat } from './route-preview';

export type { LngLat } from './route-preview';

const METERS_PER_MILE = 1609.344;
/** Metres per degree of latitude; longitude is scaled by cos(lat) below. */
const METERS_PER_DEGREE = 111_320;

/**
 * How far an access point may sit from the line and still calibrate it.
 * Access points are snapped to the channel on import; this allows for the
 * unsnapped ones and for the simplification, and no more.
 */
const ANCHOR_TOLERANCE_M = 500;

/** Mirrors MAX_LENGTH_DISAGREEMENT in the web app's river-geometry check. */
export const MAX_LENGTH_DISAGREEMENT = 0.1;

/**
 * Base distance a fix may sit from the line and still count as on the river.
 * Covers the import's ~50 m simplification, half of a wide channel and some
 * margin; the fix's own accuracy is added on top. A tight bend must not read
 * as off-route.
 */
export const OFF_ROUTE_BASE_M = 120;

/** Fixes reporting worse horizontal accuracy than this are not used. */
export const MAX_ACCURACY_M = 75;

/** A fix older than this is not presented as where the paddler is now. */
export const STALE_FIX_MS = 2 * 60_000;

/**
 * Fastest plausible travel along the river, about 9 mph. Generous on purpose:
 * it only bounds where the matcher looks, and too tight a bound would lose a
 * fast paddler on high water.
 */
const MAX_SPEED_MPS = 4;

/** Extra search room around the last position, beyond speed and accuracy. */
const WINDOW_SLACK_M = 100;

/**
 * Remaining distance at which the take-out counts as reached, about 160 m.
 * Measured along the river, so a take-out across a bend is not "reached".
 */
export const ARRIVAL_MILES = 0.1;

/** An access point with a known river mile, used to calibrate the line. */
export interface CalibrationAnchor {
  lngLat: LngLat;
  /** river_mile_downstream: miles from the headwaters. */
  riverMile: number;
}

export interface RouteIndex {
  /** Line vertices in local metres. */
  readonly xs: ReadonlyArray<number>;
  readonly ys: ReadonlyArray<number>;
  /** Distance along the line to each vertex, in metres. */
  readonly cumulative: ReadonlyArray<number>;
  readonly lengthMeters: number;
  /** Anchors placed on the line, sorted by lineMeters. */
  readonly anchors: ReadonlyArray<{ lineMeters: number; riverMile: number }>;
  /** cos(reference latitude), for projecting fixes the same way. */
  readonly cosLat: number;
}

export type RouteRefusal =
  | 'too-few-points'
  | 'too-few-anchors'
  | 'anchor-off-line'
  | 'anchors-out-of-order'
  | 'length-disagreement';

export type RouteIndexResult = { ok: true; index: RouteIndex } | { ok: false; reason: RouteRefusal };

interface Projection {
  lineMeters: number;
  offsetMeters: number;
}

function project(cosLat: number, [lng, lat]: LngLat): [number, number] {
  return [lng * cosLat * METERS_PER_DEGREE, lat * METERS_PER_DEGREE];
}

/** Closest point on segment i to (px, py). */
function projectOnSegment(index: Pick<RouteIndex, 'xs' | 'ys' | 'cumulative'>, i: number, px: number, py: number): Projection {
  const ax = index.xs[i];
  const ay = index.ys[i];
  const dx = index.xs[i + 1] - ax;
  const dy = index.ys[i + 1] - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq > 0 ? Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / lengthSq)) : 0;
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return {
    lineMeters: index.cumulative[i] + t * Math.sqrt(lengthSq),
    offsetMeters: Math.hypot(px - cx, py - cy),
  };
}

/** Nearest point among segments whose span overlaps [from, to] metres. */
function nearest(index: Pick<RouteIndex, 'xs' | 'ys' | 'cumulative'>, px: number, py: number, from = -Infinity, to = Infinity): Projection | null {
  let best: Projection | null = null;
  for (let i = 0; i < index.xs.length - 1; i += 1) {
    if (index.cumulative[i + 1] < from || index.cumulative[i] > to) continue;
    const candidate = projectOnSegment(index, i, px, py);
    if (!best || candidate.offsetMeters < best.offsetMeters) best = candidate;
  }
  return best;
}

/**
 * Index a river line for one session, calibrated by access points.
 *
 * Pass the river's line and every access point with a river mile that the
 * session may use: at least the two ends, and ideally the ones between, since
 * each one tightens the calibration where it sits.
 */
export function buildRouteIndex(
  line: ReadonlyArray<LngLat> | null | undefined,
  anchors: ReadonlyArray<CalibrationAnchor>,
): RouteIndexResult {
  if (!line || line.length < 2) return { ok: false, reason: 'too-few-points' };
  const meanLat = line.reduce((sum, [, lat]) => sum + lat, 0) / line.length;
  const cosLat = Math.cos((meanLat * Math.PI) / 180);
  const xs: number[] = [];
  const ys: number[] = [];
  const cumulative: number[] = [];
  for (const point of line) {
    const [x, y] = project(cosLat, point);
    const last = xs.length - 1;
    cumulative.push(last < 0 ? 0 : cumulative[last] + Math.hypot(x - xs[last], y - ys[last]));
    xs.push(x);
    ys.push(y);
  }
  const lengthMeters = cumulative[cumulative.length - 1];
  if (!(lengthMeters > 0)) return { ok: false, reason: 'too-few-points' };

  const usable = anchors.filter((anchor) => Number.isFinite(anchor.riverMile));
  if (usable.length < 2) return { ok: false, reason: 'too-few-anchors' };

  const geometry = { xs, ys, cumulative };
  const placed: { lineMeters: number; riverMile: number }[] = [];
  for (const anchor of usable) {
    const [x, y] = project(cosLat, anchor.lngLat);
    const hit = nearest(geometry, x, y);
    if (!hit || hit.offsetMeters > ANCHOR_TOLERANCE_M) return { ok: false, reason: 'anchor-off-line' };
    placed.push({ lineMeters: hit.lineMeters, riverMile: anchor.riverMile });
  }
  placed.sort((a, b) => a.lineMeters - b.lineMeters);

  // River miles must run one way along the line, strictly: two anchors at the
  // same place with different miles, or a mile that doubles back, means the
  // data cannot say where anything is.
  const direction = Math.sign(placed[placed.length - 1].riverMile - placed[0].riverMile);
  if (direction === 0) return { ok: false, reason: 'anchors-out-of-order' };
  for (let i = 1; i < placed.length; i += 1) {
    const step = placed[i].riverMile - placed[i - 1].riverMile;
    if (Math.sign(step) !== direction || placed[i].lineMeters <= placed[i - 1].lineMeters) {
      return { ok: false, reason: 'anchors-out-of-order' };
    }
  }

  const lineMiles = (placed[placed.length - 1].lineMeters - placed[0].lineMeters) / METERS_PER_MILE;
  const riverMiles = Math.abs(placed[placed.length - 1].riverMile - placed[0].riverMile);
  if (Math.abs(lineMiles - riverMiles) / riverMiles > MAX_LENGTH_DISAGREEMENT) {
    return { ok: false, reason: 'length-disagreement' };
  }

  return { ok: true, index: { xs, ys, cumulative, lengthMeters, anchors: placed, cosLat } };
}

/**
 * Convert a place on the line to a river mile.
 *
 * Linear between neighbouring anchors. Beyond the outer anchors it continues
 * at the scale of the nearest pair, so a quick start just upstream of the
 * first known access point still reads sensibly.
 */
export function riverMileAt(index: RouteIndex, lineMeters: number): number {
  const anchors = index.anchors;
  let i = 0;
  while (i < anchors.length - 2 && lineMeters > anchors[i + 1].lineMeters) i += 1;
  const a = anchors[i];
  const b = anchors[i + 1];
  const t = (lineMeters - a.lineMeters) / (b.lineMeters - a.lineMeters);
  return a.riverMile + t * (b.riverMile - a.riverMile);
}

export interface PositionFix {
  lngLat: LngLat;
  /** Horizontal accuracy in metres; null means unknown and is not used. */
  accuracyMeters: number | null;
  /** Epoch milliseconds when the fix was taken. */
  timestamp: number;
}

/** The last fix that matched, for windowed matching. */
export interface PreviousMatch {
  lineMeters: number;
  timestamp: number;
}

export type MatchResult =
  | {
      kind: 'matched';
      lineMeters: number;
      riverMile: number;
      offsetMeters: number;
      /**
       * False when there was no previous match or this one is not reachable
       * from it (found by widening after a gap or a wrong match). Pace must
       * not treat the interval before a discontinuous match as movement.
       */
      continuous: boolean;
    }
  | { kind: 'off-route'; offsetMeters: number }
  | { kind: 'rejected'; reason: 'inaccurate' | 'stale' | 'out-of-order' };

/**
 * Match one fix to the river.
 *
 * Rejected fixes say nothing about where the paddler is and must not move
 * progress. An off-route fix is real but is not forced onto the river.
 */
export function matchFix(
  index: RouteIndex,
  fix: PositionFix,
  previous: PreviousMatch | null,
  now: number,
): MatchResult {
  const accuracy = fix.accuracyMeters;
  if (accuracy == null || !Number.isFinite(accuracy) || accuracy > MAX_ACCURACY_M) {
    return { kind: 'rejected', reason: 'inaccurate' };
  }
  if (now - fix.timestamp > STALE_FIX_MS) return { kind: 'rejected', reason: 'stale' };
  if (previous && fix.timestamp <= previous.timestamp) return { kind: 'rejected', reason: 'out-of-order' };

  const [x, y] = project(index.cosLat, fix.lngLat);
  const tolerance = OFF_ROUTE_BASE_M + accuracy;

  if (previous) {
    const seconds = (fix.timestamp - previous.timestamp) / 1000;
    const reach = MAX_SPEED_MPS * seconds + accuracy + WINDOW_SLACK_M;
    const local = nearest(index, x, y, previous.lineMeters - reach, previous.lineMeters + reach);
    if (local && local.offsetMeters <= tolerance) {
      return { kind: 'matched', ...local, riverMile: riverMileAt(index, local.lineMeters), continuous: true };
    }
  }

  const global = nearest(index, x, y);
  if (!global) return { kind: 'off-route', offsetMeters: Infinity };
  if (global.offsetMeters > tolerance) return { kind: 'off-route', offsetMeters: global.offsetMeters };
  return { kind: 'matched', ...global, riverMile: riverMileAt(index, global.lineMeters), continuous: false };
}

export interface StretchProgress {
  totalMiles: number;
  /** Negative while upstream of the start. */
  travelledMiles: number;
  /** Negative once past the take-out. */
  remainingMiles: number;
  /** 0-1, clamped; the display value. */
  fraction: number;
  /** Within ARRIVAL_MILES of the take-out, or past it: offer Finish. */
  arrived: boolean;
  pastEnd: boolean;
}

/**
 * Progress between two river miles, in the direction of travel.
 *
 * For a saved trip, start and end are its put-in and take-out. For a quick
 * start, start is the first reliable matched position and must be persisted
 * with the session so the percentage keeps its meaning across a relaunch.
 */
export function stretchProgress(startMile: number, endMile: number, currentMile: number): StretchProgress {
  const direction = Math.sign(endMile - startMile) || 1;
  const totalMiles = Math.abs(endMile - startMile);
  const travelledMiles = (currentMile - startMile) * direction;
  const remainingMiles = (endMile - currentMile) * direction;
  const fraction = totalMiles > 0 ? Math.min(1, Math.max(0, travelledMiles / totalMiles)) : 1;
  return {
    totalMiles,
    travelledMiles,
    remainingMiles,
    fraction,
    arrived: remainingMiles <= ARRIVAL_MILES,
    pastEnd: remainingMiles < -ARRIVAL_MILES,
  };
}
