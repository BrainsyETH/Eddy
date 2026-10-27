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
// A named put-in describes the plan, not the recorded launch. Both saved and
// quick starts measure progress from the first confirmed on-river fix, saved
// once for the map and recap. Older sessions retain their checkpoint semantics.
//
// Either way there must be a take-out. Without one there are no miles left,
// no percentage and no time left, which is the whole feature.

import { latestRawFix, restoreRawFix, validCoordinate, type RawFloatFix } from './floatRawFix';
import { nearLaunch } from './floatOrigin';
import type { Hazard, HazardSeverity, MapAccessPoint, RiverDetail } from '@eddy/types';
import {
  INITIAL_TRACK,
  accumulateFloat,
  EMPTY_FLOAT_TOTALS,
  type FloatTotals,
  buildRouteIndex,
  locateOnRoute,
  estimateRemaining,
  milesBetween,
  movingPace,
  pointAt,
  stretchProgress,
  lineMetersAtMile,
  sliceLine,
  sunsetAt,
  trackFix,
  type LngLat,
  type PaceSample,
  type PositionFix,
  type RemainingEstimate,
  type RouteIndex,
  type RouteRefusal,
  ARRIVAL_MILES,
  type TrackResult,
  type TrackState,
} from '@eddy/geo';
import type { FloatReminderSettings } from './floatReminders';

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

/**
 * A known hazard on the route, placed on the calibrated line at start so
 * "how far to it" uses the same miles as everything else on the screen.
 */
export interface RouteHazard {
  id: string;
  name: string;
  type: string;
  severity: HazardSeverity;
  portageRequired: boolean | null;
  portageSide: 'left' | 'right' | 'either' | null;
  lngLat: LngLat;
  /** Calibrated mile where it sits on the line (not the published mile). */
  riverMile: number;
}

/** The essential, offline part of a float: copied in at start and never refreshed. */
export interface FloatRoute {
  riverSlug: string;
  riverName: string;
  line: LngLat[];
  anchors: RouteAnchor[];
  /**
   * Known hazards, copied in at start like the line so they work with no
   * signal. Absent on floats started before hazards were carried, and on trip
   * downloads saved before then; both simply show none.
   */
  hazards?: RouteHazard[];
  /** When the river data was fetched, for display only. */
  fetchedAt: string | null;
}

export interface FloatEnd {
  id: string;
  name: string;
  /** Calibrated mile of the river's closest point to this end. */
  riverMile: number;
  /**
   * How far the access point itself sits from that closest point, in metres,
   * when it is beyond OFF_LINE_END_M: a launch off the mapped river (Buffalo
   * City is a kilometre down the White). Reaching the river's closest point is
   * then NOT arriving. Absent for ends on the river, and on floats started
   * before this was recorded.
   */
  offLineMeters?: number;
}

