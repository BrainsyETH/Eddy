// eddy-ios/src/lib/floatSession.ts
// One float on the water: what it is, what it has seen, and what to show.
//
// Pure data and functions, no React, GPS or storage, so the web suite can test
// it (missouri-float-planner/src/lib/float-session.test.ts) and so a session is
// plain JSON the provider can persist and restore after the app is killed.
//
// ── What a session carries ──────────────────────────────────────────────────
//
// Everything needed to keep going with no network: the river line and the
// access points that calibrate it, copied in at start. A background refresh of
// the river cache must not change the distance basis mid-float (#1448), and a
// cold launch at the put-in must not depend on the cache still being there.
//
// It also carries the tracker state and the committed positions pace is read
// from, so a relaunch resumes rather than restarts. A relaunch does NOT resume
// live progress: the first fix after it goes through reacquisition like any
// other gap, because nobody knows what happened while the app was gone.
//
// ── Two ways to start ───────────────────────────────────────────────────────
//
//   saved   from a saved float: progress runs put-in to take-out, so starting
//           partway down reads as already partly done.
//   quick   from wherever you are: the start is the first confirmed position,
//           recorded once and kept, so the percentage means the same thing
//           after a relaunch.
//
// Either way there must be a take-out. Without one there are no miles left,
// no percentage and no time left, which is the whole feature.

import type { MapAccessPoint, RiverDetail } from '@eddy/types';
import {
  INITIAL_TRACK,
  buildRouteIndex,
  estimateRemaining,
  milesBetween,
  movingPace,
  pointAt,
  stretchProgress,
  trackFix,
  type LngLat,
  type PaceSample,
  type PositionFix,
  type RemainingEstimate,
  type RouteIndex,
  type RouteRefusal,
  type TrackResult,
  type TrackState,
} from '@eddy/geo';

/** Bumped when the stored shape changes; older sessions are not restored. */
export const SESSION_VERSION = 1;

/**
 * Committed positions are kept for pace at most this often. The tracker still
 * sees every fix; pace needs minutes of history, not seconds, and iOS can
 * deliver a fix every second in the foreground.
 */
export const SAMPLE_SPACING_MS = 10_000;

/**
 * Committed positions kept for pace: about seven hours at SAMPLE_SPACING_MS.
 * Pace needs fifteen minutes of moving plus any stop in progress, so even a
 * long lunch leaves the moving history it reads from.
 */
export const MAX_SAMPLES = 2_500;

/** A stored position older than this is not shown as current. */
export const STALE_POSITION_MS = 2 * 60_000;

export interface RouteAnchor {
  id: string;
  name: string;
  lngLat: LngLat;
  riverMile: number;
  /** May end a float; see MapAccessPoint.isFloatEndpoint. */
  endpoint: boolean;
}

/** The essential, offline part of a float: copied in at start and never refreshed. */
export interface FloatRoute {
  riverSlug: string;
  riverName: string;
  line: LngLat[];
  anchors: RouteAnchor[];
  /** When the river data was fetched, for display only. */
  fetchedAt: string | null;
}

export interface FloatEnd {
  id: string;
  name: string;
  riverMile: number;
}

export interface FloatSession {
  version: typeof SESSION_VERSION;
  /** Device-local; never a share code, so it cannot collide with saved floats. */
  id: string;
  kind: 'saved' | 'quick';
  /** The saved float this started from, to link back to it. */
  shortCode: string | null;
  route: FloatRoute;
  putIn: FloatEnd | null;
  takeOut: FloatEnd;
  /** Planner MOVING speed when a current estimate existed at start. */
  plannerMph: number | null;
  startedAt: number;
  /**
   * Where progress is measured from. The put-in for a saved float; for a quick
   * start, the first confirmed position, null until there is one.
   */
  startMile: number | null;
  track: TrackState;
  samples: PaceSample[];
  /** The most recent tracker verdict, for the status line. */
  last: { result: TrackResult; at: number } | null;
  /** The last confirmed position, on the line, for the map dot. */
  position: { lngLat: LngLat; at: number } | null;
}

export type RouteProblem = RouteRefusal | 'no-river-data' | 'no-take-out' | 'take-out-upstream';

/** Shape cached river data into a route, or say exactly why it cannot be used. */
export function routeFromRiver(
  river: Pick<RiverDetail, 'slug' | 'name' | 'geometry'> | null | undefined,
  accessPoints: readonly MapAccessPoint[] | null | undefined,
  fetchedAt: string | null,
): { ok: true; route: FloatRoute; index: RouteIndex } | { ok: false; reason: RouteProblem } {
  if (!river || !accessPoints) return { ok: false, reason: 'no-river-data' };
  const anchors: RouteAnchor[] = accessPoints
    .filter((point) => Number.isFinite(point.riverMile) && point.coordinates)
    .map((point) => ({
      id: point.id,
      name: point.name,
      lngLat: [point.coordinates.lng, point.coordinates.lat],
      riverMile: point.riverMile,
      // Absent means eligible: payloads predating the field had no such limit.
      endpoint: point.isFloatEndpoint !== false,
    }));
  const route: FloatRoute = {
    riverSlug: river.slug,
    riverName: river.name,
    line: river.geometry?.coordinates ?? [],
    anchors,
    fetchedAt,
  };
  const built = indexRoute(route);
  return built.ok ? { ok: true, route, index: built.index } : built;
}

