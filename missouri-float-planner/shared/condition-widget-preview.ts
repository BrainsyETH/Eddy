// Gallery-only examples, generated through the same presentation contract as
// real readings. The extension rebases dates in memory and never caches these.
import { widgetGaugeSnapshot, widgetHistorySeries } from './condition-widget';

export function conditionWidgetPreview() {
  const generatedAt = Date.parse('2026-01-01T12:00:00Z');
  const examples = [
    ['07067000', 'current', 'Current River', 'Van Buren, MO', 860],
    ['07066000', 'jacks-fork', 'Jacks Fork', 'Eminence, MO', 320],
    ['07071500', 'eleven-point', 'Eleven Point', 'Bardley, MO', 540],
  ] as const;
  const choices = examples.map(([siteId, riverSlug, riverName, stationName]) => ({
    id: `${siteId}|${riverSlug}`, siteId, gaugeId: '', riverId: null, riverSlug,
    riverName, stationName, primaryForRiver: true, defaultForGauge: true,
  }));
  const stations = Object.fromEntries(examples.map(([siteId, riverSlug, , , dischargeCfs]) => {
    const observed = generatedAt - 10 * 60_000;
    // Illustrative thresholds and observations, never a real station verdict.
    const snapshot = widgetGaugeSnapshot({
      siteId, gaugeHeightFt: 3.2, dischargeCfs, readingTimestamp: new Date(observed).toISOString(),
      readingSuspect: false, floodAlerts: [],
      thresholds: [{ riverSlug, thresholdUnit: 'cfs', levelTooLow: 50, levelLow: 100,
        levelOptimalMin: 200, levelOptimalMax: 1000, levelHigh: 1500, levelDangerous: 2000, floodStageFt: null }],
    }, generatedAt);
    const history = widgetHistorySeries(Array.from({ length: 25 }, (_, i) => ({
      timestamp: new Date(observed - (24 - i) * 3_600_000).toISOString(),
      dischargeCfs: dischargeCfs - (24 - i) * 3 + Math.sin(i / 2) * 15,
      gaugeHeightFt: 3.2 - (24 - i) * 0.005 + Math.sin(i / 2) * 0.02,
    })), 'instantaneous', generatedAt);
    return [siteId, { snapshot, history }];
  }));
  return { generatedAt, choices, stations };
}
