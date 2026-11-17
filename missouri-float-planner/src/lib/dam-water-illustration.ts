import type { DamMetricValue, DamSnapshot } from '@shared/dam-types';
import type { LakeSection } from '@shared/lake-types';
import { readingStaleness } from '@shared/dam-schedule-copy';

/** Web-only pilot. Incomplete snapshots retain the existing release summary. */
export function hasDamWaterIllustration(dam: DamSnapshot): boolean {
  return dam.id === 'swl-table-rock-dam' && validMetric(dam.metrics.poolElevation) &&
    validMetric(dam.metrics.release) && dam.metrics.poolElevation!.value > 0 && dam.metrics.release!.value >= 0;
}

export function validMetric(metric: DamMetricValue | undefined): metric is DamMetricValue {
  return Boolean(metric && Number.isFinite(metric.value) && Number.isFinite(Date.parse(metric.at)));
}

/**
 * USACE's published Table Rock power-pool calendar, in Central local time.
 * https://www.swl-wc.usace.army.mil/pages/data/tabular/htm/tabrock.htm
 * Jan–Apr 30: 915; Apr 30–May 1: 915→916; May 1–Jun 1: 916→917;
 * Jun 1–Nov 30: 917; Nov 30–Dec 1: 917→915; December: 915 ft NGVD29.
 * Compare against the observation's date, never today's date for an old reading.
 * Kept on web: this does not change the lake registry or the iOS/API contract.
 */
export function tableRockSeasonalPoolFt(at: string): number | null {
  if (!Number.isFinite(Date.parse(at))) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
  }).formatToParts(new Date(at));
  const part = (name: string) => Number(parts.find(p => p.type === name)?.value);
  const month = part('month'), day = part('day');
  const fraction = (part('hour') * 60 + part('minute')) / 1440;
  if (month === 4 && day === 30) return 915 + fraction;
  if (month === 5) return 916 + (day - 1 + fraction) / 31;
  if (month >= 6 && month <= 11) return month === 11 && day === 30 ? 917 - 2 * fraction : 917;
  return 915;
}

export function damWaterIllustrationState(dam: DamSnapshot, now: number, lake?: LakeSection | null) {
  const pool = dam.metrics.poolElevation;
  const release = dam.metrics.release;
  const turbine = dam.metrics.generationFlow;
  const spillway = dam.metrics.spillwayFlow;
  const fresh = (m: DamMetricValue | undefined) => validMetric(m) && !m.dailyMean &&
    m.value >= 0 && Date.parse(m.at) <= now + 5 * 60_000 && readingStaleness(m.at, now) === 'fresh';
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
    // Never paint a spillway from total minus turbines, or call missing flow 0.
    turbineActive: fresh(release) && release!.value > 0 && fresh(turbine) && turbine!.value > 0,
    spillwayActive: fresh(release) && release!.value > 0 && fresh(spillway) && spillway!.value > 0,
    change24hFt: lakeMatches && fresh(pool) && Number.isFinite(lake?.change24hFt) ? lake!.change24hFt : undefined,
  };
}
