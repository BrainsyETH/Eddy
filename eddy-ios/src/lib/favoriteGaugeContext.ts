import type { MapGauge } from '@eddy/types';
import { hasLadder } from '@eddy/conditions/condition-ladder';
import { centralDayKey } from '@eddy/conditions/dam-schedule-copy';
import { gaugeFreshness } from '@eddy/conditions/gauge-freshness';
import { gaugeLink } from './gaugeCondition';
import { readingSummarySeason } from './readingSummary';

/** Additional context for saved gauge cards; no requests or fabricated bands. */
export function favoriteGaugeContext(gauge: MapGauge | null, now = Date.now()) {
  const thresholds = gauge ? gaugeLink(gauge) : null;
  const unit = thresholds?.thresholdUnit ?? null;
  const value = unit === 'cfs' ? gauge?.dischargeCfs : unit === 'ft' ? gauge?.gaugeHeightFt : null;
  const trusted = !!gauge && !gauge.readingSuspect && gaugeFreshness(gauge.readingTimestamp, now) === 'live';
  const scale = thresholds && hasLadder(thresholds) && unit && value != null && Number.isFinite(value)
    ? { thresholds, unit, value: trusted ? value : null, muted: !trusted }
    : null;
  const context = gauge?.seasonalContext;
  const asOf = context?.asOf ? Date.parse(context.asOf) : NaN;
  const season = trusted && (gauge?.provider ?? 'usgs') === 'usgs' &&
    gauge?.dischargeCfs != null && Number.isFinite(gauge.dischargeCfs) &&
    context?.unit === 'cfs' && context.parameterCode === '00060' &&
    Number.isFinite(asOf) && asOf <= now + 300_000 && centralDayKey(asOf) === centralDayKey(now)
    ? readingSummarySeason(context.percentile, unit ?? 'cfs', new Date(asOf), gauge.dischargeCfs)
    : null;
  return { scale, season };
}
