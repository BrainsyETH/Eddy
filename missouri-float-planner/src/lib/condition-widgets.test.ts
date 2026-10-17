import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { widgetGaugeSnapshot, widgetGaugeResponse, widgetHistorySeries, WIDGET_ALERT_LIFETIME_MS, WIDGET_UNDATED_WARNING_LIFETIME_MS } from '../../shared/condition-widget';
import { conditionWidgetPreview } from '../../shared/condition-widget-preview';
import { CONDITION_SYSTEM } from '../../shared/condition-system';
import { STALE_READING_MS } from '../../shared/reading-staleness';
import type { ChartReadingLike } from '../../shared/chart-model';
import { widgetConfiguration, widgetGaugeCatalog } from '../../../eddy-ios/src/lib/conditionWidgets';
import {
  WIDGET_GUIDE, WIDGET_ONBOARDING_KEY, widgetGuideSteps, widgetGuide,
  hasSeenWidgetGuide, markWidgetGuideSeen,
} from '../../../eddy-ios/src/lib/widgetOnboarding';
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

test('widget discovery is a local acknowledgement, not an install or an account setting', async () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { values.set(key, value); },
  };
  assert.equal(await hasSeenWidgetGuide(storage), false);
  await markWidgetGuideSeen(storage);
  assert.equal(await hasSeenWidgetGuide(storage), true);
  assert.equal(values.get(WIDGET_ONBOARDING_KEY), 'seen');

  // A native-store failure should show the invitation again, not block Alerts.
  assert.equal(await hasSeenWidgetGuide({
    getItem: async () => { throw Error('unavailable'); },
    setItem: storage.setItem,
  }), false);
});

test('widget guide follows the real small-versus-medium configuration rules', () => {
  assert.match(widgetGuide('dam', 3).summary, /hourly generation schedule/);
  assert.match(widgetGuide('dam', 2).summary, /next posted schedule change/);
  assert.match(widgetGuide('river', 3).summary, /CFS or FT/);
  assert.equal(WIDGET_GUIDE.river.size, 'Small');
  assert.match(WIDGET_GUIDE.favorites.personalize, /Edit Widget/);
  assert.doesNotMatch(widgetGuide('favorites', 1).personalize, /Edit Widget/);
  assert.match(widgetGuideSteps('dam')[2].detail, /choose a dam/);
  assert.match(widgetGuideSteps('report')[2].detail, /choose a river/);
  assert.equal(WIDGET_GUIDE.favorites.size, 'Medium');
  assert.match(WIDGET_GUIDE.river.personalize, /Edit Widget/);
  assert.match(WIDGET_GUIDE.favorites.personalize, /first three/);
  const smallSteps = widgetGuideSteps('river');
  const mediumSteps = widgetGuideSteps('favorites');
  assert.equal(smallSteps.length, 3);
  assert.deepEqual(smallSteps.map(step => step.title), mediumSteps.map(step => step.title));
  assert.match(smallSteps[0].detail, /Edit, then Add Widget/);
  assert.match(smallSteps[1].detail, /River level/);
  assert.match(mediumSteps[1].detail, /Your rivers/);
  assert.match(mediumSteps[2].detail, /Favorites/);
  const alerts = readFileSync(new URL('../../../eddy-ios/app/(tabs)/(alerts)/alerts.tsx', import.meta.url), 'utf8');
  assert.match(alerts, /<HomeScreenWidgetsIntro \/>/);
});

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

