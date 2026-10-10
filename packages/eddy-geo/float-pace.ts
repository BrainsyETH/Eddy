// packages/eddy-geo/float-pace.ts
// Moving pace and the time-remaining estimate built on it.
//
// "Time left" means: if you keep going like this, this is how long. Stops are
// not predicted; when you stop, time left holds and your arrival simply moves
// later, the way a navigation app behaves when you pull over.
//
// ── Breaks: stay points ─────────────────────────────────────────────────────
//
// Breaks are recognised the standard GPS-only way, as stay points: a run of
// positions that stays within STAY_RADIUS_METERS of where it began for at
// least STAY_MIN_MS is a stop, wherever it starts and ends. That time is left
// out of pace, all of it, from the moment you arrived. A run still in progress
// is left out until it either becomes a stop or ends, so a fresh stop never
// drags the estimate around while it is being recognised.
//
// Anything that leaves the radius sooner is movement, downstream or up, and
// counts with its sign: drifting slowly raises the estimate, paddling back
// upstream lowers pace, and net upstream progress gives no estimate at all.
//
// Below roughly STAY_RADIUS_METERS per STAY_MIN_MS (about 0.15 mph) GPS
// cannot tell drifting from sitting still. Rather than guess, the reading
// says it is PAUSED once nothing has counted as movement for STAY_MIN_MS,
// and the screen shows time left "at your earlier pace", never as recent.
//
// Pace is a rolling window over the most recent moving time, so it updates
// with every position. Miles are calibrated river miles (river-progress.ts),
// never GPS speed over ground, so pace agrees with miles remaining.

const MS_PER_HOUR = 3_600_000;
const METERS_PER_MILE = 1609.344;

/** Staying within this distance (along the river) ... */
export const STAY_RADIUS_METERS = 25;
/** ... for at least this long is a stop. */
export const STAY_MIN_MS = 6 * 60_000;
/** Pace averages this much recent moving time: "recent pace". */
export const PACE_WINDOW_MS = 15 * 60_000;
/** Moving time needed before pace says anything. */
export const MIN_MOVING_MS = 5 * 60_000;
/** Moving time after which pace fully replaces the planner's estimate. */
export const BLEND_FULL_MS = 30 * 60_000;

/** One committed position from river-progress.ts's trackFix. */
export interface PaceSample {
  timestamp: number;
  riverMile: number;
  /** trackFix's `continuous`: false after a confirmed jump or reacquisition. */
  continuous: boolean;
}

export interface PaceReading {
  /** Recent moving pace in mph; null until there is enough, or if net progress is upstream. */
  mph: number | null;
  /** All moving time this session; drives the planner-to-pace blend. */
  movingMs: number;
  /** Nothing has counted as movement for STAY_MIN_MS: a break, or too slow to tell. */
  paused: boolean;
}

/**
 * Read pace from committed positions, in time order.
 *
 * `direction` is +1 when the take-out has the larger river mile, -1 otherwise.
 */
export function movingPace(samples: ReadonlyArray<PaceSample>, direction: 1 | -1): PaceReading {
  const radius = STAY_RADIUS_METERS / METERS_PER_MILE;
  // Interval i runs from sample i-1 to sample i. Only 'moving' counts.
  const moving: boolean[] = new Array(samples.length).fill(false);

  // Each run is anchored at its first sample and ends at the last sample
  // still inside the radius. Short runs are movement; long ones are stops.
  let runStart = 0;
  const closeRun = (end: number) => {
    const isStop = samples[end].timestamp - samples[runStart].timestamp >= STAY_MIN_MS;
    if (!isStop) for (let j = runStart + 1; j <= end; j += 1) moving[j] = true;
  };
  for (let i = 1; i < samples.length; i += 1) {
    if (!samples[i].continuous) {
      // A confirmed jump is not movement; start over from it.
      closeRun(i - 1);
      runStart = i;
    } else if (Math.abs(samples[i].riverMile - samples[runStart].riverMile) > radius) {
      closeRun(i - 1);
      runStart = i - 1;
    }
  }
  // The run in progress counts as nothing yet.

  let movingMs = 0;
  let lastMovingAt: number | null = null;
  for (let i = 1; i < samples.length; i += 1) {
    if (!moving[i]) continue;
    movingMs += samples[i].timestamp - samples[i - 1].timestamp;
    lastMovingAt = samples[i].timestamp;
  }

  let windowMs = 0;
  let windowMiles = 0;
  for (let i = samples.length - 1; i >= 1 && windowMs < PACE_WINDOW_MS; i -= 1) {
    if (!moving[i]) continue;
    windowMs += samples[i].timestamp - samples[i - 1].timestamp;
    windowMiles += (samples[i].riverMile - samples[i - 1].riverMile) * direction;
  }

  const now = samples.length > 0 ? samples[samples.length - 1].timestamp : 0;
  const paused = samples.length > 1 && now - (lastMovingAt ?? samples[0].timestamp) >= STAY_MIN_MS;
  const mph = movingMs >= MIN_MOVING_MS && windowMiles > 0 ? windowMiles / (windowMs / MS_PER_HOUR) : null;
  return { mph, movingMs, paused };
}

export type EstimateBasis = 'planner' | 'blended' | 'observed' | 'learning';

export interface RemainingEstimate {
  /** Moving time left, rounded to 5 minutes. */
  minutes: number | null;
  basis: EstimateBasis;
  /** Show as "at your earlier pace", not as recent: see PaceReading.paused. */
  paused: boolean;
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
  pace: PaceReading | null,
): RemainingEstimate {
  const planner = plannerMph != null && plannerMph > 0 ? plannerMph : null;
  const observed = pace?.mph ?? null;
  const paused = pace?.paused ?? false;
  if (!observed && !planner) return { minutes: null, basis: 'learning', paused };

  const weight = observed ? Math.min(1, pace!.movingMs / BLEND_FULL_MS) : 0;
  const mph = observed && planner ? (1 - weight) * planner + weight * observed : (observed ?? planner!);
  const basis: EstimateBasis = !observed ? 'planner' : !planner || weight >= 1 ? 'observed' : 'blended';

  if (remainingMiles <= 0) return { minutes: 0, basis, paused };
  return { minutes: Math.max(5, Math.round(((remainingMiles / mph) * 60) / 5) * 5), basis, paused };
}
