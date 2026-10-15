import assert from 'node:assert/strict';
import test from 'node:test';
import { widgetGaugeSnapshot, widgetHistorySeries } from '../../shared/condition-widget';
import { CONDITION_SYSTEM } from '../../shared/condition-system';
import { STALE_READING_MS } from '../../shared/reading-staleness';
import type { ChartReadingLike } from '../../shared/chart-model';
import { widgetConfiguration, widgetGaugeCatalog } from '../../../eddy-ios/src/lib/conditionWidgets';
import type { MapGauge } from '../../../packages/eddy-types';

const NOW = Date.parse('2026-10-15T12:00:00Z');
const ladder = {
  riverId: 'huzzah-id', riverName: 'Huzzah Creek', riverSlug: 'huzzah',
  isPrimary: true, distanceFromSectionMiles: 0, thresholdUnit: 'cfs' as const,
  levelTooLow: 50, levelLow: 100, levelOptimalMin: 200, levelOptimalMax: 500,
  levelHigh: 600, levelDangerous: 1000, floodStageFt: 12,
};
const gauge = {
  siteId: '07014000', gaugeHeightFt: 3.2, dischargeCfs: 250,
  readingTimestamp: new Date(NOW - 600_000).toISOString(), readingSuspect: false,
  thresholds: [ladder],
};
const mapGauge: MapGauge = {
  ...gauge, id: 'gauge-id', usgsSiteId: gauge.siteId, name: 'Huzzah Creek near Steelville, MO',
  coordinates: { lat: 38, lng: -91 }, readingAgeHours: 1 / 6, qualifierNote: null,
};
const readings = (hours = 24): ChartReadingLike[] => Array.from({ length: hours + 1 }, (_, index) => ({
  timestamp: new Date(NOW - (hours - index) * 3_600_000).toISOString(),
  dischargeCfs: 200 + index * 10, gaugeHeightFt: 2 + index / 10,
}));

test('widget verdicts use the canonical ladder/colors and preserve observation expiration', () => {
  const result = widgetGaugeSnapshot(gauge, NOW);
  assert.equal(result.conditions[0].code, 'flowing');
  assert.equal(result.conditions[0].solid, CONDITION_SYSTEM.flowing.solid);
  assert.equal(result.conditions[0].ink, CONDITION_SYSTEM.flowing.ink);
  assert.equal(result.conditions[0].unit, 'cfs');
  assert.equal(result.validUntil, NOW - 600_000 + STALE_READING_MS);
  assert.equal(widgetGaugeSnapshot(gauge, NOW + 1000).validUntil, result.validUntil);
});

test('stale, suspect and invalid/future observations cannot carry a condition', () => {
  for (const changed of [
    { readingSuspect: true },
    { readingTimestamp: new Date(NOW - STALE_READING_MS - 1).toISOString() },
    { readingTimestamp: new Date(NOW + 600_000).toISOString() },
    { readingTimestamp: 'not-a-date' }, { readingTimestamp: null },
  ]) assert.equal(widgetGaugeSnapshot({ ...gauge, ...changed }, NOW).conditions[0].code, 'unknown');
  assert.equal(widgetGaugeSnapshot({ ...gauge, readingTimestamp: 'bad' }, NOW).observedAt, null);
});

test('strict units, missing ladders, a real zero and flood stage keep their meaning', () => {
  assert.equal(widgetGaugeSnapshot({ ...gauge, dischargeCfs: null }, NOW).conditions[0].code, 'unknown');
  assert.equal(widgetGaugeSnapshot({ ...gauge, dischargeCfs: 0 }, NOW).dischargeCfs, 0);
  assert.equal(widgetGaugeSnapshot({ ...gauge, dischargeCfs: NaN }, NOW).dischargeCfs, null);
  assert.deepEqual(widgetGaugeSnapshot({ ...gauge, thresholds: null }, NOW).conditions, []);
  const emptyLadder = { ...ladder, levelTooLow: null, levelLow: null, levelOptimalMin: null, levelOptimalMax: null, levelHigh: null, levelDangerous: null };
  assert.equal(widgetGaugeSnapshot({ ...gauge, thresholds: [emptyLadder] }, NOW).conditions[0].code, 'unknown');
  assert.equal(widgetGaugeSnapshot({ ...gauge, gaugeHeightFt: 12, dischargeCfs: null }, NOW).conditions[0].code, 'dangerous');
});

