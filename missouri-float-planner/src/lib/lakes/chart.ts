// src/lib/lakes/chart.ts
// Geometry for the seven-day lake-level chart: the value domain, the ticks and
// the polyline, as numbers a renderer draws without redoing the scale.
//
// One series, one axis, a dashed reference at the conservation pool. The domain
// is the readings' own range, padded, and pulled out to include the
// conservation pool only when it sits near the data: a lake fifteen feet into
// its flood pool should not have its week flattened to show a line it is
// nowhere near. When the reference falls outside, the renderer says where it is
// in words instead of drawing it.

import { tableRockPoolReferencePoints } from '@shared/lake-pool-reference';
import { niceValueTicks, timeTicks, type ChartTick } from '@shared/chart-model';

export interface LakeChartPoint {
  t: number;
  ft: number;
}

export interface LakeChartModel {
  points: LakeChartPoint[];
  t0: number;
  t1: number;
  minFt: number;
  maxFt: number;
  valueTicks: ChartTick[];
  timeTicks: ChartTick[];
  /** Seasonal samples follow each historical date, including ramp days. */
  referencePoints: LakeChartPoint[];
  referenceLabel: string | null;
  /** Why the reference is not drawn, when it is not. */
  referenceNote: string | null;
}

export const MIN_POINTS = 2;
/**
 * How far outside the week's own range the conservation pool may sit and still
 * be drawn: at least a foot, or twice the week's spread. A quiet week that
 * moved 0.4 ft is not flattened to show a line 5 ft away; a week that moved
 * 3 ft can afford a reference 6 ft off. Past the reach, the note says where it is.
 */
export function referenceReachFt(spreadFt: number): number {
  return Math.max(1, 2 * spreadFt);
}
const PAD_FT = 0.25;

export function lakeChartModel(
  history: Array<[string, number]>,
  options: { seasonalPool?: boolean; conservationFt?: number; now: number; days?: number; valueTickTarget?: number },
): LakeChartModel | null {
  const points = history
    .map(([iso, ft]) => ({ t: Date.parse(iso), ft }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.ft))
    .sort((a, b) => a.t - b.t);
  if (points.length < MIN_POINTS) return null;
  const days = options.days ?? 7;
  const t1 = options.now;
  const t0 = t1 - days * 86_400_000;
  const dataMin = Math.min(...points.map((p) => p.ft));
  const dataMax = Math.max(...points.map((p) => p.ft));
  let minFt = dataMin - PAD_FT;
  let maxFt = dataMax + PAD_FT;
  let referenceNote: string | null = null;
  const ref = options.seasonalPool ? undefined : options.conservationFt;
  let referencePoints: LakeChartPoint[] = [];
  if (options.seasonalPool) {
    referencePoints = tableRockPoolReferencePoints(t0, t1);
  } else if (ref !== undefined && Number.isFinite(ref)) {
    referencePoints = [{ t: t0, ft: ref }, { t: t1, ft: ref }];
  }
  let referenceLabel: string | null = null;
  if (referencePoints.length) {
    const low = Math.min(...referencePoints.map(p => p.ft));
    const high = Math.max(...referencePoints.map(p => p.ft));
    const digits = options.seasonalPool ? 1 : 0;
    const level = low === high ? low.toFixed(digits) : `${low.toFixed(digits)}–${high.toFixed(digits)}`;
    referenceLabel = `${options.seasonalPool ? 'Seasonal' : 'Conservation'} pool ${level} ft`;
    const reach = referenceReachFt(dataMax - dataMin);
    const near = low >= dataMin - reach && high <= dataMax + reach;
    if (near) {
      minFt = Math.min(minFt, low - PAD_FT);
      maxFt = Math.max(maxFt, high + PAD_FT);
    } else {
      const gap = high < dataMin ? dataMin - high : low > dataMax ? low - dataMax : null;
      const gapText = gap === null ? null : gap < 10 ? gap.toFixed(1) : gap.toFixed(0);
      referenceNote = gapText === null ? `${referenceLabel} extends outside this week's range`
        : `${referenceLabel} is ${gapText} ft ${high < dataMin ? 'below' : 'above'} this week's range`;
      referencePoints = [];
    }
  }
  const ticks = niceValueTicks(minFt, maxFt, options.valueTickTarget ?? 3);
  if (ticks.length) {
    minFt = Math.min(minFt, ticks[0].value);
    maxFt = Math.max(maxFt, ticks[ticks.length - 1].value);
  }
  return {
    points,
    t0,
    t1,
    minFt,
    maxFt,
    valueTicks: ticks.map((tick) => ({ value: tick.value, position: (tick.value - minFt) / (maxFt - minFt) })),
    timeTicks: timeTicks(t0, t1, 4),
    referencePoints,
    referenceLabel,
    referenceNote,
  };
}

/** The point nearest an instant, for the hover readout. */
export function nearestPoint(points: LakeChartPoint[], t: number): LakeChartPoint | null {
  let best: LakeChartPoint | null = null;
  for (const p of points) if (!best || Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
  return best;
}
