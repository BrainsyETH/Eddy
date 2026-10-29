// Constant-size accounting independent of the rolling pace sample buffer.
// Uses the same anchored stay-point rule as movingPace. Unobserved intervals
// and a short unresolved final run are unknown, never inferred stops.
//
// Distance across a GPS gap is counted when tracking reacquired the river
// after it: both ends are confirmed positions, and a paddler cannot get from
// one to the other without covering the river between. Its time stays
// unknown, since a gap cannot say how much of it was paddling. A relocation
// (a wrong match corrected) adds nothing, nor does a gap crossed faster than
// the tracker's top river speed, which was not travel on the water.
import { STAY_MIN_MS, STAY_RADIUS_METERS, type PaceSample } from './float-pace';
import { MAX_SPEED_MPS } from './river-progress';

const METERS_PER_MILE = 1609.344;

/** River miles between the last sample before a gap and the reacquired one, if travelled. */
function gapMiles(last: PaceSample, sample: PaceSample): number {
  if (!sample.reacquired) return 0;
  const miles = Math.abs(sample.riverMile - last.riverMile);
  const seconds = (sample.timestamp - last.timestamp) / 1000;
  return seconds > 0 && (miles * METERS_PER_MILE) / seconds <= MAX_SPEED_MPS ? miles : 0;
}

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
  runDistanceMiles?: number;
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
  runDistanceMiles: 0,
};

function closeRun(t: FloatTotals): void {
  if (t.runMs >= STAY_MIN_MS) t.stoppedMs += t.runMs;
  else {
    t.movingMs += t.runMs;
    t.movingMiles += t.runMiles;
    t.distanceMiles += t.runDistanceMiles ?? 0;
  }
  t.runMs = 0;
  t.runMiles = 0;
  t.runDistanceMiles = 0;
}

export function accumulateFloat(previous: FloatTotals, sample: PaceSample): FloatTotals {
  if (previous.last && sample.timestamp <= previous.last.timestamp) return previous;
  const t = { ...previous };
  t.firstMile ??= sample.riverMile;
  if (!t.last || !t.anchor) return { ...t, anchor: sample, last: sample };
  const dt = sample.timestamp - t.last.timestamp;
  if (!sample.continuous) {
    closeRun(t);
    t.distanceMiles += gapMiles(t.last, sample);
    return { ...t, anchor: sample, last: sample };
  }
  if (Math.abs(sample.riverMile - t.anchor.riverMile) > STAY_RADIUS_METERS / 1609.344) {
    closeRun(t);
    t.anchor = t.last;
  }
  const miles = sample.riverMile - t.last.riverMile;
  // Hold displacement until the run is classified. Confirmed stops contribute
  // no distance, even when GPS drifts back and forth inside the stay radius.
  t.runDistanceMiles = (t.runDistanceMiles ?? 0) + Math.abs(miles);
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
