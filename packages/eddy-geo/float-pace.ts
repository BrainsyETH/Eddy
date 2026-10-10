// packages/eddy-geo/float-pace.ts
// Trip pace and the time-remaining estimate built on it.
//
// Pace is river miles travelled divided by time on the water since the float
// started, stops included. Paddlers stop; their real pace already says how
// much, and the planner's trip time already includes a stop allowance, so the
// two compare like for like. Nothing here guesses which minutes were stops.
//
// Miles are calibrated river miles (river-progress.ts), never GPS speed over
// ground, so pace agrees with the miles-remaining figure on the same screen.

const MS_PER_HOUR = 3_600_000;

/** Time on the water before trip pace says anything. */
export const MIN_ELAPSED_MS = 10 * 60_000;
/** Distance travelled before trip pace says anything, about 160 m. */
export const MIN_TRAVELLED_MILES = 0.1;
/** Time on the water after which trip pace fully replaces the planner's. */
export const BLEND_FULL_MS = 30 * 60_000;

/**
 * Trip pace in miles per hour, stops included, or null until there is enough
 * to go on.
 *
 * `startedAt` and `travelledMiles` are measured from the session's start
 * anchor: the first committed position, which for a saved trip started
 * partway down may not be its put-in.
 */
export function tripPace(startedAt: number, now: number, travelledMiles: number): number | null {
  const elapsed = now - startedAt;
  if (elapsed < MIN_ELAPSED_MS || travelledMiles < MIN_TRAVELLED_MILES) return null;
  return travelledMiles / (elapsed / MS_PER_HOUR);
}

export type EstimateBasis = 'planner' | 'blended' | 'observed' | 'learning';

export interface RemainingEstimate {
  /** Remaining time on the water at the current trip pace, rounded to 5 minutes. */
  minutes: number | null;
  basis: EstimateBasis;
}

/**
 * Time left to the take-out.
 *
 * `plannerMph` is the plan's distance over its headline trip time, which
 * includes stops, the same basis as trip pace. Pass null when there is no
 * usable, current planner estimate; a quick or offline start then shows
 * "learning your pace" until trip pace exists.
 *
 * The weight moves from planner to observed over the first half hour, so the
 * number shifts gradually rather than jumping when pace first appears.
 */
export function estimateRemaining(
  remainingMiles: number,
  plannerMph: number | null,
  pace: number | null,
  elapsedMs: number,
): RemainingEstimate {
  const planner = plannerMph != null && plannerMph > 0 ? plannerMph : null;
  const observed = pace != null && pace > 0 ? pace : null;
  if (!observed && !planner) return { minutes: null, basis: 'learning' };

  const weight = observed ? Math.min(1, elapsedMs / BLEND_FULL_MS) : 0;
  const mph = observed && planner ? (1 - weight) * planner + weight * observed : (observed ?? planner!);
  const basis: EstimateBasis = !observed ? 'planner' : !planner || weight >= 1 ? 'observed' : 'blended';

  if (remainingMiles <= 0) return { minutes: 0, basis };
  return { minutes: Math.max(5, Math.round(((remainingMiles / mph) * 60) / 5) * 5), basis };
}
