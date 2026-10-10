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
// Each span between neighbouring anchors must agree with its miles within 10%,
// the tolerance the web app's geometry check already uses. Access points that
// sit off the line or disagree with the rest are left out of calibration (and
// cannot be a float's ends); a river is refused only when fewer than two agree.
// Nothing is "corrected": callers show an unsupported-route state rather than
// invent progress.
//
// ── Why matching keeps a little memory ──────────────────────────────────────
//
// One fix is never allowed to move the paddler far. Each fix is matched only to
// the part of the line reachable since the last committed position (elapsed
// time times a generous top speed), and the projection itself is clamped to
// that window, so even a single long segment cannot carry a match out of it.
//
// Anything else becomes a CANDIDATE: the first position of a session, any
// position after a gap long enough that the window no longer means much, and a
// clearly better fit outside the window (the other arm of an oxbow while the
// current match sits on the wrong one). A candidate is committed only after
// several consecutive fixes agree with it and move plausibly along it. While
// one is pending the tracker reports itself uncertain, and the last reliable
// position, with its timestamp and progress, does not move. No
// map-matching framework, just a window and a confirmation count.

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
export const ANCHOR_TOLERANCE_M = 500;

/** Mirrors MAX_LENGTH_DISAGREEMENT in the web app's river-geometry check. */
export const MAX_LENGTH_DISAGREEMENT = 0.1;

/**
 * Absolute allowance on one calibration span, about 80 m. Short spans between
 * close access points cannot meet a percentage alone: placing each anchor on
 * the simplified line is itself uncertain by tens of metres.
 */
const SPAN_SLACK_MILES = 0.05;

/** Does one span's line length agree with its river miles, in the right direction? */
function spanAgrees(
  a: { lineMeters: number; riverMile: number },
  b: { lineMeters: number; riverMile: number },
  direction: number,
): boolean {
  const riverMiles = (b.riverMile - a.riverMile) * direction;
  const lineMiles = (b.lineMeters - a.lineMeters) / METERS_PER_MILE;
  if (!(riverMiles > 0) || !(lineMiles > 0)) return false;
  return Math.abs(lineMiles - riverMiles) <= Math.max(MAX_LENGTH_DISAGREEMENT * riverMiles, SPAN_SLACK_MILES);
}

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

/** Consecutive agreeing fixes needed to commit a position outside the window. */
export const CONFIRM_FIXES = 3;

/**
 * After this long without a committed position, the reachable window is no
 * longer trusted: fifteen minutes at the top speed spans most oxbows, so an
 * ambiguous fix could otherwise move progress a kilometre with no evidence.
 * Tracking reacquires instead, with the same confirmation as a relocation.
 */
export const REACQUIRE_AFTER_MS = 3 * 60_000;

/**
 * How much better a candidate must fit than the committed track before it
 * challenges it. Large enough that drifting toward the neck of an oxbow does
 * not start a switch; small enough that sitting squarely on the other arm does.
 */
const CHALLENGE_MARGIN_M = 50;

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
  /**
   * Anchors left out of calibration: off the line, or disagreeing with the
   * others. Not an error for the paddler; worth reporting as data to fix.
   */
  readonly excludedAnchors: number;
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

/**
 * Closest point on segment i to (px, py), restricted to the part of the
 * segment between `from` and `to` metres along the line.
 */
function projectOnSegment(
  index: Pick<RouteIndex, 'xs' | 'ys' | 'cumulative'>,
  i: number,
  px: number,
  py: number,
  from: number,
  to: number,
): Projection {
  const ax = index.xs[i];
  const ay = index.ys[i];
  const dx = index.xs[i + 1] - ax;
  const dy = index.ys[i + 1] - ay;
  const length = Math.hypot(dx, dy);
  const start = index.cumulative[i];
  const tMin = length > 0 ? Math.max(0, (from - start) / length) : 0;
  const tMax = length > 0 ? Math.min(1, (to - start) / length) : 0;
  const free = length > 0 ? ((px - ax) * dx + (py - ay) * dy) / (length * length) : 0;
  const t = Math.min(tMax, Math.max(tMin, free));
  return {
    lineMeters: start + t * length,
    offsetMeters: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)),
  };
}

/**
 * Nearest point on the line between `from` and `to` metres along it.
 *
 * The window bounds the PROJECTED point, not just which segments are looked
 * at: a long segment that merely overlaps the window cannot place a match
 * outside it.
 */
