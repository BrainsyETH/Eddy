// Constant-size accounting independent of the rolling pace sample buffer.
// Uses the same anchored stay-point rule as movingPace. Unobserved intervals
// and a short unresolved final run are unknown, never inferred stops.
import { STAY_MIN_MS, STAY_RADIUS_METERS, type PaceSample } from './float-pace';

export interface FloatTotals {
  movingMs: number;
  stoppedMs: number;
  movingMiles: number;
  distanceMiles: number;
  firstMile: number | null;
  anchor: PaceSample | null;
  last: PaceSample | null;
  runMs: number;
  runMiles: number;
}

export const EMPTY_FLOAT_TOTALS: FloatTotals = {
  movingMs: 0,
  stoppedMs: 0,
  movingMiles: 0,
  distanceMiles: 0,
  firstMile: null,
  anchor: null,
  last: null,
  runMs: 0,
  runMiles: 0,
};

function closeRun(t: FloatTotals): void {
  if (t.runMs >= STAY_MIN_MS) t.stoppedMs += t.runMs;
  else {
    t.movingMs += t.runMs;
    t.movingMiles += t.runMiles;
  }
  t.runMs = 0;
  t.runMiles = 0;
}

export function accumulateFloat(previous: FloatTotals, sample: PaceSample): FloatTotals {
  if (previous.last && sample.timestamp <= previous.last.timestamp) return previous;
  const t = { ...previous };
  t.firstMile ??= sample.riverMile;
  if (!t.last || !t.anchor) return { ...t, anchor: sample, last: sample };
  const dt = sample.timestamp - t.last.timestamp;
  if (!sample.continuous) {
    closeRun(t);
    return { ...t, anchor: sample, last: sample };
  }
  if (Math.abs(sample.riverMile - t.anchor.riverMile) > STAY_RADIUS_METERS / 1609.344) {
    closeRun(t);
    t.anchor = t.last;
  }
  const miles = sample.riverMile - t.last.riverMile;
  t.distanceMiles += Math.abs(miles);
  t.runMs += dt;
  t.runMiles += miles;
  t.last = sample;
  return t;
}

export function finishFloatTotals(t: FloatTotals, elapsedMs: number) {
  const stoppedMs = t.stoppedMs + (t.runMs >= STAY_MIN_MS ? t.runMs : 0);
  return {
    movingMs: t.movingMs,
    stoppedMs,
    unknownMs: Math.max(0, elapsedMs - t.movingMs - stoppedMs),
    distanceMiles: t.distanceMiles,
    movingMph: t.movingMs > 0 && t.movingMiles > 0 ? t.movingMiles / (t.movingMs / 3_600_000) : null,
  };
}