export interface FloatSession {
  version: typeof SESSION_VERSION;
  /** Device-local; never a share code, so it cannot collide with saved floats. */
  id: string;
  kind: 'saved' | 'quick';
  /** The saved float this started from, to link back to it. */
  shortCode: string | null;
  /** Offline package identity is separate from this recording’s unique id. */
  downloadKey?: string;
  route: FloatRoute;
  putIn: FloatEnd | null;
  takeOut: FloatEnd;
  /** Planner MOVING speed when a current estimate existed at start. */
  plannerMph: number | null;
  startedAt: number;
  /**
   * First confirmed recording mile, null until GPS confirms it. Older sessions
   * retain their existing progress origin when restored.
   */
  startMile: number | null;
  /** Null until confirmed. Absent on older sessions: never infer a GPS point. */
  recordedStart?: { riverMile: number; lngLat: LngLat; at: number; atPutIn: boolean } | null;
  /** Accurate post-Start fixes at the actual access; never inferred from its river mile. */
  observedLaunch?: { id: string; at: number };
  /** Short-lived support while confirming a launch, before the first river match. */
  launchCandidate?: { firstAt: number; lastAt: number; support: number } | null;
  track: TrackState;
  samples: PaceSample[];
  /** Durable accounting; absent on sessions started by an older build. */
  totals?: FloatTotals;
  archiveScope?: string;
  boatType?: string | null;
  /** The most recent tracker verdict, for the status line. */
  last: { result: TrackResult; at: number; nearPutIn?: boolean } | null;
  /** The last confirmed position on the line; legacy display fallback. */
  position: { lngLat: LngLat; at: number } | null;
  /** Latest valid raw recorder fix, including coarse fixes. Never drives progress. */
  lastFix?: RawFloatFix | null;
  /** Latest usable GPS fix for display, even off-river. Never used for progress or ETA. */
  gpsPosition?: { lngLat: LngLat; at: number; accuracyMeters?: number | null; restored?: true } | null;
  /**
   * Restored after a relaunch and not yet re-confirmed. Progress is kept, but
   * nothing is live until fresh fixes confirm a position again.
   */
  awaitingFix?: boolean;
  /**
   * The byte offset in this float's native journal that the session has
   * applied up to (floatRecording.ts). Saved with the progress derived from
   * those fixes, so a relaunch replays exactly what came after. Absent on
   * floats started before recording was native: they replay from 0, and
   * fixes older than what the session already holds are ignored by applyFix.
   */
  journalTo?: number;
  /** On-water reminders; see floatReminders.ts. Absent means the defaults. */
  reminders?: FloatReminderSettings;
  /**
   * When a confirmed position first reached the take-out. The float's
   * on-water time ends here; accounting stops, and the recap counts the
   * take-out as reached however late Finish is tapped. Never set for a
   * take-out off the mapped river: see riverEndAt.
   */
  arrivedAt?: number | null;
  /**
   * For a take-out off the mapped river (Buffalo City, a kilometre down the
   * White): when a confirmed position first reached the river's closest point
   * to it. Tracking can follow no further, but the paddler has NOT arrived:
   * the take-out is still offLineMeters away, so this is never reported as
   * reaching it.
   */
  riverEndAt?: number | null;
  /**
   * When fixes started placing the paddler well away from the river (more
   * than AWAY_FROM_RIVER_M), with every usable fix since agreeing: they have
   * most likely left it. Drives "Still floating?" and the automatic end
   * (floatEnding.ts). Any usable fix that does not show them that far away
   * (on the river, being re-confirmed on it, or on a bank) clears it.
   */
  awaySince?: number | null;
}

/**
 * Fixes farther than this from the river line mean the paddler has left it,
 * not that they are on a gravel bar, a wide eddy or a bank: a campsite or a
 * lunch stop sits well inside it, a car on the road home soon does not.
 */
export const AWAY_FROM_RIVER_M = 1_000;

export type RouteProblem = RouteRefusal | 'no-river-data' | 'no-take-out' | 'take-out-upstream';

/**
 * The mile a float's end is measured at: the calibrated mile where that access
 * point actually sits on the line. Every float endpoint is usable. For one that
 * calibrates the line this IS its own river mile; for one calibration left out
 * (its published mile disagrees with its neighbours), its position decides,
 * because that is where the paddler actually lands. Endpoints are vetted
 * server-side for distance from the channel (access_point_offline, with
 * recorded exceptions such as Buffalo City), so the position is trusted.
 */
export function endMile(index: RouteIndex, anchor: RouteAnchor): number {
  return locateOnRoute(index, anchor.lngLat)?.riverMile ?? anchor.riverMile;
}

/**
 * Farther than this from the river line, an end is "off the mapped river":
 * the line ends, or passes, short of it. About the tracker's own on-river
 * allowance plus a bank; ordinary snapped launches sit well inside it.
 */
export const OFF_LINE_END_M = 150;

/** An end as the float measures it: its river mile, and whether it is off the line. */
export function placeEnd(index: RouteIndex, anchor: RouteAnchor): FloatEnd {
  const placed = locateOnRoute(index, anchor.lngLat);
  const offLine = placed && placed.offsetMeters > OFF_LINE_END_M ? Math.round(placed.offsetMeters) : undefined;
  return {
    id: anchor.id,
    name: anchor.name,
    riverMile: placed?.riverMile ?? anchor.riverMile,
    ...(offLine != null ? { offLineMeters: offLine } : {}),
  };
}

