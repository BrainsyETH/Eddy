import { normalizeGaugeHistory } from '@shared/history-normalize';
import { stationDate } from '@shared/chart-calendar';
import type { ChartShareState } from '@shared/chart-share';
import { chartView, chartReferences } from '@shared/chart-view';
import type { ChartImageData } from '@/lib/og/chart-share-image';

const start = Date.parse('2026-03-01T06:00:00Z');
export const fixtureState: ChartShareState = {
  riverId: '11111111-1111-1111-1111-111111111111',
  version: 1, provider: 'usgs', siteId: '07067000', unit: 'cfs',
  loaded: { from: new Date(start).toISOString(), to: new Date(start + 30 * 86_400_000).toISOString() },
  visible: { from: '2026-03-20T05:00:00.000Z', to: '2026-03-25T05:00:00.000Z' },
  calendar: { from: '2026-03-01', to: '2026-03-31' },
  layers: ['typical', 'median', 'lastYear'], scale: 'visible', statistic: 'instantaneous', timeZone: 'America/Chicago',
};
export const fixtureHistory = normalizeGaugeHistory({
  siteId: '07067000', siteName: 'Fixture River at Sample Station', requestedWindow: fixtureState.loaded,
  timeZone: fixtureState.timeZone, resolution: 'instant', statistic: 'instantaneous',
  readings: Array.from({ length: 121 }, (_, i) => ({ timestamp: new Date(start + i * 6 * 3_600_000).toISOString(),
    dischargeCfs: i < 20 ? 12_000 - i * 500 : Math.round(600 + 180 * Math.sin(i / 6)), gaugeHeightFt: 2 + Math.sin(i / 6), qualifiers: ['P'], ...(i === 84 ? { gapBefore: ['cfs' as const, 'ft' as const] } : {}) })),
  typical: Array.from({ length: 31 }, (_, i) => ({ date: stationDate(start + i * 86_400_000, fixtureState.timeZone),
    p25Cfs: 350, p50Cfs: 600, p75Cfs: 900, yearsOfRecord: 35 })), forecast: [], coverageComplete: true,
})!;
export const fixturePrior = Array.from({ length: 31 }, (_, i) => ({ timestamp: `2025-03-${String(i + 1).padStart(2, '0')}`,
  dischargeCfs: 700 + 100 * Math.sin(i), gaugeHeightFt: null }));
export const fixtureThresholds = { riverId: '11111111-1111-1111-1111-111111111111', riverName: 'Fixture River', riverSlug: 'fixture', isPrimary: true,
  thresholdUnit: 'cfs' as const, levelTooLow: 200, levelLow: 300, levelOptimalMin: 450, levelOptimalMax: 1000, levelHigh: 1800, levelDangerous: 30000, floodStageFt: null };
export function fixtureView(state = fixtureState) {
  return { ...fixtureHistory, prior: fixturePrior, loaded: state.loaded, unit: state.unit, timeZone: state.timeZone,
    layers: state.layers, scale: state.scale, references: chartReferences(state.unit, state.riverId ? fixtureThresholds : null),
    visible: { start: Date.parse(state.visible.from), end: Date.parse(state.visible.to) } };
}
export function fixtureImageData(state = fixtureState): ChartImageData {
  return { state, gauge: { name: fixtureHistory.siteName, floodStages: null }, history: fixtureHistory,
    view: chartView(fixtureView(state)), thresholds: state.riverId ? fixtureThresholds : null, generatedAt: '2026-04-01T14:00:00Z' };
}
