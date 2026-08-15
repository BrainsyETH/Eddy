// Canonical hydrograph math shared by the website and the native app.
// Renderers own pixels and gestures; this file owns what the picture means.

export type ChartUnit = 'ft' | 'cfs';

export interface ChartReadingLike {
  timestamp: string;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  qualifiers?: string[] | null;
}
export interface ChartPoint {
  t: number;
  v: number;
  timestamp: string;
  qualifiers: string[];
}

export interface ChartDomain { min: number; max: number; t0: number; t1: number }
export interface ChartTick { value: number; position: number }

export function valueForUnit(reading: ChartReadingLike, unit: ChartUnit): number | null {
  const value = unit === 'cfs' ? reading.dischargeCfs : reading.gaugeHeightFt;
  return value !== null && Number.isFinite(value) ? value : null;
}

/** Sorted, real observations only. Missing values become gaps, never fake points. */
export function chartPoints(readings: ChartReadingLike[], unit: ChartUnit): ChartPoint[] {
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

/** Split where telemetry stopped; median cadence resists existing outliers. */
export function splitAtGaps(points: ChartPoint[], multiple = 4): ChartPoint[][] {
  if (points.length < 2) return points.length ? [points] : [];
  const intervals = points.slice(1).map((point, index) => point.t - points[index].t)
    .filter((interval) => interval > 0).sort((a, b) => a - b);
  const cadence = intervals[Math.floor(intervals.length / 2)] ?? 1;
  const segments: ChartPoint[][] = [[points[0]]];
  for (let index = 1; index < points.length; index += 1) {
    if (points[index].t - points[index - 1].t > cadence * multiple) segments.push([]);
    segments[segments.length - 1].push(points[index]);
  }
  return segments;
}

/** Keep endpoints and every time bucket's low/high; modulo sampling erases peaks. */
export function samplePreservingExtrema<T>(
  values: T[], maxPoints: number, valueOf: (value: T) => number | null,
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
      if (value < low) { low = value; lowIndex = index; }
      if (value > high) { high = value; highIndex = index; }
    }
    if (lowIndex !== null) selected.add(lowIndex);
    if (highIndex !== null) selected.add(highIndex);
  }
  return [...selected].sort((a, b) => a - b).slice(0, maxPoints).map((index) => values[index]);
}

export function chartDomain(
  points: ChartPoint[], unit: ChartUnit, contextValues: number[] = [], nearFraction = 0.75,
): ChartDomain | null {
  if (!points.length) return null;
  let min = Math.min(...points.map((point) => point.v));
  let max = Math.max(...points.map((point) => point.v));
  const dataRange = max - min || Math.max(Math.abs(max) * 0.1, unit === 'cfs' ? 10 : 0.2);
  const reach = dataRange * nearFraction;
  for (const value of contextValues) {
    if (!Number.isFinite(value)) continue;
    if (value < min && value >= min - reach) min = value;
    if (value > max && value <= max + reach) max = value;
  }
  const pad = (max - min || dataRange) * 0.08;
  return { min: Math.max(0, min - pad), max: max + pad, t0: points[0].t, t1: points.at(-1)!.t };
}

/** Human-scale linear ticks. Non-linear scales must never appear silently. */
export function niceValueTicks(min: number, max: number, targetCount = 4): ChartTick[] {
  const span = Math.max(max - min, Number.EPSILON);
  const rough = span / Math.max(1, targetCount - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const residual = rough / magnitude;
  const step = (residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10) * magnitude;
  const ticks: ChartTick[] = [];
  for (let value = Math.ceil(min / step) * step; value <= max + step * 0.001; value += step) {
    ticks.push({ value, position: (value - min) / span });
  }
  return ticks.length >= 2 ? ticks : [{ value: min, position: 0 }, { value: max, position: 1 }];
}

export function timeTicks(t0: number, t1: number, targetCount = 5): ChartTick[] {
  const span = Math.max(t1 - t0, 1);
  const count = Math.max(2, targetCount);
  return Array.from({ length: count }, (_, index) => {
    const position = index / (count - 1);
    return { value: t0 + span * position, position };
  });
}

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