test('NWS warnings are independent of level grades, observation age and rating availability', () => {
  const expires = new Date(NOW + 3_600_000).toISOString();
  for (const changed of [{}, { readingSuspect: true }, { thresholds: null },
    { readingTimestamp: new Date(NOW - STALE_READING_MS - 1).toISOString() }]) {
    const result = widgetGaugeSnapshot({ ...gauge, ...changed, floodAlerts: [{ event: 'Flash Flood Warning', expires }] }, NOW);
    assert.deepEqual(result.floodAlerts, {
      validUntil: NOW + WIDGET_ALERT_LIFETIME_MS,
      undatedWarningUntil: NOW + WIDGET_UNDATED_WARNING_LIFETIME_MS,
      warnings: [{ label: 'Flash Flood Warning', expiresAt: NOW + 3_600_000,
        ink: CONDITION_SYSTEM.dangerous.ink, chipBorder: CONDITION_SYSTEM.dangerous.chipBorder }],
    });
  }
  // A warning does not rewrite the gauge's ladder verdict or reading date.
  const result = widgetGaugeSnapshot({ ...gauge, floodAlerts: [{ event: 'Flood Warning', expires }] }, NOW);
  assert.equal(result.conditions[0].code, 'flowing');
  assert.equal(result.observedAt, NOW - 600_000);
});

test('widget alerts preserve unavailable vs clear, ignore expired alerts/watches, and bound undated warnings', () => {
  assert.equal(widgetGaugeSnapshot(gauge, NOW).floodAlerts, null);
  assert.equal(widgetGaugeSnapshot({ ...gauge, floodAlerts: null }, NOW).floodAlerts, null);
  assert.deepEqual(widgetGaugeSnapshot({ ...gauge, floodAlerts: [] }, NOW).floodAlerts?.warnings, []);
  const alerts = widgetGaugeSnapshot({ ...gauge, floodAlerts: [
    { event: 'Flood Warning', expires: new Date(NOW).toISOString() },
    { event: 'Flood Watch', expires: null }, { event: 'Flood Advisory', expires: null },
    { event: 'Flash Flood Warning', expires: null },
    { event: 'River Flood Warning', expires: 'invalid' },
  ] }, NOW).floodAlerts!;
  assert.deepEqual(alerts.warnings.map(item => [item.label, item.expiresAt]), [
    ['Flash Flood Warning', null], ['River Flood Warning', null],
  ]);
  assert.equal(alerts.validUntil, NOW + WIDGET_ALERT_LIFETIME_MS);
  assert.equal(alerts.undatedWarningUntil, NOW + 24 * 3_600_000);
  // This is a presentation deadline, not an invented NWS expiration.
  assert.ok(alerts.warnings.every(alert => alert.expiresAt === null));
});

