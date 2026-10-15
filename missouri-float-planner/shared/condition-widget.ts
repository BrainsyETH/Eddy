// The native widget consumes presentation values, not a second Swift copy of
// Eddy's condition ladder. Dates are epoch milliseconds, including expiration:
// a cached response must never renew the age of an observation.
import { classifyReading, type ConditionThresholds } from './condition-ladder';
import { CONDITION_SYSTEM } from './condition-system';
import { observationAgeHours } from './gauge-freshness';
import { STALE_READING_MS } from './reading-staleness';
import { recentTrend, TREND_MAX_LATEST_AGE_HOURS } from './gauge-recent';
import { hasSuspectQualifier } from './reading-trust';
import { samplePreservingExtrema, splitAtGaps, type ChartReadingLike } from './chart-model';
import type { ReadingUnit } from './reading-unit';
import { floodAlertsToShow, isFloodWarning, type FloodAlertLike } from './flood-alert-copy';

interface WidgetGaugeInput {
  siteId: string;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  readingTimestamp: string | null;
  readingSuspect: boolean;
  thresholds: (ConditionThresholds & { riverSlug: string | null })[] | null;
  floodAlerts?: readonly FloodAlertLike[] | null;
}
const finite = (value: number | null) => value !== null && Number.isFinite(value) ? value : null;
// Presentation lifetime, not an assertion that NWS was fetched at `now`:
// the existing point lookup can itself be cached for five minutes.
export const WIDGET_ALERT_LIFETIME_MS = 15 * 60_000;

function widgetFloodAlerts(alerts: WidgetGaugeInput['floodAlerts'], now: number) {
  if (alerts == null) return null; // unavailable is different from a successful empty lookup
  const { ink, chipBorder } = CONDITION_SYSTEM.dangerous;
  return {
    validUntil: now + WIDGET_ALERT_LIFETIME_MS,
    warnings: floodAlertsToShow(alerts.filter(isFloodWarning), now, alerts.length).map(alert => ({
      label: alert.event,
      expiresAt: alert.expires && Number.isFinite(Date.parse(alert.expires)) ? Date.parse(alert.expires) : null,
      ink, chipBorder,
    })),
  };
}

export function widgetGaugeSnapshot(gauge: WidgetGaugeInput, now = Date.now()) {
  const age = observationAgeHours(gauge.readingTimestamp, now);
  const observedAt = age === null ? null : Date.parse(gauge.readingTimestamp!);
  const heightFt = finite(gauge.gaugeHeightFt);
  const dischargeCfs = finite(gauge.dischargeCfs);
  const trusted = observedAt !== null && now <= observedAt + STALE_READING_MS && !gauge.readingSuspect;
  return {
    version: 1,
    siteId: gauge.siteId,
    observedAt,
    validUntil: observedAt === null ? null : observedAt + STALE_READING_MS,
    heightFt,
    dischargeCfs,
    suspect: gauge.readingSuspect,
    floodAlerts: widgetFloodAlerts(gauge.floodAlerts, now),
    conditions: (gauge.thresholds ?? []).map(threshold => {
      const code = trusted ? classifyReading(heightFt, threshold, dischargeCfs, { strictUnit: true }) : 'unknown';
      const { label, solid, ink, chipBorder } = CONDITION_SYSTEM[code];
      return { riverSlug: threshold.riverSlug, unit: threshold.thresholdUnit ?? 'ft', code, label, solid, ink, chipBorder };
    }),
  };
}
export type WidgetGaugeSnapshot = ReturnType<typeof widgetGaugeSnapshot>;

function seriesForUnit(readings: readonly ChartReadingLike[], unit: ReadingUnit, now: number) {
  let interrupted = false;
  const points: { t: number; v: number; breakBefore?: boolean; reading: ChartReadingLike }[] = [];
  for (const reading of [...readings].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))) {
    const t = Date.parse(reading.timestamp);
    if (!Number.isFinite(t) || t > now || t < now - 86_400_000) continue;
    const v = finite(unit === 'ft' ? reading.gaugeHeightFt : reading.dischargeCfs);
    if (v === null || hasSuspectQualifier(reading.qualifiers ?? [])) {
      interrupted = true;
      continue;
    }
    points.push({ t, v, reading, breakBefore: interrupted || reading.gapBefore?.includes(unit) ? true : undefined });
    interrupted = false;
  }
  const segments = splitAtGaps(points);
  const last = segments.at(-1) ?? [];
  const trend = interrupted ? null : recentTrend(last.map(point => point.reading), unit, now);
  const latest = last.at(-1)?.t ?? null;
  // Bound the extension payload even for a pathological, fragmented series.
  // Keep breaks and extrema; never bridge a missing/flagged observation.
  const selected = segments.slice(-8).flatMap(segment =>
    samplePreservingExtrema(segment, Math.max(4, Math.floor(48 * segment.length / Math.max(1, points.length))), point => point.v)
      .map((point, index) => ({ t: point.t, v: point.v, breakBefore: index === 0 })),
  );
  return {
    points: selected,
    from: now - 86_400_000,
    to: now,
    observedAt: latest,
    trend: trend?.label ?? null,
    direction: trend?.direction ?? null,
    trendValidUntil: latest === null ? null : latest + TREND_MAX_LATEST_AGE_HOURS * 3_600_000,
  };
}

export function widgetHistorySeries(readings: readonly ChartReadingLike[], statistic: string, now = Date.now()) {
  // A daily mean cannot support an instantaneous six-hour trend or sparkline.
  if (statistic !== 'instantaneous') return null;
  return { cfs: seriesForUnit(readings, 'cfs', now), ft: seriesForUnit(readings, 'ft', now) };
}