/** Rebuild the calibrated index from a route; used at start and on restore. */
export function indexRoute(route: FloatRoute): { ok: true; index: RouteIndex } | { ok: false; reason: RouteRefusal } {
  const result = buildRouteIndex(route.line, route.anchors.map(({ lngLat, riverMile }) => ({ lngLat, riverMile })));
  return result.ok ? { ok: true, index: result.index } : { ok: false, reason: result.reason };
}

/**
 * Take-outs a quick start can choose: endpoints downstream of where you are,
 * nearest first. River miles count from the headwaters, so downstream is a
 * larger mile. With no confirmed position yet, every endpoint is offered and
 * the choice is checked again once one exists.
 */
export function takeOutChoices(route: FloatRoute, currentMile: number | null): RouteAnchor[] {
  return route.anchors
    .filter((anchor) => anchor.endpoint && (currentMile == null || anchor.riverMile > currentMile))
    .sort((a, b) => a.riverMile - b.riverMile);
}

function end(anchor: RouteAnchor): FloatEnd {
  return { id: anchor.id, name: anchor.name, riverMile: anchor.riverMile };
}

export function startSession(input: {
  id: string;
  kind: 'saved' | 'quick';
  shortCode?: string | null;
  route: FloatRoute;
  putInId?: string | null;
  takeOutId: string;
  plannerMph?: number | null;
  now: number;
}): { ok: true; session: FloatSession } | { ok: false; reason: RouteProblem } {
  const takeOut = input.route.anchors.find((anchor) => anchor.id === input.takeOutId);
  if (!takeOut) return { ok: false, reason: 'no-take-out' };
  const putIn = input.putInId ? input.route.anchors.find((anchor) => anchor.id === input.putInId) ?? null : null;
  if (input.kind === 'saved' && !putIn) return { ok: false, reason: 'no-river-data' };
  if (putIn && takeOut.riverMile <= putIn.riverMile) return { ok: false, reason: 'take-out-upstream' };
  return {
    ok: true,
    session: {
      version: SESSION_VERSION,
      id: input.id,
      kind: input.kind,
      shortCode: input.shortCode ?? null,
      route: input.route,
      putIn: putIn ? end(putIn) : null,
      takeOut: end(takeOut),
      plannerMph: input.plannerMph != null && input.plannerMph > 0 ? input.plannerMph : null,
      startedAt: input.now,
      startMile: putIn ? putIn.riverMile : null,
      track: INITIAL_TRACK,
      samples: [],
      last: null,
      position: null,
    },
  };
}

/** Feed one GPS fix. Returns the same object when nothing changed. */
export function applyFix(session: FloatSession, index: RouteIndex, fix: PositionFix, now: number): FloatSession {
  const step = trackFix(index, session.track, fix, now);
  if (step.result.kind === 'rejected') return session;
  const next: FloatSession = { ...session, track: step.state, last: { result: step.result, at: fix.timestamp } };
  if (step.result.kind === 'matched') {
    next.position = { lngLat: pointAt(index, step.result.lineMeters), at: fix.timestamp };
    const sample: PaceSample = { timestamp: fix.timestamp, riverMile: step.result.riverMile, continuous: step.result.continuous };
    const previous = session.samples[session.samples.length - 1];
    // A discontinuous sample is always kept: it marks a jump pace must not
    // read as movement.
    if (!previous || !sample.continuous || sample.timestamp - previous.timestamp >= SAMPLE_SPACING_MS) {
      next.samples = [...session.samples, sample].slice(-MAX_SAMPLES);
    }
    // A quick start begins where the paddler is first confirmed to be. If that
    // is already past the chosen take-out, the session reports it rather than
    // inventing a start.
    if (next.startMile == null) next.startMile = step.result.riverMile;
  }
  return next;
}

export type FloatStatus =
  /** No confirmed position yet. */
  | 'acquiring'
  /** Position is confirmed and recent. */
  | 'live'
  /** A newer fix is being confirmed; showing the last reliable values. */
  | 'uncertain'
  /** The latest fix is away from the river. */
  | 'off-route'
  /** No fix recently: GPS lost, or the app was away. */
  | 'stale';

export interface FloatView {
  status: FloatStatus;
  riverName: string;
  takeOutName: string;
  /** Null until a position is confirmed. */
  milesLeft: number | null;
  /** 0-1; null until a position is confirmed. */
  fraction: number | null;
  arrived: boolean;
  pastEnd: boolean;
  /** The quick start began past the chosen take-out. */
  startedPastTakeOut: boolean;
  estimate: RemainingEstimate;
  /** When the shown position was confirmed. */
  positionAt: number | null;
}