/** Shape cached river data into a route, or say exactly why it cannot be used. */
export function routeFromRiver(
  river: Pick<RiverDetail, 'slug' | 'name' | 'geometry'> | null | undefined,
  accessPoints: readonly MapAccessPoint[] | null | undefined,
  fetchedAt: string | null,
  hazards: readonly Hazard[] | null | undefined = null,
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
  if (!built.ok) return built;
  const placed = placeHazards(built.index, hazards ?? []);
  return { ok: true, route: placed.length > 0 ? { ...route, hazards: placed } : route, index: built.index };
}

/**
 * A hazard farther than this from the line is not placed: its coordinate is
 * wrong or it belongs to a tributary, and a distance to it would be invented.
 */
export const HAZARD_OFF_LINE_M = 300;

/** Place hazards on the calibrated line, in river order; ones off the line are left out. */
export function placeHazards(index: RouteIndex, hazards: readonly Hazard[]): RouteHazard[] {
  const placed: RouteHazard[] = [];
  for (const hazard of hazards) {
    if (!hazard.coordinates || !Number.isFinite(hazard.coordinates.lng) || !Number.isFinite(hazard.coordinates.lat)) continue;
    const lngLat: LngLat = [hazard.coordinates.lng, hazard.coordinates.lat];
    const hit = locateOnRoute(index, lngLat);
    if (!hit || hit.offsetMeters > HAZARD_OFF_LINE_M) continue;
    placed.push({
      id: hazard.id,
      name: hazard.name,
      type: hazard.type,
      severity: hazard.severity,
      portageRequired: hazard.portageRequired ?? null,
      portageSide: hazard.portageSide ?? null,
      lngLat,
      riverMile: hit.riverMile,
    });
  }
  return placed.sort((a, b) => a.riverMile - b.riverMile);
}

/** Copy hazards into a route that lacks them (a trip download saved before they were carried). */
export function withHazards(route: FloatRoute, index: RouteIndex, hazards: readonly Hazard[] | null | undefined): FloatRoute {
  if (route.hazards || !hazards?.length) return route;
  const placed = placeHazards(index, hazards);
  return placed.length > 0 ? { ...route, hazards: placed } : route;
}

/** Rebuild the calibrated index from a route; used at start and on restore. */
export function indexRoute(route: FloatRoute): { ok: true; index: RouteIndex } | { ok: false; reason: RouteRefusal } {
  const result = buildRouteIndex(route.line, route.anchors.map(({ lngLat, riverMile }) => ({ lngLat, riverMile })));
  return result.ok ? { ok: true, index: result.index } : { ok: false, reason: result.reason };
}

/** A take-out a quick start can choose, measured the way the float will be. */
export interface TakeOutChoice extends RouteAnchor {
  /** Calibrated mile of the river's closest point to it (placeEnd). */
  mile: number;
  /** Set when the take-out sits off the mapped river; see FloatEnd. */
  offLineMeters?: number;
}

/**
 * Take-outs a quick start can choose: endpoints downstream of where you are,
 * nearest first, each at the calibrated mile the float will use, so a label
 * and the float that follows agree. River miles count from the headwaters, so
 * downstream is a larger mile. With no confirmed position yet, every endpoint
 * is offered and the choice is checked again once one exists.
 */
export function takeOutChoices(route: FloatRoute, index: RouteIndex, currentMile: number | null): TakeOutChoice[] {
  return route.anchors
    .filter((anchor) => anchor.endpoint)
    .map((anchor) => {
      const placed = placeEnd(index, anchor);
      return { ...anchor, mile: placed.riverMile, ...(placed.offLineMeters != null ? { offLineMeters: placed.offLineMeters } : {}) };
    })
    .filter((choice) => currentMile == null || choice.mile > currentMile)
    .sort((a, b) => a.mile - b.mile);
}

