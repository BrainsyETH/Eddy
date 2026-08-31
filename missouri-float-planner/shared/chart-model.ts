// shared/chart-model.ts
//
// The hydrograph's MEANING, separated from its pixels.
//
// ── Why this file exists ────────────────────────────────────────────────────
// Two renderers draw the same picture: FlowTrendChart.tsx (SVG, web) and
// eddy-ios/src/components/GaugeChart.tsx (react-native-svg). They had drifted
// into two different pictures of the same river — the web chart spaced points
// by ARRAY INDEX and drew a missing reading at mid-height, while the app spaced
// by TIME and broke the line at outages. Same endpoint, same numbers, two
// different stories about when the river peaked.
//
// So the axis math, the gap rule, the downsample and the tick placement live
// here, and the renderers own only pixels and gestures. This is the same split
// condition-system.ts made for the ladder, for the same duplicate-then-drift
// reason spelled out at the top of reading-unit.ts.
//
// LIVES IN shared/ so eddy-ios can reach it through the `@eddy/conditions`
// file: dependency, as `@eddy/conditions/chart-model`. Keep the imports here
// relative and type-only for that reason.

import type { ReadingUnit } from './reading-unit';

export interface ChartReadingLike {
  timestamp: string;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  qualifiers?: string[] | null;
}

/** One plotted observation: a real number at a real instant. Never synthesized. */
export interface ChartPoint {
  /** Epoch ms. The x axis is TIME, not position in the array. */
  t: number;
  v: number;
  timestamp: string;
  qualifiers: string[];
}

export interface ChartDomain {
  min: number;
  max: number;
  t0: number;
  t1: number;
}

export interface ChartTick {
  value: number;
  /** 0–1 along the axis, so a renderer can place it without redoing the scale. */
  position: number;
}

export function valueForUnit(reading: ChartReadingLike, unit: ReadingUnit): number | null {
  const value = unit === 'cfs' ? reading.dischargeCfs : reading.gaugeHeightFt;
  return value !== null && Number.isFinite(value) ? value : null;
}

/**
 * Sorted, real observations only.
 *
 * A reading with no value IN THE SELECTED UNIT is dropped rather than
 * substituted. The web chart used to plot those at y = 50 — the middle of the
 * frame — which drew a confident horizontal line through the exact moments the
 * gauge was not reporting. Dropping them here is what lets splitAtGaps() show
 * the outage as an outage.
 */
export function chartPoints(readings: ChartReadingLike[], unit: ReadingUnit): ChartPoint[] {
  return readings
    .flatMap((reading) => {
      const t = new Date(reading.timestamp).getTime();
      const v = valueForUnit(reading, unit);
      return Number.isFinite(t) && v !== null
        ? [{ t, v, timestamp: reading.timestamp, qualifiers: reading.qualifiers ?? [] }]
        : [];
    })
    .sort((a, b) => a.t - b.t);
}

/**
 * Split the series where telemetry stopped, so a renderer can draw one path per
 * segment instead of one line straight across the hole.
 *
 * CADENCE IS THE MEDIAN, not the mean. The mean is dragged upward by the very
 * outage we are trying to find, so a series with one long gap raises its own
 * break threshold until the gap no longer qualifies. The median does not move.
 *
 * This matters more since the endpoint began downsampling by extrema rather
 * than by a fixed stride (see samplePreservingExtrema): the returned points are
 * deliberately UNEVENLY spaced, and a mean-based threshold reads that unevenness
 * as outages that never happened.
 */
export function splitAtGaps<T extends { t: number }>(points: T[], multiple = 4): T[][] {
  if (points.length < 2) return points.length ? [points] : [];

  const intervals = points
    .slice(1)
    .map((point, index) => point.t - points[index].t)
    .filter((interval) => interval > 0)
    .sort((a, b) => a - b);

  // No positive interval at all means every point shares a timestamp. There is
  // no cadence to compare against, and claiming an outage between coincident
  // readings would be an invention — keep them as one segment.
  if (!intervals.length) return [points];

  const cadence = intervals[Math.floor(intervals.length / 2)];
  const breakAt = cadence * multiple;
  const segments: T[][] = [[points[0]]];
  for (let index = 1; index < points.length; index += 1) {
    if (points[index].t - points[index - 1].t > breakAt) segments.push([]);
    segments[segments.length - 1].push(points[index]);
  }
  return segments;
}

