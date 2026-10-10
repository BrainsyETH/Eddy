// packages/eddy-geo/float-pace.ts
// Moving pace and the time-remaining estimate built on it.
//
// "Time left" means: if you keep going like this, this is how long. Stops are
// not predicted; when you stop, time left holds and your arrival simply moves
// later, the way a navigation app behaves when you pull over.
//
// Breaks are recognised the standard GPS-only way: by lack of progress over a
// few minutes, not by instantaneous speed. Progress is read in steps of about
// five minutes, comparing your AVERAGED position in the first and last minute
// of each step, which cancels GPS jitter. A step with less than BREAK_MAX_METERS
// of downstream progress is a break (lunch, swimming) and does not count toward
// pace. Slow drifting still makes that progress, so it counts and the estimate
// goes up honestly. A GPS gap produces no samples, so it is neither a break nor
// movement.
//
// Miles are calibrated river miles (river-progress.ts), never GPS speed over
// ground, so pace agrees with the miles-remaining figure on the same screen.

const MS_PER_HOUR = 3_600_000;

/** Progress is judged over steps at least this long. */
export const STEP_MS = 5 * 60_000;
/** Each end of a step is the average of the samples in this much time. */
const STEP_END_MS = 60_000;
/**
 * Less downstream progress than this in a step is a break: about 0.1 mph,
 * well below real floating and above averaged GPS jitter. A starting value
 * for river testing.
 */
export const BREAK_MAX_METERS = 15;
const BREAK_MAX_MILES = BREAK_MAX_METERS / 1609.344;
/** Pace averages roughly this much recent moving time: "recent pace". */
export const PACE_WINDOW_MS = 15 * 60_000;
/** Moving time needed before pace says anything. */
export const MIN_MOVING_MS = 5 * 60_000;
/** Moving time after which pace fully replaces the planner's estimate. */
export const BLEND_FULL_MS = 30 * 60_000;

/** One committed position from river-progress.ts's trackFix. */
export interface PaceSample {
  timestamp: number;
  riverMile: number;
  /** trackFix's `continuous`: false after a confirmed jump, which is not movement. */
  continuous: boolean;
}

export interface MovingPace {
  /** Miles per hour while moving. */
  mph: number;
  /** Moving time this session; drives the planner-to-pace blend. */
  movingMs: number;
}

/**
 * Pace while moving, or null until there is enough moving time.
 *
 * `direction` is +1 when the take-out has the larger river mile, -1 otherwise.
 */
export function movingPace(samples: ReadonlyArray<PaceSample>, direction: 1 | -1): MovingPace | null {
  // Cut the track into steps of at least STEP_MS. A confirmed jump ends the
  // step in progress rather than counting as distance.
  const steps: { ms: number; miles: number }[] = [];
  let start = 0;
  for (let i = 1; i < samples.length; i += 1) {
    if (!samples[i].continuous) {
      start = i;
      continue;
    }
    if (samples[i].timestamp - samples[start].timestamp < STEP_MS) continue;
    const from = averageAt(samples, start, i, 'start');
    const to = averageAt(samples, start, i, 'end');
    steps.push({ ms: to.timestamp - from.timestamp, miles: (to.riverMile - from.riverMile) * direction });
    start = i;
  }

  const moving = steps.filter((step) => step.ms > 0 && step.miles >= BREAK_MAX_MILES);
  const movingMs = moving.reduce((sum, step) => sum + step.ms, 0);
  if (movingMs < MIN_MOVING_MS) return null;

  let windowMs = 0;
  let windowMiles = 0;
  for (let i = moving.length - 1; i >= 0 && windowMs < PACE_WINDOW_MS; i -= 1) {
    windowMs += moving[i].ms;
    windowMiles += moving[i].miles;
  }
  return { mph: windowMiles / (windowMs / MS_PER_HOUR), movingMs };
}

/** Average position and time over the first or last STEP_END_MS of samples[from..to]. */
function averageAt(samples: ReadonlyArray<PaceSample>, from: number, to: number, end: 'start' | 'end') {
  let timestamp = 0;
  let riverMile = 0;
  let count = 0;
  for (let i = from; i <= to; i += 1) {
    const inside = end === 'start'
      ? samples[i].timestamp - samples[from].timestamp <= STEP_END_MS
      : samples[to].timestamp - samples[i].timestamp <= STEP_END_MS;
    if (!inside) continue;
    timestamp += samples[i].timestamp;
    riverMile += samples[i].riverMile;
    count += 1;
  }
  return { timestamp: timestamp / count, riverMile: riverMile / count };
}

export type EstimateBasis = 'planner' | 'blended' | 'observed' | 'learning';

export interface RemainingEstimate {
  /** Moving time left at your recent pace, rounded to 5 minutes. */
  minutes: number | null;
  basis: EstimateBasis;
}

/**
 * Moving time left to the take-out.
 *
 * `plannerMph` is the planner's MOVING speed (FloatTimeResult.speedMph), not
 * its headline time, which adds a stop allowance. Pass null when there is no
 * usable, current planner estimate; a quick or offline start then shows
 * "learning your pace" until pace exists.
 *
 * The weight moves from planner to observed pace over the first half hour of
 * moving, so the number shifts gradually rather than jumping.
 */
export function estimateRemaining(
  remainingMiles: number,
  plannerMph: number | null,
  pace: MovingPace | null,
): RemainingEstimate {
  const planner = plannerMph != null && plannerMph > 0 ? plannerMph : null;
  if (!pace && !planner) return { minutes: null, basis: 'learning' };

  const weight = pace ? Math.min(1, pace.movingMs / BLEND_FULL_MS) : 0;
  const mph = pace && planner ? (1 - weight) * planner + weight * pace.mph : (pace?.mph ?? planner!);
  const basis: EstimateBasis = !pace ? 'planner' : !planner || weight >= 1 ? 'observed' : 'blended';

  if (remainingMiles <= 0) return { minutes: 0, basis };
  return { minutes: Math.max(5, Math.round(((remainingMiles / mph) * 60) / 5) * 5), basis };
}