export function startSession(input: {
  id: string;
  kind: 'saved' | 'quick';
  shortCode?: string | null;
  downloadKey?: string;
  route: FloatRoute;
  /** The calibrated index of `route`; the ends are measured on it. */
  index: RouteIndex;
  putInId?: string | null;
  takeOutId: string;
  plannerMph?: number | null;
  boatType?: string | null;
  now: number;
}): { ok: true; session: FloatSession } | { ok: false; reason: RouteProblem } {
  const takeOut = input.route.anchors.find((anchor) => anchor.id === input.takeOutId);
  if (!takeOut) return { ok: false, reason: 'no-take-out' };
  const putIn = input.putInId ? input.route.anchors.find((anchor) => anchor.id === input.putInId) ?? null : null;
  if (input.kind === 'saved' && !putIn) return { ok: false, reason: 'no-river-data' };
  // Distance, progress, arrival and time left all hang off these two miles.
  const takeOutEnd = placeEnd(input.index, takeOut);
  const putInEnd = putIn ? placeEnd(input.index, putIn) : null;
  if (putInEnd && takeOutEnd.riverMile <= putInEnd.riverMile) return { ok: false, reason: 'take-out-upstream' };
  return {
    ok: true,
    session: {
      version: SESSION_VERSION,
      id: input.id,
      kind: input.kind,
      shortCode: input.shortCode ?? null,
      downloadKey: input.downloadKey,
      route: input.route,
      putIn: putInEnd,
      takeOut: takeOutEnd,
      plannerMph: input.plannerMph != null && input.plannerMph > 0 ? input.plannerMph : null,
      startedAt: input.now,
      startMile: null,
      recordedStart: null,
      track: INITIAL_TRACK,
      samples: [],
      totals: { ...EMPTY_FLOAT_TOTALS },
      boatType: input.boatType ?? null,
      last: null,
      position: null,
    },
  };
}

/** Feed one GPS fix. Returns the same object when nothing changed. */
export function applyFix(session: FloatSession, index: RouteIndex, fix: PositionFix, now: number): FloatSession {
  if (!Number.isFinite(fix.timestamp) || fix.timestamp < session.startedAt || fix.timestamp > now) return session;
  if (!validCoordinate(fix.lngLat)) return session;
  const previousRaw = session.lastFix ?? restoreRawFix(session.gpsPosition, session.startedAt);
  const lastFix = latestRawFix(previousRaw, fix, session.startedAt, now);
  const rawSession = lastFix !== previousRaw ? { ...session, lastFix } : session;
  const step = trackFix(index, session.track, fix, now);
  if (step.result.kind === 'rejected') return rawSession;
  const putIn = session.route.anchors.find(a => a.id === session.putIn?.id);
  const atLaunch = Boolean(putIn && nearLaunch(fix.lngLat, fix.accuracyMeters, putIn.lngLat));
  const next: FloatSession = { ...rawSession, track: step.state,
    gpsPosition: { lngLat: fix.lngLat, at: fix.timestamp, accuracyMeters: fix.accuracyMeters },
    last: { result: step.result, at: fix.timestamp, nearPutIn: atLaunch } };
  // Three accurate fixes, with no gap over thirty seconds, like river acquisition.
  // A lone outlier, preview GPS, or passing the snapped river point is not a launch.
  // Older checkpoints without recordedStart retain their original semantics.
  if (session.recordedStart === null && !session.observedLaunch) {
    const previous = session.launchCandidate;
    const agrees = previous && fix.timestamp - previous.lastAt <= 30_000;
    next.launchCandidate = atLaunch ? {
      firstAt: agrees ? previous.firstAt : fix.timestamp,
      lastAt: fix.timestamp,
      support: agrees ? previous.support + 1 : 1,
    } : null;
    if (putIn && next.launchCandidate && next.launchCandidate.support >= 3) {
      next.observedLaunch = { id: putIn.id, at: next.launchCandidate.firstAt };
      next.launchCandidate = null;
    }
  }
  // Away only while every usable fix says so; anything nearer starts over.
  // Waiting at an actual off-map launch is not evidence of having left the river.
  const farAway = step.result.kind === 'off-route' && step.result.offsetMeters > AWAY_FROM_RIVER_M &&
    !(session.recordedStart === null && atLaunch);
  next.awaySince = farAway ? (session.awaySince ?? fix.timestamp) : null;
  if (step.result.kind === 'matched') {
    next.awaitingFix = false;
    next.position = { lngLat: pointAt(index, step.result.lineMeters), at: fix.timestamp };
    const sample: PaceSample = { timestamp: fix.timestamp, riverMile: step.result.riverMile, continuous: step.result.continuous };
    const previous = session.samples[session.samples.length - 1];
    // A discontinuous sample is always kept: it marks a jump pace must not
    // read as movement.
    if (!previous || !sample.continuous || sample.timestamp - previous.timestamp >= SAMPLE_SPACING_MS) {
      next.samples = [...session.samples, sample].slice(-MAX_SAMPLES);
      // On-water accounting ends at the take-out: loading the boat, or
      // forgetting to tap Finish, is not part of the float.
      if (session.arrivedAt == null) next.totals = accumulateFloat(session.totals ?? EMPTY_FLOAT_TOTALS, sample);
    }
    // The plan is only a preview. Every new recording starts at its first
    // confirmed fix, even when the paddler chose a named put-in.
    if (next.startMile == null) next.startMile = step.result.riverMile;
    if (session.recordedStart === null) {
      next.recordedStart = {
        riverMile: step.result.riverMile, lngLat: next.position.lngLat, at: fix.timestamp,
        // Keep the existing on-river launch check once the tracker confirms it.
        // Its first acquisition fixes may have been less precise than this one.
        atPutIn: Boolean((next.observedLaunch && next.observedLaunch.id === session.putIn?.id) ||
          (atLaunch && session.putIn && step.result.offsetMeters <= 50 &&
            Math.abs(step.result.riverMile - session.putIn.riverMile) < 0.1)),
      };
      next.launchCandidate = null;
    }
    if (
      next.startMile < session.takeOut.riverMile &&
      stretchProgress(next.startMile, session.takeOut.riverMile, step.result.riverMile).remainingMiles <= ARRIVAL_MILES
    ) {
      // Off the mapped river, the line's end is not the take-out.
      if (session.takeOut.offLineMeters != null) next.riverEndAt = session.riverEndAt ?? fix.timestamp;
      else next.arrivedAt = session.arrivedAt ?? fix.timestamp;
    }
  }
  return next;
}