export interface ChartSegments<T> {
  /** Two or more points in time order: stroke each as its own path. */
  lines: T[][];
  /** A reading with no neighbour inside the cadence: mark each as a dot. */
  isolated: T[];
}

/**
 * splitAtGaps(), sorted into the two things a renderer can draw.
 *
 * BOTH RENDERERS USED TO DISCARD the one-point segments — each had its own
 * `filter((segment) => segment.length > 1)`, on the true observation that a lone
 * point is not a line. It is not nothing either: a station that reported once
 * between two outages had that reading drawn as empty space. That is the same
 * class of error as plotting a null at mid-frame, in the other direction, and
 * quieter — the web chart hid it for the newest reading only by coincidence,
 * because the current-value dot is drawn separately from the path.
 *
 * So the split hands back both halves and neither renderer gets to decide on its
 * own that a real number is unrenderable.
 */
export function chartSegments<T extends { t: number }>(
  points: T[],
  multiple = 4,
): ChartSegments<T> {
  const lines: T[][] = [];
  const isolated: T[] = [];
  for (const segment of splitAtGaps(points, multiple)) {
    if (segment.length > 1) lines.push(segment);
    else if (segment.length === 1) isolated.push(segment[0]);
  }
  return { lines, isolated };
}

/**
 * The USGS codes that actually turn up on Ozark gauges.
 *
 * HERE rather than in either chart because both need it and neither owns it: the
 * web chart carried this table alone, so the app's scrub read out a provisional
 * reading with nothing saying it was provisional. A qualifier is the gauge
 * telling you how much to trust the number, which is not an optional decoration
 * on one platform.
 */
const QUALIFIER_COPY: Record<string, string> = {
  P: 'provisional',
  e: 'estimated',
  E: 'estimated',
  Ice: 'ice affected',
  Eqp: 'equipment malfunction',
  Bkw: 'backwater affected',
  Dis: 'discontinued',
  Mnt: 'maintenance',
};

/** Plain English for the codes we recognise, or null when none are known. */
export function qualifierText(codes: string[]): string | null {
  if (!codes.length) return null;
  const seen = new Set<string>();
  for (const code of codes) {
    const copy = QUALIFIER_COPY[code];
    if (copy) seen.add(copy);
  }
  return seen.size ? [...seen].join(', ') : null;
}

/**
 * Downsample to at most `maxPoints`, keeping both endpoints and the high and
 * low of every time bucket.
 *
 * WHY NOT `index % step === 0`. That is what this endpoint and both charts used
 * to do, and on a hydrograph it deletes the crest: a flood peak is one or two
 * readings wide, and a stride that does not happen to land on them removes the
 * single most important number in the window. Nobody notices, because the line
 * that remains is smooth and plausible.
 *
 * The result is unevenly spaced ON PURPOSE — see the cadence note in
 * splitAtGaps() for what that implies downstream.
 *
 * Bound: 2 endpoints + 2 per bucket over floor((maxPoints - 2) / 2) buckets
 * never exceeds maxPoints, so this cannot need a truncating slice — which is
 * just as well, since the only sensible thing to truncate would be the newest
 * reading.
 */