/** What the screen shows, derived fresh each time; nothing here is stored. */
export function viewSession(session: FloatSession, now: number): FloatView {
  const latest = session.samples[session.samples.length - 1] ?? null;
  const base = {
    riverName: session.route.riverName,
    takeOutName: session.takeOut.name,
    positionAt: latest?.timestamp ?? null,
  };
  const estimate = (miles: number | null): RemainingEstimate =>
    miles == null
      ? { minutes: null, basis: 'learning', paused: false }
      : estimateRemaining(miles, session.plannerMph, movingPace(session.samples, 1));

  if (!latest || session.startMile == null) {
    return {
      ...base,
      status: 'acquiring',
      milesLeft: null,
      fraction: null,
      arrived: false,
      pastEnd: false,
      startedPastTakeOut: false,
      estimate: estimate(null),
    };
  }

  const progress = stretchProgress(session.startMile, session.takeOut.riverMile, latest.riverMile);
  const startedPastTakeOut = session.kind === 'quick' && session.startMile >= session.takeOut.riverMile;
  const lastKind = session.last?.result.kind;
  const status: FloatStatus =
    now - latest.timestamp > STALE_POSITION_MS
      ? 'stale'
      : lastKind === 'uncertain'
        ? 'uncertain'
        : lastKind === 'off-route'
          ? 'off-route'
          : 'live';

  return {
    ...base,
    status,
    milesLeft: Math.max(0, progress.remainingMiles),
    fraction: startedPastTakeOut ? null : progress.fraction,
    arrived: progress.arrived,
    pastEnd: progress.pastEnd,
    startedPastTakeOut,
    estimate: estimate(progress.remainingMiles),
  };
}

/** Parse a stored session, or null if it is missing, corrupt or from another version. */
export function restoreSession(raw: string | null): FloatSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<FloatSession>;
    if (parsed?.version !== SESSION_VERSION || !parsed.id || !parsed.route || !parsed.takeOut || !parsed.track) return null;
    return { ...parsed, position: parsed.position ?? null } as FloatSession;
  } catch {
    return null;
  }
}

export interface RiverSuggestion {
  slug: string;
  name: string;
  /** Straight-line miles to the river's nearest put-in or take-out; never driving distance. */
  miles: number;
}

/**
 * Rivers near a position, nearest first, for the quick-start picker.
 *
 * A suggestion, never a choice: the person confirms the river, because near a
 * confluence the nearest access point can belong to the wrong one. Rivers
 * with no known access coordinates are left out rather than guessed at.
 */
export function suggestRivers(
  rivers: readonly { slug: string; name: string; floatAccessCoordinates?: { lat: number; lng: number }[] }[],
  here: { lat: number; lng: number },
  limit = 5,
): RiverSuggestion[] {
  const suggestions: RiverSuggestion[] = [];
  for (const river of rivers) {
    const points = river.floatAccessCoordinates ?? [];
    if (points.length === 0) continue;
    const miles = Math.min(...points.map((point) => milesBetween(here, point)));
    suggestions.push({ slug: river.slug, name: river.name, miles });
  }
  return suggestions.sort((a, b) => a.miles - b.miles).slice(0, limit);
}

/** "1 hr 40 min", "45 min": the precision a five-minute estimate deserves. */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

/**
 * The time-left line and the note under it. Never says "current pace": the
 * pace is a recent average, and while paused it is an earlier one.
 */
export function remainingCopy(estimate: RemainingEstimate): { headline: string; note: string } {
  if (estimate.minutes == null) {
    return { headline: 'Learning your pace', note: 'Time left appears after a few minutes on the water.' };
  }
  if (estimate.minutes === 0) return { headline: 'At the take-out', note: '' };
  const time = `About ${formatDuration(estimate.minutes)}`;
  if (estimate.paused) {
    return { headline: time, note: 'At your earlier pace. You look stopped, so this holds until you move again.' };
  }
  switch (estimate.basis) {
    case 'planner':
      return { headline: time, note: 'From the plan’s estimate, until Eddy learns your pace. Stops not included.' };
    case 'blended':
    case 'observed':
      return { headline: time, note: 'At your recent pace. Stops not included.' };
    default:
      return { headline: time, note: '' };
  }
}

/** The one-line status above the numbers. */
export function statusCopy(view: FloatView, now: number): string {
  switch (view.status) {
    case 'acquiring':
      return 'Finding your spot on the river…';
    case 'uncertain':
      return 'Checking your position. Showing your last confirmed spot.';
    case 'off-route':
      return 'You look away from the river. Showing your last spot on it.';
    case 'stale': {
      const minutes = view.positionAt == null ? null : Math.round((now - view.positionAt) / 60_000);
      return minutes == null ? 'Waiting for GPS.' : `Waiting for GPS. Last position ${minutes} min ago.`;
    }
    case 'live':
      return view.arrived ? 'You’re at the take-out.' : 'Live';
  }
}