export type FloatStatus =
  /** No confirmed position yet. */
  | 'acquiring'
  /** Restored after a relaunch; finding the position again. */
  | 'resuming'
  /** Position is confirmed and recent. */
  | 'live'
  /** A newer fix is being confirmed; showing the last reliable values. */
  | 'uncertain'
  /** The latest fix is away from the river. */
  | 'off-route'
  /** No fix recently: GPS lost, or the app was away. */
  | 'stale';

export interface FloatView {
  /**
   * Before the first confirmed position: 'acquiring' while GPS has nothing
   * usable or is still confirming, 'off-route' when GPS works and says the
   * paddler is away from this river, 'stale' when it went quiet.
   */
  status: FloatStatus;
  /**
   * A position on the river has been confirmed this float. False means
   * progress has not started: the statuses above say why.
   */
  confirmed: boolean;
  /** How far the latest fix is from the river line, while off-route. */
  awayMeters: number | null;
  riverName: string;
  takeOutName: string;
  /** Null until a position is confirmed. */
  milesLeft: number | null;
  /** 0-1; null until a position is confirmed. */
  fraction: number | null;
  /** At the take-out itself. Never true for a take-out off the mapped river. */
  arrived: boolean;
  /**
   * At the river's closest point to a take-out that sits off the mapped
   * river: tracking can go no further, and the take-out is still
   * takeOutBeyondMeters away.
   */
  atRiverEnd: boolean;
  /** How far the take-out sits from the river line, when it is off it. */
  takeOutBeyondMeters: number | null;
  pastEnd: boolean;
  /** The quick start began past the chosen take-out. */
  startedPastTakeOut: boolean;
  estimate: RemainingEstimate;
  /** When the shown position was confirmed. */
  positionAt: number | null;
  /**
   * When GPS last gave a usable fix, on the river or not. Staleness is
   * measured from this: a paddler on a bank away from the line has GPS, and
   * is told they look away from the river, not that GPS is lost.
   */
  lastFixAt: number | null;
  /** The next known hazard ahead, before the take-out; null when none or no position. */
  nextHazard: { hazard: RouteHazard; milesAway: number } | null;
}