export function samplePreservingExtrema<T>(
  values: T[],
  maxPoints: number,
  valueOf: (value: T) => number | null,
): T[] {
  if (values.length <= maxPoints || maxPoints < 4) return [...values];

  const selected = new Set<number>([0, values.length - 1]);
  const bucketCount = Math.max(1, Math.floor((maxPoints - 2) / 2));
  const interiorLength = values.length - 2;

  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const start = 1 + Math.floor((bucket * interiorLength) / bucketCount);
    const end = 1 + Math.floor(((bucket + 1) * interiorLength) / bucketCount);
    let lowIndex: number | null = null;
    let highIndex: number | null = null;
    let low = Infinity;
    let high = -Infinity;
    for (let index = start; index < end; index += 1) {
      const value = valueOf(values[index]);
      if (value === null || !Number.isFinite(value)) continue;
      if (value < low) {
        low = value;
        lowIndex = index;
      }
      if (value > high) {
        high = value;
        highIndex = index;
      }
    }
    if (lowIndex !== null) selected.add(lowIndex);
    if (highIndex !== null) selected.add(highIndex);
  }

  return [...selected].sort((a, b) => a - b).map((index) => values[index]);
}

/**
 * The y domain: the data, stretched to swallow any reference line close enough
 * to be worth seeing.
 *
 * `contextValues` are threshold/flood lines. One that sits far outside the
 * window is NOT pulled in — a 20,000 cfs flood stage on a 300 cfs week would
 * flatten the whole series into the bottom pixel, which is a worse lie than
 * leaving the line off screen and labelling it. `nearFraction` is how far past
 * the data a line may sit and still count as near.
 *
 * THE FLOOR IS UNIT-AWARE, and that is not a detail. Discharge is physically
 * non-negative and validDischarge() enforces it, so clamping cfs at zero keeps
 * the axis honest. STAGE IS NOT: gauge height is relative to an arbitrary datum
 * and validHeight() accepts down to -100 ft, so a gauge reading below its datum
 * — ordinary on several Ozark stations at low water — would have its line drawn
 * beneath a floor labelled 0.00 ft. Clamp cfs, never clamp ft.
 */
export function chartDomain(
  points: ChartPoint[],
  unit: ReadingUnit,
  contextValues: number[] = [],
  nearFraction = 0.75,
): ChartDomain | null {
  if (!points.length) return null;

  // A loop rather than Math.min(...points.map(…)): the spread form throws
  // "Maximum call stack size exceeded" on a long enough series, and this
  // function is shared with callers that do not downsample first.
  let min = points[0].v;
  let max = points[0].v;
  for (const point of points) {
    if (point.v < min) min = point.v;
    if (point.v > max) max = point.v;
  }

  const dataRange = max - min || Math.max(Math.abs(max) * 0.1, unit === 'cfs' ? 10 : 0.2);
  const reach = dataRange * nearFraction;
  for (const value of contextValues) {
    if (!Number.isFinite(value)) continue;
    if (value < min && value >= min - reach) min = value;
    if (value > max && value <= max + reach) max = value;
  }

  const pad = (max - min || dataRange) * 0.08;
  const floor = unit === 'cfs' ? 0 : -Infinity;
  return {
    min: Math.max(floor, min - pad),
    max: max + pad,
    t0: points[0].t,
    t1: points[points.length - 1].t,
  };
}

/**
 * Human-scale linear ticks (1/2/5 × 10ⁿ).
 *
 * LINEAR, always. The web chart used to switch to a sqrt axis whenever the
 * range ratio exceeded 5, with no mark on the chart saying so — so two gauges
 * side by side could carry differently-shaped axes and a spike could be made to
 * look half its height. A scale the reader cannot see is a scale that lies;
 * if a series needs compressing, that is a decision to surface, not to infer.
 */
