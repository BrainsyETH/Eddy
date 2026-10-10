// packages/eddy-geo/float-pace.ts
// Moving pace and the time-remaining estimate built on it.
//
// "Time left" means: if you keep going like this, this is how long. Stops are
// not predicted; when you stop, time left holds and your arrival simply moves
// later, the way a navigation app behaves when you pull over.
//
// Knowing whether you are moving uses one rule, like a fitness app's
// auto-pause: progress is read in steps of about two minutes, and a step slower
// than AUTO_PAUSE_MPH does not count toward pace. Two minutes, because GPS
// wander over a shorter step would look like movement at canoe speeds.
//
// Miles are calibrated river miles (river-progress.ts), never GPS speed over
// ground, so pace agrees with the miles-remaining figure on the same screen.

const MS_PER_HOUR = 3_600_000;

/** Progress is judged over steps at least this long. */
export const STEP_MS = 2 * 60_000;
/** A step slower than this is paused. A starting value for river testing. */
export const AUTO_PAUSE_MPH = 0.3;
/** Pace averages roughly this much recent moving time. */
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
  // Cut the track into steps of at least STEP_MS. A confirmed jump starts a
  // new step rather than counting as distance.
  const steps: { ms: number; miles: number }[] = [];
  let start = 0;
  for (let i = 1; i < samples.length; i += 1) {
    if (!samples[i].continuous) {
      start = i;
      continue;
    }
    const ms = samples[i].timestamp - samples[start].timestamp;
    if (ms < STEP_MS) continue;
    steps.push({ ms, miles: (samples[i].riverMile - samples[start].riverMile) * direction });
    start = i;
  }

  const moving = steps.filter((step) => step.miles / (step.ms / MS_PER_HOUR) >= AUTO_PAUSE_MPH);
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

export type EstimateBasis = 'planner' | 'blended' | 'observed' | 'learning';

export interface RemainingEstimate {
  /** Moving time left at the current pace, rounded to 5 minutes. */
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