/** The next hazard downstream of `mile` and short of the take-out. */
export function hazardAhead(session: FloatSession, mile: number | null): { hazard: RouteHazard; milesAway: number } | null {
  if (mile == null) return null;
  const hazard = (session.route.hazards ?? []).find((h) => h.riverMile > mile && h.riverMile <= session.takeOut.riverMile);
  return hazard ? { hazard, milesAway: hazard.riverMile - mile } : null;
}

/** What the screen shows, derived fresh each time; nothing here is stored. */
export function viewSession(session: FloatSession, now: number): FloatView {
  const latest = session.samples[session.samples.length - 1] ?? null;
  const beyond = session.takeOut.offLineMeters ?? null;
  const lastFixAt = Math.max(session.track.lastFixAt ?? 0, latest?.timestamp ?? 0) || null;
  const base = {
    riverName: session.route.riverName,
    takeOutName: session.takeOut.name,
    positionAt: latest?.timestamp ?? null,
    lastFixAt,
    takeOutBeyondMeters: beyond,
  };
  const estimate = (miles: number | null): RemainingEstimate =>
    miles == null
      ? { minutes: null, basis: 'learning', paused: false }
      : estimateRemaining(miles, session.plannerMph, movingPace(session.samples, 1));

  const lastResult = session.last?.result ?? null;
  const awayMeters = lastResult?.kind === 'off-route' ? lastResult.offsetMeters : null;

  if (!latest || session.startMile == null) {
    // GPS can be working before anything is confirmed: say what it says,
    // rather than "finding your spot" forever while it says "not here".
    const status: FloatStatus =
      lastFixAt == null
        ? 'acquiring'
        : now - lastFixAt > STALE_POSITION_MS
          ? 'stale'
          : lastResult?.kind === 'off-route'
            ? 'off-route'
            : 'acquiring';
    return {
      ...base,
      status,
      confirmed: false,
      awayMeters: status === 'off-route' ? awayMeters : null,
      milesLeft: null,
      fraction: null,
      arrived: false,
      atRiverEnd: false,
      pastEnd: false,
      startedPastTakeOut: false,
      estimate: estimate(null),
      // Until GPS confirms the origin, hazards use the planned stretch.
      nextHazard: hazardAhead(session, session.startMile ?? session.putIn?.riverMile ?? null),
    };
  }

  const progress = stretchProgress(session.startMile, session.takeOut.riverMile, latest.riverMile);
  const startedPastTakeOut = session.startMile >= session.takeOut.riverMile;
  const lastKind = lastResult?.kind;
  const status: FloatStatus = session.awaitingFix
    ? 'resuming'
    : now - (lastFixAt ?? latest.timestamp) > STALE_POSITION_MS
      ? 'stale'
      : lastKind === 'uncertain'
        ? 'uncertain'
        : lastKind === 'off-route'
          ? 'off-route'
          : 'live';

  return {
    ...base,
    status,
    confirmed: true,
    awayMeters: status === 'off-route' ? awayMeters : null,
    milesLeft: Math.max(0, progress.remainingMiles),
    fraction: startedPastTakeOut ? null : progress.fraction,
    arrived: progress.arrived && beyond == null,
    atRiverEnd: progress.arrived && beyond != null,
    pastEnd: progress.pastEnd,
    startedPastTakeOut,
    estimate: estimate(progress.remainingMiles),
    nextHazard: startedPastTakeOut ? null : hazardAhead(session, latest.riverMile),
  };
}

/** What the River Mode map draws: the stretch, the access points along it, its hazards. */
export interface FloatMapFeatures {
  /** Null until a quick start knows where it began; the map then shows the whole river. */
  section: LngLat[] | null;
  /** Access points between the ends, named so the map can label them. */
  stops: { id: string; name: string; lngLat: LngLat; riverMile: number }[];
  hazards: RouteHazard[];
}