export function niceValueTicks(
  min: number,
  max: number,
  targetCount = 4,
  /**
   * The most labels the calling surface can seat. The ladder below aims at
   * `targetCount` from below, but its rungs move in 2×–2.5× jumps, so the first
   * step to reach the target can overshoot it — five labels on the 168px phone
   * plot that asked for three crowd into each other and read worse than the
   * sparse axis they replaced. One over target is the default headroom; a
   * surface with more room says so explicitly.
   */
  maxCount = targetCount + 1
): ChartTick[] {
  const fallback: ChartTick[] = [
    { value: min, position: 0 },
    { value: max, position: 1 },
  ];
  // A zero or negative span has no ticks to place. Nudging it up to EPSILON
  // instead produced a step so small that `first + index * step` could not move
  // off `min` at float resolution, and the loop emitted several ticks all
  // carrying the same label before the rounding finally crossed the limit.
  const span = max - min;
  if (!Number.isFinite(span) || !Number.isFinite(min) || span <= 0) return fallback;

  const rough = span / Math.max(1, targetCount - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const residual = rough / magnitude;
  const step = (residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10) * magnitude;
  if (!Number.isFinite(step) || step <= 0) return fallback;

  // Indexed rather than accumulated (`value += step`), which drifts into
  // labels like 0.30000000000000004 after a few iterations.
  const ticksForStep = (size: number): ChartTick[] => {
    // `Math.ceil(min / size) * size` is exact in decimal and not in binary:
    // ceil(1.2 / 0.05) * 0.05 is 1.2000000000000002, and every tick after it
    // inherits the error. Snapping to the step's own decimal place is what makes
    // a "round number" round — the steps are always 1/2/5 × 10ⁿ, so the place is
    // known rather than guessed.
    // A 2.5 rung needs one more decimal place than its magnitude implies —
    // a 0.25 step lands on 2.75, and rounding that to the magnitude's single
    // place gives 2.8, a "tick" that is not a multiple of its own step.
    const rung = size / 10 ** Math.floor(Math.log10(size));
    const extra = Math.abs(rung - 2.5) < 1e-9 ? 1 : 0;
    const decimals = Math.min(10, Math.max(0, -Math.floor(Math.log10(size))) + extra);
    const snap = (value: number) => Number(value.toFixed(decimals));
    const first = Math.ceil(min / size) * size;
    const out: ChartTick[] = [];
    const limit = max + size * 0.001;
    for (let index = 0; index < 64; index += 1) {
      const value = snap(first + index * size);
      if (value > limit) break;
      out.push({ value, position: (value - min) / span });
    }
    return out;
  };

  /**
   * The step above is rounded UP to the next 1/2/5, which overshoots whenever the
   * span sits just past a boundary — and an overshooting step can fit only one
   * round number inside the domain, at which point this used to hand back the
   * fallback: the PADDED DOMAIN's own edges.
   *
   * That is how a stage plot came to be labelled "3.47" and "2.43". Those are the
   * 8% pad from chartDomain(), not readings, not round, and not a scale anybody
   * can measure the line against — the one job the axis has.
   *
   * So walk DOWN the 1/2/5 ladder instead of giving up on the first miss. Finer
   * steps only ever ADD labels, so the counts rise monotonically and the first
   * candidate to reach `targetCount` is also the coarsest one that does; take it,
   * and keep the finest seen as the floor for a span too narrow to get there.
   *
   * Aim at the target from below rather than bracketing it, because too few is
   * the worse failure: a 0–940 cfs plot labelled "0, 500" leaves the whole top
   * half of the frame with nothing to measure a spike against, which is most of
   * what somebody opens a hydrograph to do. Aiming from below is what turns that
   * axis into 0, 200, 400, 600, 800. Too many is still a failure — just a
   * smaller one — which is what `maxCount` bounds.
   *
   * The fallback survives for spans that are genuinely unlabellable (a degenerate
   * range), where it is the honest answer rather than a rounding failure.
   */
  /**
   * 2.5 earns its place on this ladder. Without it the rungs jump 5 → 2, which
   * more than doubles the label count in one move: a 2.43–3.47 ft window gets 2
   * labels at 0.5 and 5 at 0.2, with nothing in between, so a chart asking for 3
   * has to take one of those. At 0.25 it gets 2.5 / 2.75 / 3.00 / 3.25 — four
   * labels, and quarter-feet is how stage is read anyway.
   *
   * The cap and the 2.5 rung work together, not against each other: the rung
   * keeps the jumps small enough that a count inside [target, max] is usually
   * reachable, and the cap ends the walk when a span's geometry makes every
   * finer rung blow the budget — at which point the last accepted rung stands,
   * because a slightly sparse axis beats a crowded one on a plot with a fixed
   * height in pixels.
   */
  const LADDER = [10, 5, 2.5, 2, 1];
  const cap = Math.max(2, maxCount);
  const target = Math.min(Math.max(2, targetCount), cap);
  let size = step;
  let best: ChartTick[] | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const found = ticksForStep(size);
    // Finer rungs only ever add labels, so the first count past the cap ends
    // the walk; whatever was accepted before it stands.
    if (found.length > cap) break;
    // Two labels is the minimum that defines a scale at all.
    if (found.length >= 2) {
      best = found;
      if (found.length >= target) break;
    }
    // Next finer rung: 10 → 5 → 2.5 → 2 → 1 → 5 of the decade below. Matched by
    // value rather than by index arithmetic, since 2.5 is not an integer.
    const decade = 10 ** Math.floor(Math.log10(size));
    const rung = size / decade;
    const index = LADDER.findIndex((value) => Math.abs(value - rung) < 1e-9);
    const nextIndex = (index === -1 ? 0 : index) + 1;
    size = nextIndex < LADDER.length ? LADDER[nextIndex] * decade : 5 * (decade / 10);
    if (!Number.isFinite(size) || size <= 0) break;
  }
  return best ?? fallback;
}