test('packaged gallery examples match the canonical presentation and contain useful readings/history', () => {
  const packaged = JSON.parse(readFileSync(new URL('../../../eddy-ios/modules/eddy-live-activity/widget/ConditionsPreview.json', import.meta.url), 'utf8'));
  const expected = conditionWidgetPreview();
  assert.deepEqual(packaged, expected, 'regenerate with node --import tsx scripts/generate-widget-preview.ts');
  assert.equal(packaged.choices.length, 3);
  for (const station of Object.values(expected.stations)) {
    assert.equal(station.snapshot.conditions[0].label, 'Flowing');
    assert.equal(station.snapshot.conditions[0].ink, CONDITION_SYSTEM.flowing.ink);
    assert.ok(station.snapshot.dischargeCfs! > 0);
    assert.ok(station.history!.cfs.points.length > 1);
  }
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


test('native widget foreground refresh is throttled and keeps configuration reloads independent', () => {
  const native = readFileSync(new URL('../../../eddy-ios/modules/eddy-live-activity/ios/EddyLiveActivityModule.swift', import.meta.url), 'utf8');
  const sync = readFileSync(new URL('../../../eddy-ios/src/components/ConditionsWidgetSync.tsx', import.meta.url), 'utf8');
  assert.match(native, /minimumInterval:\s*TimeInterval\s*=\s*15\s*\*\s*60/);
  assert.match(native, /AsyncFunction\("refreshConditionsWidgets"\)/);
  assert.match(native, /AsyncFunction\("readWidgetDiagnostics"\)/);
  assert.match(native, /ConditionsWidgetReloader\.request\(force: true\)/);
  assert.match(sync, /return onForeground\(refresh\)/);
  assert.match(sync, /\brefresh\(\);/);
  assert.match(sync, /if \(AppState\.currentState !== 'active'\) return/);
});

test('widget detail requests opt in to compact server response without bypassing trusted values or flood alerts', () => {
  const source = readFileSync(new URL('../app/api/gauges/[siteId]/route.ts', import.meta.url), 'utf8');
  const native = readFileSync(new URL('../../../eddy-ios/modules/eddy-live-activity/ios/ConditionWidgetData.swift', import.meta.url), 'utf8');
  assert.match(source, /request\.nextUrl\.searchParams\.get\('widget'\)\s*===\s*'1'/);
  assert.match(source, /if \(widgetOnly\) return null;/);
  assert.match(source, /const widgetResponse = widgetGaugeResponse\(/);
  assert.match(source, /NextResponse\.json\(widgetResponse,/);
  assert.match(source, /widget: widgetResponse\.widget/);
  assert.match(source, /floodAlerts: await floodAlertsPromise|const floodAlerts = await floodAlertsPromise/);
  assert.match(source, /thresholds: orderedThresholds\.length > 0/);
  assert.match(native, /URLQueryItem\(name: "widget", value: "1"\)/);
  assert.match(native, /timeout: 12/);
  assert.match(native, /timeout: 8/);
});

test('compact and full responses reuse the same condition, warning, and observation snapshot', () => {
  const alerts = [{ event: 'Flash Flood Warning', expires: new Date(NOW + 3_600_000).toISOString() }];
  const cases = [
    { ...gauge, floodAlerts: alerts },
    { ...gauge, readingSuspect: true, floodAlerts: alerts },
    { ...gauge, readingTimestamp: new Date(NOW - STALE_READING_MS - 1).toISOString(), floodAlerts: alerts },
    { ...gauge, dischargeCfs: 0, floodAlerts: null },
    { ...gauge, dischargeCfs: null, floodAlerts: [] },
  ];
  for (const raw of cases) {
    // The full API envelope has additional metadata; presentation must depend
    // only on the public gauge inputs used by the compact endpoint.
    const fullGauge = { ...raw, name: 'Huzzah Creek', provider: 'usgs', seasonalContext: { percentile: 50 } };
    const compact = widgetGaugeResponse(raw, NOW);
    assert.deepEqual(compact.widget, widgetGaugeSnapshot(fullGauge, NOW));
    assert.deepEqual(compact.gauge, {
      siteId: raw.siteId, gaugeHeightFt: raw.gaugeHeightFt, dischargeCfs: raw.dischargeCfs,
      readingTimestamp: raw.readingTimestamp, readingSuspect: raw.readingSuspect,
    });
    assert.equal(compact.widget.observedAt, Date.parse(raw.readingTimestamp!));
  }
  assert.equal(widgetGaugeResponse({ ...gauge, dischargeCfs: 0 }, NOW).widget.dischargeCfs, 0);
});

test('widget request failures preserve cache and record structured diagnostics', () => {
  const source = readFileSync(new URL('../../../eddy-ios/modules/eddy-live-activity/ios/ConditionWidgetData.swift', import.meta.url), 'utf8');
  for (const expected of ['attemptedAt', 'finishedAt', 'succeededAt', 'observedAt', 'httpStatus',
    'oversized_response', 'site_mismatch', 'invalid_response', 'request_failed', 'http_404',
    'ConditionsWidgetStore.save(value, siteId: siteId)', 'pruneRecords']) {
    assert.ok(source.includes(expected), 'missing widget diagnostics or cache contract: ' + expected);
  }
  assert.match(source, /catch \{[\s\S]*?WidgetRequestError\.invalidJSON/);
  assert.match(source, /case \.timedOut:\s*return \("timeout", nil\)/);
});