export function mapFeatures(session: Pick<FloatSession, 'route' | 'startMile' | 'putIn' | 'takeOut'>, index: RouteIndex): FloatMapFeatures {
  const from = session.startMile ?? session.putIn?.riverMile ?? null;
  const to = session.takeOut.riverMile;
  const between = (mile: number) => (from == null ? mile <= to : mile > from && mile < to);
  const ends = new Set([session.putIn?.id, session.takeOut.id]);
  return {
    section: from == null ? null : sliceLine(index, lineMetersAtMile(index, from), lineMetersAtMile(index, to)),
    stops:
      from == null
        ? []
        : session.route.anchors.flatMap((anchor) => {
            if (ends.has(anchor.id)) return [];
            const riverMile = placeEnd(index, anchor).riverMile;
            return between(riverMile) ? [{ id: anchor.id, name: anchor.name, lngLat: anchor.lngLat, riverMile }] : [];
          }),
    hazards: (session.route.hazards ?? []).filter((hazard) =>
      from == null ? hazard.riverMile <= to : hazard.riverMile >= from && hazard.riverMile <= to,
    ),
  };
}

/**
 * What a tapped map marker says: its name, and where it is relative to the
 * paddler (the last confirmed mile), or its river mile before there is one.
 */
export function markerDistance(markerMile: number, currentMile: number | null): string {
  if (currentMile == null) return `Mile ${markerMile.toFixed(1)}`;
  const ahead = markerMile - currentMile;
  if (Math.abs(ahead) < 0.1) return 'Here';
  return ahead > 0 ? `${ahead.toFixed(1)} mi ahead` : `${(-ahead).toFixed(1)} mi behind`;
}

/** Arriving this close to sunset or later is worth a word. */
export const NEAR_SUNSET_MS = 30 * 60_000;

export type ArrivalOutlook = {
  arriveAt: number;
  sunset: number | null;
  /** 'set': the sun has already set; 'after': arrival after sunset; 'near': within NEAR_SUNSET_MS of it. */
  light: 'day' | 'near' | 'after' | 'set';
};

/**
 * When the take-out is reached at this estimate, against sunset there.
 * People stay a little long on the water; this is the nudge. Null when
 * there is no estimate to place on a clock.
 */
export function arrivalOutlook(minutes: number | null, now: number, at: LngLat): ArrivalOutlook | null {
  if (minutes == null || minutes <= 0) return null;
  const arriveAt = now + minutes * 60_000;
  const sunset = sunsetAt(at[1], at[0], now);
  const light =
    sunset == null ? 'day' : now >= sunset ? 'set' : arriveAt > sunset ? 'after' : arriveAt > sunset - NEAR_SUNSET_MS ? 'near' : 'day';
  return { arriveAt, sunset, light };
}

/**
 * The moment an arrival estimate counts from. Live, that is now: the paddler
 * is where the estimate says, and a pause holds the minutes while the clock
 * moves. Otherwise it is the last confirmed position. Adding the old minutes
 * to the current clock made a stale estimate look freshly calculated and
 * drift later each tick. `asOf` is set when the estimate is not current.
 */
export function arrivalAnchor(view: FloatView, now: number): { from: number; asOf: number | null } | null {
  if (view.status === 'live') return { from: now, asOf: null };
  if (view.positionAt == null) return null;
  return { from: view.positionAt, asOf: view.positionAt };
}

/** The arrival line and any daylight warning, with the clock formatted by the caller. */
export function arrivalCopy(
  outlook: ArrivalOutlook,
  formatTime: (ms: number) => string,
  /** The estimate is from the last known position, not a current one. */
  asOf: number | null = null,
): { line: string; warning: string | null } {
  const line =
    asOf == null
      ? `Arrive around ${formatTime(outlook.arriveAt)}`
      : `Arrive around ${formatTime(outlook.arriveAt)} · as of ${formatTime(asOf)}, your last known spot`;
  const sunset = outlook.sunset == null ? '' : formatTime(outlook.sunset);
  switch (outlook.light) {
    case 'after':
      return { line, warning: `That’s after sunset (${sunset}). Pick up the pace, or plan to take out before dark.` };
    case 'near':
      return { line, warning: `That’s close to sunset (${sunset}). Leave time to load up before dark.` };
    case 'set':
      return { line, warning: `The sun set at ${sunset}.` };
    default:
      return { line: sunset ? `${line} · sunset ${sunset}` : line, warning: null };
  }
}

