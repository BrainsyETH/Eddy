import {
  chartDomain,
  chartPoints,
  splitAtGaps,
  alignPriorYear,
  windowCalendarDates,
  chartForecastWindow,
  type ChartPoint,
  type ChartReadingLike,
} from './chart-model';
import { visibleChartGeometry } from './chart-viewport';
import { stationNoon } from './chart-calendar';
import type { ChartLayer, ChartScaleMode } from './chart-share';
import type { GaugeTypicalReadingLike } from './history-normalize';
import { buildZones, type ThresholdValues } from './threshold-zones';

interface AlternateThresholds {
  altLevelTooLow?: number | null;
  altLevelLow?: number | null;
  altLevelOptimalMin?: number | null;
  altLevelOptimalMax?: number | null;
  altLevelHigh?: number | null;
  altLevelDangerous?: number | null;
}
/** Restore the reviewed ladder for the selected measurement, never relabel its units. */
export function thresholdsForUnit<
  T extends ThresholdValues & AlternateThresholds & { thresholdUnit: 'ft' | 'cfs' },
>(link: T | null | undefined, unit: 'ft' | 'cfs'): T | null {
  if (!link) return null;
  if (link.thresholdUnit === unit) return link;
  const alternate = {
    ...link,
    thresholdUnit: unit,
    levelTooLow: link.altLevelTooLow ?? null,
    levelLow: link.altLevelLow ?? null,
    levelOptimalMin: link.altLevelOptimalMin ?? null,
    levelOptimalMax: link.altLevelOptimalMax ?? null,
    levelHigh: link.altLevelHigh ?? null,
    levelDangerous: link.altLevelDangerous ?? null,
  };
  return buildZones(alternate).length ? alternate : null;
}

export function chartReferences(
  unit: 'ft' | 'cfs',
  thresholds?:
    | (ThresholdValues & { thresholdUnit?: 'ft' | 'cfs'; unit?: 'ft' | 'cfs' | null })
    | null,
  stages?: {
    actionFt: number | null;
    floodFt: number | null;
    moderateFt: number | null;
    majorFt: number | null;
  } | null,
): number[] {
  const thresholdUnit = thresholds?.thresholdUnit ?? thresholds?.unit ?? unit;
  return [
    ...(thresholds && thresholdUnit === unit
      ? buildZones(thresholds).flatMap((z) => (z.openEnded ? [z.min] : [z.min, z.max]))
      : []),
    ...(unit === 'ft' && stages
      ? [stages.actionFt, stages.floodFt, stages.moderateFt, stages.majorFt].filter(
          (v): v is number => v !== null && Number.isFinite(v) && v > 0,
        )
      : []),
  ];
}

export function chartValueDomain(
  series: readonly (readonly ChartPoint[])[],
  unit: 'ft' | 'cfs',
  references: number[],
  mode: ChartScaleMode,
  visible?: { start: number; end: number } | null,
) {
  const options = {
    minimumSpan: unit === 'cfs' ? 80 : 0.3,
    minimumSpanFraction: unit === 'cfs' ? 0.18 : 0.08,
    includeAllContext: mode === 'full',
  };
  const all = series.flat().sort((a, b) => a.t - b.t);
  const full = chartDomain(all, unit, references, 0.28, options);
  if (!full) return null;
  const fit =
    mode === 'visible' && visible
      ? chartDomain(visibleChartGeometry(series, visible), unit, references, 0.28, options)
      : null;
  return visible ? { ...(fit ?? full), t0: visible.start, t1: visible.end } : full;
}

/** Shared data-to-geometry preparation, also used by the server image renderer. */
export function chartView(input: {
  readings: ChartReadingLike[];
  forecast: ChartReadingLike[];
  typical: GaugeTypicalReadingLike[];
  prior?: ChartReadingLike[];
  loaded: { from: string; to: string };
  unit: 'ft' | 'cfs';
  timeZone: string;
  layers: ChartLayer[];
  scale: ChartScaleMode;
  references: number[];
  visible?: { start: number; end: number } | null;
}) {
  const { unit, timeZone, loaded, layers } = input;
  const observed = chartPoints(input.readings, unit, timeZone);
  const days = Math.max(
    1,
    Math.ceil((Date.parse(loaded.to) - Date.parse(loaded.from)) / 86_400_000),
  );
  const forecast =
    days >= 365
      ? []
      : chartForecastWindow(
          chartPoints(input.forecast, unit, timeZone),
          Date.parse(loaded.to),
          days,
        );
  const dates = windowCalendarDates(loaded, timeZone);
  const prior =
    unit === 'cfs' && layers.includes('lastYear') && dates
      ? alignPriorYear(input.prior ?? [], unit, dates, loaded, timeZone)
      : [];
  const typical =
    unit === 'cfs'
      ? input.typical.flatMap((row) => {
          const t = stationNoon(row.date, timeZone);
          return t >= Date.parse(loaded.from) && t <= Date.parse(loaded.to) && row.p50Cfs !== null
            ? [{ t, low: row.p25Cfs, high: row.p75Cfs, median: row.p50Cfs }]
            : [];
        })
      : [];
  const point = (t: number, v: number): ChartPoint => ({ t, v, timestamp: '', qualifiers: [] });
  const band = typical.filter((row) => row.low !== null && row.high !== null);
  const series = [
    ...splitAtGaps(observed),
    ...splitAtGaps(forecast),
    ...splitAtGaps(prior),
    ...(layers.includes('typical')
      ? [band.map((row) => point(row.t, row.low!)), band.map((row) => point(row.t, row.high!))]
      : []),
    ...(layers.includes('median') ? [typical.map((row) => point(row.t, row.median))] : []),
  ];
  return {
    observed,
    forecast,
    prior,
    typical,
    domain: chartValueDomain(series, unit, input.references, input.scale, input.visible),
  };
}
