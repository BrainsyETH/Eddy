import type { DamMetricValue, DamSnapshot } from '@shared/dam-types';
import type { LakeSection } from '@shared/lake-types';
import { tableRockSeasonalPoolFt } from './lakes/pool-reference';
export { tableRockSeasonalPoolFt } from './lakes/pool-reference';
import { readingStaleness } from '@shared/dam-schedule-copy';

/** Web-only pilot. Incomplete snapshots retain the existing release summary. */
export function hasDamWaterIllustration(dam: DamSnapshot): boolean {
  return dam.id === 'swl-table-rock-dam' && validMetric(dam.metrics.poolElevation) &&
    validMetric(dam.metrics.release) && dam.metrics.poolElevation!.value > 0 && dam.metrics.release!.value >= 0;
}

export function validMetric(metric: DamMetricValue | undefined): metric is DamMetricValue {
  return Boolean(metric && Number.isFinite(metric.value) && Number.isFinite(Date.parse(metric.at)));
}

export function damWaterIllustrationState(dam: DamSnapshot, now: number, lake?: LakeSection | null) {
  const pool = dam.metrics.poolElevation;
  const release = dam.metrics.release;
  const turbine = dam.metrics.generationFlow;
  const spillway = dam.metrics.spillwayFlow;
  const fresh = (m: DamMetricValue | undefined) => currentWaterMetric(m, now);
  const seasonalFt = pool ? tableRockSeasonalPoolFt(pool.at) : null;
  // A schematic exaggerates small level changes; the caption explicitly says
  // not to scale. Clamp only the drawing, never the displayed measurements.
  const surfaceY = pool && seasonalFt !== null
    ? Math.max(60, Math.min(155, 98 - (pool.value - seasonalFt) * 5)) : 98;
  const lakeMatches = lake?.slug === 'table-rock' && lake.pool && pool &&
    Date.parse(lake.pool.at) === Date.parse(pool.at) && Math.abs(lake.pool.valueFt - pool.value) < .001;
  return {
    seasonalFt,
    surfaceY,
    releaseActive: fresh(release) && release!.value > 0,
    poolFresh: fresh(pool),
    // Never paint a spillway from total minus turbines, or call missing flow 0.
    turbineActive: fresh(release) && release!.value > 0 && fresh(turbine) && turbine!.value > 0,
    spillwayActive: fresh(release) && release!.value > 0 && fresh(spillway) && spillway!.value > 0,
    change24hFt: lakeMatches && fresh(pool) && Number.isFinite(lake?.change24hFt) ? lake!.change24hFt : undefined,
  };
}

/** Daily means and future timestamps must never drive current motion. */
export function currentWaterMetric(metric: DamMetricValue | undefined, now: number): boolean {
  return validMetric(metric) && !metric.dailyMean && metric.value >= 0 &&
    Date.parse(metric.at) <= now + 5 * 60_000 && readingStaleness(metric.at, now) === 'fresh';
}