/** Parse a stored session, or null if it is missing, corrupt or from another version. */
export function restoreSession(raw: string | null): FloatSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<FloatSession>;
    if (parsed?.version !== SESSION_VERSION || !parsed.id || !parsed.route || !parsed.takeOut || !parsed.track) return null;
    // Restored exactly. The session is a checkpoint of the native journal
    // (floatRecording.ts), and the fixes after it are replayed from there, so
    // the tracker continues as if Eddy had never stopped. A real gap in GPS
    // (Eddy not running, a dead zone) is a gap in fix times, which trackFix
    // already treats as one: after REACQUIRE_AFTER_MS it confirms a position
    // afresh and the first fix after it is a break in pace, not movement.
    // `awaitingFix` only says so on screen until the next confirmed fix.
    return {
      ...parsed,
      position: parsed.position ?? null,
      lastFix: restoreRawFix(parsed.lastFix ?? parsed.gpsPosition, parsed.startedAt ?? 0),
      gpsPosition: parsed.gpsPosition ? { ...parsed.gpsPosition, restored: true } : null,
      awaitingFix: true,
      // A handover interrupted by the app ending may or may not have shown;
      // it becomes eligible again rather than silently lost (floatReminders.ts).
      ...(parsed.reminders ? { reminders: { ...parsed.reminders, pending: [] } } : {}),
    } as FloatSession;
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

/**
 * "1 hr 40 min", "45 min": the precision a five-minute estimate deserves.
 * Deliberately not floatPresentation's floatDurationLabel, which labels the
 * search slider's half-hour steps ("1½ hours") and would misstate a measured
 * or estimated time.
 */
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
export function remainingCopy(
  estimate: RemainingEstimate,
  /** The take-out is off the mapped river; time runs to its closest point. */
  takeOutOffLine = false,
): { headline: string; note: string } {
  if (estimate.minutes == null) {
    return { headline: 'Learning your pace', note: '' };
  }
  if (estimate.minutes === 0) return { headline: takeOutOffLine ? 'At the river’s closest point' : 'At the take-out', note: '' };
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

/**
 * "0.6 mi", "650 ft": how far a take-out sits off the mapped river, or a
 * paddler off it. Feet under a tenth of a mile, rounded to fifty and never
 * below fifty, in the units the rest of the app uses.
 */
export function formatBeyond(meters: number): string {
  const miles = meters / 1609.344;
  if (miles >= 0.1) return `${miles.toFixed(1)} mi`;
  const feet = Math.max(50, Math.round((meters * 3.28084) / 50) * 50);
  return `${feet} ft`;
}

/** The one-line status above the numbers. */
export function statusCopy(view: FloatView, now: number): string {
  switch (view.status) {
    case 'acquiring':
      return view.lastFixAt == null ? 'Waiting for GPS…' : 'Finding your spot on the river…';
    case 'resuming':
      return 'Finding your spot again. Showing where you were.';
    case 'uncertain':
      return 'Checking your position. Showing your last confirmed spot.';
    case 'off-route': {
      if (view.confirmed) return 'You look away from the river. Showing your last spot on it.';
      const away = view.awayMeters == null ? '' : ` (about ${formatBeyond(view.awayMeters)} away)`;
      return `You’re not on the ${view.riverName} yet${away}. Progress starts once you’re on it.`;
    }
    case 'stale': {
      const minutes = view.lastFixAt == null ? null : Math.round((now - view.lastFixAt) / 60_000);
      return minutes == null ? 'Waiting for GPS.' : `Waiting for GPS. Last position ${minutes} min ago.`;
    }
    case 'live':
      if (view.atRiverEnd) {
        return `You’re at the river’s closest point to ${view.takeOutName}. It’s about ${formatBeyond(view.takeOutBeyondMeters!)} from here, off the mapped river.`;
      }
      return view.arrived ? 'You’re at the take-out.' : 'Live';
  }
}

/**
 * Offer "wrong river?" once GPS has put a float that never reached its river
 * well away from it. Nothing has been measured, so cancelling loses nothing.
 */
export function offerRiverChange(view: FloatView): boolean {
  return !view.confirmed && view.status === 'off-route' && (view.awayMeters ?? 0) > AWAY_FROM_RIVER_M;
}