test('a shared physical gauge carries separate river verdicts', () => {
  const other = { ...ladder, riverSlug: 'courtois', levelLow: 300, levelOptimalMin: 500, levelOptimalMax: 800 };
  const result = widgetGaugeSnapshot({ ...gauge, thresholds: [ladder, other] }, NOW);
  assert.deepEqual(result.conditions.map(({ riverSlug, code }) => [riverSlug, code]), [['huzzah', 'flowing'], ['courtois', 'low']]);
});

test('sparklines keep the fixed 24h axis and canonical six-hour trend, never daily means', () => {
  const result = widgetHistorySeries(readings(48), 'instantaneous', NOW)!;
  assert.equal(result.cfs.from, NOW - 86_400_000);
  assert.equal(result.cfs.points[0].t, result.cfs.from);
  assert.equal(result.cfs.to, NOW);
  assert.equal(result.cfs.direction, 'rising');
  assert.equal(result.cfs.trendValidUntil, NOW + 3 * 3_600_000);
  assert.equal(widgetHistorySeries(readings(), 'daily_mean', NOW), null);
  assert.equal(widgetHistorySeries(readings(), 'instantaneous', NOW + 4 * 3_600_000)!.cfs.trend, null);
});

test('flagged and missing readings break lines; trends never bridge an outage', () => {
  for (const change of [{ dischargeCfs: null }, { qualifiers: ['Ice'] }, { gapBefore: ['cfs'] as ('cfs' | 'ft')[] }]) {
    const input = readings();
    input[23] = { ...input[23], ...change };
    const result = widgetHistorySeries(input, 'instantaneous', NOW)!;
    assert.equal(result.cfs.trend, null);
    assert.ok(result.cfs.points.filter(point => point.breakBefore).length > 1);
  }
  const lastMissing = readings();
  lastMissing[24].dischargeCfs = null;
  assert.equal(widgetHistorySeries(lastMissing, 'instantaneous', NOW)!.cfs.trend, null);
});

test('sampling retains peaks and breaks while bounding the extension payload', () => {
  const input = Array.from({ length: 1441 }, (_, i) => ({ timestamp: new Date(NOW - (1440 - i) * 60_000).toISOString(), dischargeCfs: i === 720 ? 10000 : 200, gaugeHeightFt: null }));
  const result = widgetHistorySeries(input, 'instantaneous', NOW)!;
  assert.ok(result.cfs.points.length <= 48);
  assert.equal(Math.max(...result.cfs.points.map(point => point.v)), 10000);
  assert.deepEqual(result.ft.points, []);
  assert.equal(result.ft.trend, null);
});

test('catalog chooses the physical primary for a gauge and the matching primary for a river', () => {
  const borrowed = { ...ladder, riverId: 'courtois-id', riverSlug: 'courtois', riverName: 'Courtois Creek', distanceFromSectionMiles: 5 };
  const catalog = widgetGaugeCatalog([{ ...mapGauge, thresholds: [borrowed, ladder] }]);
  const gaugeStar = { kind: 'gauge', entityId: 'gauge-id', usgsSiteId: gauge.siteId, name: 'Huzzah', slug: '' };
  const riverStar = { kind: 'river', entityId: 'courtois-id', name: 'Courtois', slug: 'courtois' };
  assert.equal(widgetConfiguration(catalog, [gaugeStar]).favorites[0].riverSlug, 'huzzah');
  assert.equal(widgetConfiguration(catalog, [{ ...gaugeStar, usgsSiteId: undefined }]).favorites[0].riverSlug, 'huzzah');
  assert.equal(widgetConfiguration(catalog, [riverStar]).favorites[0].riverSlug, 'courtois');
  assert.equal(catalog[0].stationName, 'Steelville, MO');
  assert.deepEqual(widgetGaugeCatalog([{ ...mapGauge, thresholds: [ladder, borrowed] }]), catalog);
});

test('favorites preserve order, deduplicate, exclude dams, cap at three and clear offline', () => {
  const catalog = widgetGaugeCatalog([mapGauge]);
  const stars = Array.from({ length: 5 }, (_, i) => ({ kind: 'gauge', entityId: String(i), name: `Station ${i}`, slug: '', usgsSiteId: `national-${i}` }));
  const config = widgetConfiguration(catalog, [stars[0], stars[0], { ...stars[0], kind: 'dam' }, ...stars.slice(1)]);
  assert.deepEqual(config.favorites.map(item => item.siteId), ['national-0', 'national-1', 'national-2']);
  assert.ok(config.catalog.some(item => item.siteId === 'national-0'));
  assert.deepEqual(widgetConfiguration(config.catalog, []).favorites, []);
  assert.deepEqual(widgetConfiguration([], [{ kind: 'river', entityId: 'missing', name: 'Missing', slug: 'missing' }]).favorites, []);
});