function nearest(index: Pick<RouteIndex, 'xs' | 'ys' | 'cumulative'>, px: number, py: number, from = -Infinity, to = Infinity): Projection | null {
  let best: Projection | null = null;
  for (let i = 0; i < index.xs.length - 1; i += 1) {
    if (index.cumulative[i + 1] < from || index.cumulative[i] > to) continue;
    const candidate = projectOnSegment(index, i, px, py, from, to);
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

  // An access point set back from the water (a park entrance, a lake ramp
  // past the line's end) cannot calibrate it. It is left out, not allowed to
  // refuse the whole river; endpointIsReliable keeps it from being an end.
  const geometry = { xs, ys, cumulative };
  const placed: { lineMeters: number; riverMile: number }[] = [];
  for (const anchor of usable) {
    const [x, y] = project(cosLat, anchor.lngLat);
    const hit = nearest(geometry, x, y);
    if (hit && hit.offsetMeters <= ANCHOR_TOLERANCE_M) placed.push({ lineMeters: hit.lineMeters, riverMile: anchor.riverMile });
  }
  if (placed.length < 2) return { ok: false, reason: 'anchor-off-line' };
  placed.sort((a, b) => a.lineMeters - b.lineMeters);

  // Every span calibration uses must agree with its miles, not just the total:
  // one bad mile can be invisible end to end and still turn 100 m into three
  // miles. Calibration uses the largest set of access points whose spans all
  // agree, in either direction along the line; the rest are left out, and
  // their neighbours calibrate that part of the line. No single access point,
  // the outermost included, can refuse a river the others agree on.
  const kept = [consistentChain(placed, 1), consistentChain(placed, -1)].reduce((a, b) => (b.length > a.length ? b : a));
  if (kept.length < 2) {
    const flat = placed.every((anchor) => anchor.riverMile === placed[0].riverMile);
    return { ok: false, reason: flat ? 'anchors-out-of-order' : 'length-disagreement' };
  }

  return {
    ok: true,
    index: { xs, ys, cumulative, lengthMeters, anchors: kept, cosLat, excludedAnchors: usable.length - kept.length },
  };
}

/**
 * The longest run of anchors, in line order, in which every neighbouring pair
 * agrees (spanAgrees) with miles running in `direction`. A river has a few
 * dozen access points at most, so the quadratic search is nothing.
 */
function consistentChain<T extends { lineMeters: number; riverMile: number }>(placed: readonly T[], direction: number): T[] {
  const length = placed.map(() => 1);
  const previous = placed.map(() => -1);
  for (let j = 1; j < placed.length; j += 1) {
    for (let i = 0; i < j; i += 1) {
      if (length[i] + 1 > length[j] && spanAgrees(placed[i], placed[j], direction)) {
        length[j] = length[i] + 1;
        previous[j] = i;
      }
    }
  }
  const chain: T[] = [];
  for (let at = length.indexOf(Math.max(...length)); at >= 0; at = previous[at]) chain.unshift(placed[at]);
  return chain;
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

/**
 * Where one point falls on the route, with no tracking history: for choosing
 * among take-outs before a float starts, never for progress. Progress always
 * goes through trackFix, which will not trust a single fix.
 */
export function locateOnRoute(
  index: RouteIndex,
  lngLat: LngLat,
): { riverMile: number; lineMeters: number; offsetMeters: number } | null {
  const [x, y] = project(index.cosLat, lngLat);
  const hit = nearest(index, x, y);
  return hit ? { riverMile: riverMileAt(index, hit.lineMeters), lineMeters: hit.lineMeters, offsetMeters: hit.offsetMeters } : null;
}

/** The point on the line at a distance along it, for drawing a matched position. */
export function pointAt(index: RouteIndex, lineMeters: number): LngLat {
  const along = Math.min(index.lengthMeters, Math.max(0, lineMeters));
  let i = 0;
  while (i < index.xs.length - 2 && index.cumulative[i + 1] < along) i += 1;
  const span = index.cumulative[i + 1] - index.cumulative[i];
  const t = span > 0 ? (along - index.cumulative[i]) / span : 0;
  const x = index.xs[i] + t * (index.xs[i + 1] - index.xs[i]);
  const y = index.ys[i] + t * (index.ys[i + 1] - index.ys[i]);
  return [x / (index.cosLat * METERS_PER_DEGREE), y / METERS_PER_DEGREE];
}

export interface PositionFix {
  lngLat: LngLat;
  /** Horizontal accuracy in metres; null means unknown and is not used. */
  accuracyMeters: number | null;
  /** Epoch milliseconds when the fix was taken. */
  timestamp: number;
}

/** A position on the line at a moment. */
interface LinePosition {
  lineMeters: number;
  timestamp: number;
}

/**
 * What the tracker remembers between fixes. Plain data: the session layer
 * persists it with the float and passes it back in, so a relaunch resumes it.
 */
export interface TrackState {
  /** The position progress and pace are based on; null until acquired. */
  committed: LinePosition | null;
  /** A position outside the window that later fixes may confirm. */
  candidate: (LinePosition & { support: number }) | null;
  /** Timestamp of the last fix that was not rejected. */
  lastFixAt: number | null;
}

export const INITIAL_TRACK: TrackState = { committed: null, candidate: null, lastFixAt: null };

export type TrackResult =
  | {
      kind: 'matched';
      lineMeters: number;
      riverMile: number;
      offsetMeters: number;
      /**
       * False when this commits a position that is not reachable from the
       * previous one: the first acquisition, or a confirmed relocation.
       */
      continuous: boolean;
    }
  /**
   * On the river, but where is not settled yet. 'acquiring' before the first
   * committed position; 'reacquiring' after a gap longer than
   * REACQUIRE_AFTER_MS; 'relocating' while a competing position is being
   * confirmed. The committed position and its timestamp are held: show the
   * last reliable values as not live.
   */
  | { kind: 'uncertain'; reason: 'acquiring' | 'reacquiring' | 'relocating' }
  | { kind: 'off-route'; offsetMeters: number }
  | { kind: 'rejected'; reason: 'inaccurate' | 'stale' | 'out-of-order' };

/** Room to move between two moments, given the fix's own accuracy. */
function reach(fromTimestamp: number, toTimestamp: number, accuracy: number): number {
  return (MAX_SPEED_MPS * (toTimestamp - fromTimestamp)) / 1000 + accuracy + WINDOW_SLACK_M;
}

/**
 * Feed one fix to the tracker.
 *
 * Returns the next state and what to show. Rejected fixes leave the state
 * untouched. Only a 'matched' result moves progress.
 */
export function trackFix(
  index: RouteIndex,
  state: TrackState,
  fix: PositionFix,
  now: number,
): { state: TrackState; result: TrackResult } {
  const accuracy = fix.accuracyMeters;
  if (accuracy == null || !Number.isFinite(accuracy) || accuracy > MAX_ACCURACY_M) {
    return { state, result: { kind: 'rejected', reason: 'inaccurate' } };
  }
  if (now - fix.timestamp > STALE_FIX_MS) return { state, result: { kind: 'rejected', reason: 'stale' } };
  if (state.lastFixAt != null && fix.timestamp <= state.lastFixAt) {
    return { state, result: { kind: 'rejected', reason: 'out-of-order' } };
  }

  const [x, y] = project(index.cosLat, fix.lngLat);
  const tolerance = OFF_ROUTE_BASE_M + accuracy;
  const { committed } = state;
  // A committed position too old to bound the search is kept for display,
  // but matching starts over from confirmation.
  const tracking = committed != null && fix.timestamp - committed.timestamp <= REACQUIRE_AFTER_MS;

  // Within reach of the committed position: the clamped window guarantees the
  // displacement is physically plausible.
  let local: Projection | null = null;
  if (tracking) {
    const room = reach(committed!.timestamp, fix.timestamp, accuracy);
    local = nearest(index, x, y, committed!.lineMeters - room, committed!.lineMeters + room);
  }
  const localFits = local != null && local.offsetMeters <= tolerance;

  // Anywhere on the line. While tracking, it challenges only from outside the
  // window and only when it fits clearly better than the local match.
  const global = nearest(index, x, y);
  const challenges =
    global != null &&
    global.offsetMeters <= tolerance &&
    (!tracking ||
      (Math.abs(global.lineMeters - committed!.lineMeters) > reach(committed!.timestamp, fix.timestamp, accuracy) &&
        (!localFits || global.offsetMeters + CHALLENGE_MARGIN_M < local!.offsetMeters)));

  let candidate: TrackState['candidate'] = null;
  if (challenges) {
    const previous = state.candidate;
    // Agreement must be recent: support gathered before a long gap says
    // nothing about where a fix after it is, so the count starts over.
    const agrees =
      previous != null &&
      fix.timestamp - previous.timestamp <= REACQUIRE_AFTER_MS &&
      Math.abs(global!.lineMeters - previous.lineMeters) <= reach(previous.timestamp, fix.timestamp, accuracy);
    candidate = { lineMeters: global!.lineMeters, timestamp: fix.timestamp, support: agrees ? previous!.support + 1 : 1 };
  }

  const base = { lastFixAt: fix.timestamp };

  if (candidate && candidate.support >= CONFIRM_FIXES) {
    return {
      state: { ...base, committed: { lineMeters: candidate.lineMeters, timestamp: fix.timestamp }, candidate: null },
      result: {
        kind: 'matched',
        lineMeters: candidate.lineMeters,
        riverMile: riverMileAt(index, candidate.lineMeters),
        offsetMeters: global!.offsetMeters,
        continuous: false,
      },
    };
  }

  // A credible competitor is being confirmed: neither position is reliable
  // yet, so hold the committed one, timestamp included, and say so.
  if (candidate) {
    return {
      state: { ...base, committed, candidate },
      result: { kind: 'uncertain', reason: !committed ? 'acquiring' : tracking ? 'relocating' : 'reacquiring' },
    };
  }

  if (localFits) {
    return {
      state: { ...base, committed: { lineMeters: local!.lineMeters, timestamp: fix.timestamp }, candidate: null },
      result: {
        kind: 'matched',
        lineMeters: local!.lineMeters,
        riverMile: riverMileAt(index, local!.lineMeters),
        offsetMeters: local!.offsetMeters,
        continuous: true,
      },
    };
  }

  const offset = Math.min(local?.offsetMeters ?? Infinity, global?.offsetMeters ?? Infinity);
  return { state: { ...base, committed, candidate: null }, result: { kind: 'off-route', offsetMeters: offset } };
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