/** Evenly spaced instants across the window, for the x axis. */
export function timeTicks(t0: number, t1: number, targetCount = 5): ChartTick[] {
  const span = Math.max(t1 - t0, 1);
  const count = Math.max(2, targetCount);
  return Array.from({ length: count }, (_, index) => {
    const position = index / (count - 1);
    return { value: t0 + span * position, position };
  });
}

/**
 * The instant one step away from `fromTime`, for a scrub driven by keys rather
 * than by a pointer.
 *
 * STEPS BY READING, NOT BY DISTANCE. A 14-day window is ~340 readings across
 * ~700px, so a fixed pixel or millisecond step skips some and lands twice on
 * others, and the reader cannot tell which. `times` is every selectable instant
 * — both series merged, ascending — so one press is one reading, and every
 * landing is on a number that exists.
 *
 * Clamps at both ends rather than wrapping: a hydrograph has a first reading and
 * a newest one, and arriving back at last week from the right-hand edge would be
 * a claim about time.
 *
 * Lives in the model because "which reading is next" is the same question
 * nearestChartPoint answers, and because the app will need it the day its scrub
 * grows an accessibility action.
 */
export function stepScrubTime(times: number[], fromTime: number, step: number): number | null {
  if (!times.length) return null;

  let index = 0;
  let nearest = Infinity;
  for (let i = 0; i < times.length; i += 1) {
    const distance = Math.abs(times[i] - fromTime);
    if (distance < nearest) {
      nearest = distance;
      index = i;
    }
  }

  return times[Math.min(times.length - 1, Math.max(0, index + step))];
}

/** Binary search for the reading under a scrub. Points must be time-sorted. */
export function nearestChartPoint(points: ChartPoint[], targetTime: number): ChartPoint | null {
  if (!points.length) return null;
  let low = 0;
  let high = points.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (points[mid].t < targetTime) low = mid + 1;
    else high = mid;
  }
  const before = points[Math.max(0, low - 1)];
  const after = points[low];
  return Math.abs(before.t - targetTime) <= Math.abs(after.t - targetTime) ? before : after;
}

/**
 * The newest observed point, or NULL — and null is a state every consumer
 * must survive, not an impossibility to assert away. The history endpoint
 * serves forecast-only stations (readings: [] with a real forecast), because
 * NWPS forecasts stations it has no telemetry at. Both renderers used to
 * assume observed[length - 1] existed in half a dozen places each; these two
 * helpers are the names those places reach for instead, so the assumption is
 * visible where it is made.
 */
export function latestObservedPoint(observed: ChartPoint[]): ChartPoint | null {
  return observed.length ? observed[observed.length - 1] : null;
}

/** The first forecast point, or null. A domain is constructible from either
 *  series alone — observed, forecast, or both. */
export function forecastStartPoint(forecast: ChartPoint[]): ChartPoint | null {
  return forecast.length ? forecast[0] : null;
}
