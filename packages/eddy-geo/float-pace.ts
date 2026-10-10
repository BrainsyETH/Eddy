// packages/eddy-geo/float-pace.ts
// Recent paddling pace and the remaining-time estimate built on it.
//
// Pace is change in calibrated river miles over time (river-progress.ts), never
// GPS speed over ground: speed over ground is noisy, and measured against a
// line that cuts corners it would disagree with the miles-remaining figure on
// the same screen.
//
// ── What counts as moving ───────────────────────────────────────────────────
//
//   - Only intervals between two consecutive, continuous matches no more than
//     MAX_GAP_MS apart. A tracking gap is unknown, not a rest stop, and a jump
//     on reacquisition is not evidence of speed.
//   - A sustained stop (staying within STOP_RADIUS_MILES for STOP_MIN_MS or
//     longer) is excluded. Drifting at more than about 0.4 mph leaves that
//     radius within the time limit, so slow progress is not mistaken for a
//     stop by speed alone.
//
// The window is measured in MOVING time, not wall time, so a long lunch stop
// holds the last pace instead of letting it decay into "learning" again.
//
// Every threshold below is a starting hypothesis for simulation and river
// testing (#1448), not a product requirement.

const MS_PER_HOUR = 3_600_000;

/** Moving time the pace is averaged over. #1448 suggests testing 15-30 min. */
export const PACE_WINDOW_MS = 20 * 60_000;
/** Longest interval between fixes still treated as observed movement. */
export const MAX_GAP_MS = 3 * 60_000;
/** Staying within this distance (about 50 m) ... */
export const STOP_RADIUS_MILES = 0.03;
/** ... for at least this long is a stop. */
export const STOP_MIN_MS = 5 * 60_000;
/** Pace needs at least this much moving time ... */
export const MIN_MOVING_MS = 5 * 60_000;
/** ... and this much distance before it says anything. */
export const MIN_MOVING_MILES = 0.1;
/** Moving time after which observed pace fully replaces the planner's. */
export const BLEND_FULL_MS = 30 * 60_000;

/** One matched position from river-progress.ts's matchFix. */
export interface PaceSample {
  timestamp: number;
  riverMile: number;
  /** False when this match is not reachable from the previous one. */
  continuous: boolean;
}

export interface PaceEstimate {
  /** Downstream progress per hour of moving time. */
  mph: number;
  /** Moving time inside the window that the pace rests on. */
  movingMs: number;
  /** All moving time this session; drives the planner-to-observed blend. */
  sessionMovingMs: number;
  /** The paddler has been still for at least STOP_MIN_MS. */
  stopped: boolean;
}

/**
 * Recent moving pace, or null while there is not yet enough to go on.
 *
 * `direction` is +1 when the take-out has the larger river mile, -1 otherwise.
 * Samples are in time order; the session layer appends one per matched fix.
 */
export function observedPace(samples: ReadonlyArray<PaceSample>, direction: 1 | -1): PaceEstimate | null {
  // Mark each usable interval (ending at sample i) as moving or stopped.
  const usable: boolean[] = new Array(samples.length).fill(false);
  const stoppedInterval: boolean[] = new Array(samples.length).fill(false);
  for (let i = 1; i < samples.length; i += 1) {
    const dt = samples[i].timestamp - samples[i - 1].timestamp;
    usable[i] = samples[i].continuous && dt > 0 && dt <= MAX_GAP_MS;
  }

  // Stops: runs of usable intervals that never leave a small radius of where
  // the run began. A run is anchored at its first sample and closed by the
  // first sample outside the radius or the first unusable interval.
  let runStart = 0;
  let stoppedNow = false;
  const closeRun = (end: number) => {
    const isStop = samples[end].timestamp - samples[runStart].timestamp >= STOP_MIN_MS;
    if (isStop) for (let j = runStart + 1; j <= end; j += 1) stoppedInterval[j] = true;
    return isStop;
  };
  for (let i = 1; i < samples.length; i += 1) {
    if (!usable[i]) {
      closeRun(i - 1);
      runStart = i;
      continue;
    }
    if (Math.abs(samples[i].riverMile - samples[runStart].riverMile) > STOP_RADIUS_MILES) {
      closeRun(i - 1);
      runStart = i - 1;
    }
  }
  if (samples.length > 1) stoppedNow = closeRun(samples.length - 1);

  let sessionMovingMs = 0;
  for (let i = 1; i < samples.length; i += 1) {
    if (usable[i] && !stoppedInterval[i]) sessionMovingMs += samples[i].timestamp - samples[i - 1].timestamp;
  }

  // Walk back from the newest interval, collecting moving time up to the window.
  let movingMs = 0;
  let movingMiles = 0;
  for (let i = samples.length - 1; i >= 1 && movingMs < PACE_WINDOW_MS; i -= 1) {
    if (!usable[i] || stoppedInterval[i]) continue;
    movingMs += samples[i].timestamp - samples[i - 1].timestamp;
    movingMiles += (samples[i].riverMile - samples[i - 1].riverMile) * direction;
  }

  if (movingMs < MIN_MOVING_MS || movingMiles < MIN_MOVING_MILES) return null;
  return { mph: movingMiles / (movingMs / MS_PER_HOUR), movingMs, sessionMovingMs, stopped: stoppedNow };
}

export type EstimateBasis = 'planner' | 'blended' | 'observed' | 'learning';

export interface RemainingEstimate {
  /** Remaining MOVING time, rounded to 5 minutes; future stops excluded. */
  minutes: number | null;
  basis: EstimateBasis;
}

/**
 * Remaining moving time.
 *
 * `plannerMph` is the planner's MOVING speed (FloatTimeResult.speedMph), not
 * distance over its headline time: the headline includes a stop allowance, and
 * observed pace already excludes stops, so blending the two would count stops
 * twice. Pass null when there is no usable, current planner estimate; a quick
 * or offline start then shows "learning your pace" until pace exists.
 *
 * The weight moves from planner to observed with moving time, so the switch is
 * gradual rather than a jump at the moment pace first becomes available.
 */
export function estimateRemaining(
  remainingMiles: number,
  plannerMph: number | null,
  pace: PaceEstimate | null,
): RemainingEstimate {
  const planner = plannerMph != null && plannerMph > 0 ? plannerMph : null;
  if (!pace && !planner) return { minutes: null, basis: 'learning' };

  const weight = pace ? Math.min(1, pace.sessionMovingMs / BLEND_FULL_MS) : 0;
  const mph = pace && planner ? (1 - weight) * planner + weight * pace.mph : (pace?.mph ?? planner!);
  const basis: EstimateBasis = !pace ? 'planner' : !planner || weight >= 1 ? 'observed' : 'blended';

  if (remainingMiles <= 0) return { minutes: 0, basis };
  return { minutes: Math.max(5, Math.round(((remainingMiles / mph) * 60) / 5) * 5), basis };
}
