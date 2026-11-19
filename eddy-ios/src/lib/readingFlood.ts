import type { GaugeDetail, GaugeFloodStages, GaugeForecastReading, MapGauge, RiverConditionDetail } from '@eddy/types';
import { floodAlertLine, floodAlertsToShow, isFloodWarning } from '@eddy/conditions/flood-alert-copy';
import { FLOOD_STAGE_ORDER, formatStage } from '@eddy/conditions/flood-stage';
import { gaugeFreshness } from '@eddy/conditions/gauge-freshness';
import { forecastCrest, forecastCrestSentence, forecastDayLabel, upcomingForecast } from '@eddy/conditions/gauge-recent';
import { safetySummarySentence, summarizeSafety } from '@eddy/conditions/safety-summary';

export type FloodReading = Pick<GaugeDetail, 'gaugeHeightFt' | 'readingTimestamp' | 'readingSuspect' | 'floodAlerts'> & {
  floodStages: Pick<GaugeFloodStages, 'actionFt' | 'floodFt' | 'moderateFt' | 'majorFt'> | null;
};

/** Map payloads can carry an official flood stage before full station detail arrives. */
export function mapFloodReading(gauge: MapGauge | null | undefined, floodFt: number | null | undefined): FloodReading | null {
  if (!gauge || floodFt == null || !Number.isFinite(floodFt) || floodFt <= 0) return null;
  return {
    gaugeHeightFt: gauge.gaugeHeightFt, readingTimestamp: gauge.readingTimestamp, readingSuspect: gauge.readingSuspect,
    floodStages: { actionFt: null, floodFt, moderateFt: null, majorFt: null },
  };
}


/** A cached river condition belongs only to the station that reported it. */
export function conditionFloodReading(condition: RiverConditionDetail | null | undefined, siteId: string | null): FloodReading | null {
  if (!siteId || condition?.gaugeUsgsId !== siteId) return null;
  return {
    gaugeHeightFt: condition.gaugeHeightFt,
    readingTimestamp: condition.readingTimestamp,
    readingSuspect: condition.accuracyWarning,
    floodStages: condition.floodStages ?? null,
  };
}

/** A station detail supplies official levels and alerts. A newer same-station observation can arrive first on the card. */
export function floodReadingForStation(detail: FloodReading | null, fallback: FloodReading | null, now: number): FloodReading | null {
  if (!detail) return fallback;
  if (!fallback || gaugeFreshness(fallback.readingTimestamp, now) !== 'live') return detail;
  const latest = Date.parse(fallback.readingTimestamp!);
  const previous = Date.parse(detail.readingTimestamp ?? '');
  if (Number.isFinite(previous) && latest <= previous) return detail;
  return { ...detail, gaugeHeightFt: fallback.gaugeHeightFt, readingTimestamp: fallback.readingTimestamp, readingSuspect: fallback.readingSuspect };
}

export function readingFlood(
  gauge: FloodReading | null,
  forecast: readonly GaugeForecastReading[] | null | undefined,
  now: number,
) {
  const stages = gauge?.floodStages;
  const levels = stages && { action: stages.actionFt, flood: stages.floodFt, moderate: stages.moderateFt, major: stages.majorFt };
  const feet = gauge && !gauge.readingSuspect && gaugeFreshness(gauge.readingTimestamp, now) === 'live' ? gauge.gaugeHeightFt : null;
  const current = summarizeSafety({ stages: levels, currentFt: feet });
  const points = upcomingForecast(forecast, now);
  const outlook = summarizeSafety({
    stages: levels, currentFt: null,
    forecast: points.map(point => ({ t: point.timestamp, gaugeHeightFt: point.gaugeHeightFt })),
  });
  const activeAlerts = gauge?.floodAlerts ?? [];
  const notices = floodAlertsToShow(activeAlerts.filter(alert => /flood/i.test(alert.event)), now).map(alert => ({
    text: floodAlertLine(alert, now), emphasized: isFloodWarning(alert),
  }));
  if (current.kind === 'current') notices.push({ text: safetySummarySentence(current), emphasized: true });
  const forecastEscalates = outlook.kind === 'forecast' && (current.kind !== 'current'
    || FLOOD_STAGE_ORDER.indexOf(outlook.category) > FLOOD_STAGE_ORDER.indexOf(current.category));
  if (forecastEscalates) {
    const day = outlook.crossesAt ? forecastDayLabel(outlook.crossesAt, now) : null;
    notices.push({ text: safetySummarySentence(outlook, { forecastDayLabel: day }), emphasized: true });
  }

  const details: { label: string; value: string }[] = [];
  if (levels && current.kind !== 'no_stages') {
    const thresholds: string[] = [];
    for (const key of FLOOD_STAGE_ORDER) {
      const value = levels[key];
      if (value == null || !Number.isFinite(value) || value <= 0) continue;
      const label = key === 'flood' ? 'Flood stage' : key.charAt(0).toUpperCase() + key.slice(1);
      thresholds.push(`${label} ${formatStage(value)}`);
    }
    const status = safetySummarySentence(current);
    const height = feet != null && Number.isFinite(feet) ? ` Gauge height: ${formatStage(feet)}.` : '';
    details.push({ label: 'Flood status', value: status + height });
    details.push({ label: 'Flood levels', value: thresholds.join(' · ') });
  }
  for (const alert of floodAlertsToShow(activeAlerts.filter(alert => !/flood/i.test(alert.event)), now)) {
    details.push({ label: 'NWS outlook', value: floodAlertLine(alert, now) });
  }
  const crestLine = forecastEscalates ? null : forecastCrestSentence(forecastCrest(points, feet, now), now);
  return { notices, details, crestLine };
}

export type ReadingFlood = ReturnType<typeof readingFlood>;
