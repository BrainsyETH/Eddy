import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ExpandedGaugeChart from '@/components/gauge/ExpandedGaugeChart';
import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { captureNativeChart, nativeChartView, sharedGaugeDestination } from '../../../../eddy-ios/src/lib/chartSharing';
import { redirectSystemPath } from '../../../../eddy-ios/app/+native-intent';
import { parseChartShare, chartSharePath, chartShareQuery, chartImagePath, chartSharePageRiver, resolutionNotice, chartStatisticForUnit, gaugeSharePath } from '@shared/chart-share';
import { chartView, chartReferences, thresholdsForUnit } from '@shared/chart-view';
import { hasLadder } from '@shared/condition-ladder';
import { chartGeometry } from '@shared/chart-geometry';
import { stationDate, stationNoon, chartStamp, stationDayWindow } from '@shared/chart-calendar';
import { chartPoints, alignPriorYear, priorYearPointFor } from '@shared/chart-model';
import { stationTimeZone, stationTimeZoneFromGeometry } from './station-time-zone';
import { appleAppSiteAssociation } from '../navigation/apple-app-site-association';
import { fixtureState, fixtureHistory, fixtureView, fixtureImageData, fixtureThresholds } from './__fixtures__/chart-share';
import { ChartShareImage } from '../og/chart-share-image';
import { loadOgFonts } from '../og/fonts';
import { GET as imageRoute } from '../../app/api/share/chart/[provider]/[siteId]/image/route';
import { GET as detailRoute } from '../../app/api/gauges/[siteId]/route';
import { gaugeDetailResponse } from './detail-response';

test('a stage share without a ladder keeps the page river and rated vocabulary on both platforms', () => {
  const captured = captureNativeChart({ siteId: fixtureState.siteId, provider: 'usgs', unit: 'ft',
    history: fixtureHistory, matchesRequest: true, comparisonPending: false, layers: [], scale: 'full',
    domain: chartView(fixtureView({ ...fixtureState, unit: 'ft', layers: [], riverId: undefined })).domain });
  assert.ok(captured);
  assert.equal(captured.riverId, undefined);
  const restored = parseChartShare('usgs', captured.siteId, new URLSearchParams(chartShareQuery(captured)))!;
  const secondary = { ...fixtureThresholds, riverId: '22222222-2222-2222-2222-222222222222', isPrimary: false };
  // Both screens use this shared selection rule, independently of chart units.
  const pageRiver = chartSharePageRiver([secondary, fixtureThresholds], restored.riverId);
  assert.equal(pageRiver, fixtureThresholds);
  assert.equal(pageRiver.riverSlug, 'fixture');
  assert.equal(pageRiver.thresholdUnit, 'cfs');
  assert.equal(hasLadder(pageRiver), true);
  assert.equal(thresholdsForUnit(pageRiver, restored.unit), null);
  assert.deepEqual(chartReferences('ft', null, { actionFt: 8, floodFt: 10, moderateFt: 12, majorFt: 15 }), [8, 10, 12, 15]);
  assert.equal(chartSharePageRiver([secondary, fixtureThresholds], secondary.riverId), secondary);
  assert.equal(chartSharePageRiver([fixtureThresholds], secondary.riverId), null, 'a missing explicit river must not silently substitute another ladder');
});

test('a zoomed native view round-trips into web dates, comparisons, geometry and each scale', () => {
  const maxima = new Map<string, number>();
  for (const scale of ['loaded', 'visible', 'full'] as const) {
    const native = nativeChartView(fixtureView({ ...fixtureState, scale }));
    const captured = captureNativeChart({ siteId: fixtureState.siteId, provider: 'usgs', unit: 'cfs', history: fixtureHistory,
      matchesRequest: true, comparisonPending: false, layers: fixtureState.layers, scale, domain: native.domain, riverId: fixtureState.riverId });
    assert.ok(captured);
    const url = new URL(chartSharePath(captured), 'https://eddy.guide');
    const restored = parseChartShare('usgs', captured.siteId, url.searchParams);
    assert.deepEqual(restored, captured);
    assert.notDeepEqual(restored.loaded, restored.visible, 'loaded and zoomed dates must remain distinct');
    const web = chartView(fixtureView(restored));
    assert.deepEqual(web, native);
    assert.equal(web.prior.length, 31);
    const webGeometry = chartGeometry(web, 'cfs', 1010, 290)!;
    const nativeGeometry = chartGeometry(native, 'cfs', 1010, 290)!;
    assert.deepEqual(webGeometry.observed, nativeGeometry.observed);
    assert.deepEqual(webGeometry.prior, nativeGeometry.prior);
    assert.deepEqual(webGeometry.yTicks, nativeGeometry.yTicks);
    maxima.set(scale, web.domain!.max);
  }
  assert.ok(maxima.get('visible')! < maxima.get('loaded')!);
  assert.ok(maxima.get('full')! > maxima.get('loaded')!);
});

test('malformed and unknown versions restore no fields; harmless tracking parameters are allowed', () => {
  const query = chartShareQuery(fixtureState);
  for (const [key, value] of [['v', '2'], ['unit', 'cms'], ['scale', 'automatic'], ['tz', 'Planet/Mars'], ['from', '2026-02-30T00:00:00Z'],
    ['start', fixtureState.visible.to], ['layers', 'median,median'], ['layers', 'paidRead'], ['river', '../other'], ['cfrom', '2026-02-28'], ['to', '2028-01-01T00:00:00Z']]) {
    const params = new URLSearchParams(query); params.set(key, value);
    assert.equal(parseChartShare('usgs', '07067000', params), null, key);
    assert.equal(sharedGaugeDestination(`/share/chart/usgs/07067000?${params}`), '/gauge/07067000?shareUnavailable=1');
  }
  const duplicate = new URLSearchParams(query); duplicate.append('unit', 'ft');
  assert.equal(parseChartShare('usgs', '07067000', duplicate), null);
  assert.equal(parseChartShare('usace', 'bull-shoals', new URLSearchParams(query)), null);
  assert.equal(parseChartShare('usgs', '../07067000', new URLSearchParams(query)), null);
  assert.equal(parseChartShare('usgs', '07067000', new URLSearchParams(query + '&tracking=' + 'x'.repeat(2048))), null);
  assert.ok(parseChartShare('usgs', '07067000', new URLSearchParams(query + '&utm_source=friend')));
});

test('pending or stale data cannot be exported, and stage shares exclude discharge comparisons', () => {
  const input = { siteId: '07067000', provider: 'usgs', unit: 'cfs' as const, history: fixtureHistory, matchesRequest: true,
    comparisonPending: false, layers: fixtureState.layers, scale: fixtureState.scale, domain: chartView(fixtureView()).domain };
  assert.equal(captureNativeChart({ ...input, matchesRequest: false }), null);
  assert.equal(captureNativeChart({ ...input, comparisonPending: true }), null);
  assert.equal(captureNativeChart({ ...input, provider: 'usace' }), null);
  const stage = captureNativeChart({ ...input, unit: 'ft' });
  assert.deepEqual(stage?.layers, []);
  assert.equal(chartStatisticForUnit('daily_mean', 'ft'), 'daily_selected');
  assert.equal(resolutionNotice('instantaneous', 'daily_mean'), 'Showing daily averages.');
  assert.equal(resolutionNotice('instantaneous', 'daily_selected'), 'Showing daily observations.');
});

test('daily dates, DST and leap-day comparisons do not depend on the viewer timezone', () => {
  const previous = process.env.TZ;
  try {
    const results = ['Pacific/Honolulu', 'UTC', 'Asia/Tokyo'].map(zone => {
      process.env.TZ = zone;
      const instant = Date.parse('2026-03-09T04:30:00Z');
      const points = chartPoints([{ timestamp: '2026-03-08', dischargeCfs: 123, gaugeHeightFt: null }], 'cfs', 'America/Chicago');
      const prior = alignPriorYear([{ timestamp: '2023-02-28', dischargeCfs: 10, gaugeHeightFt: null }, { timestamp: '2023-03-01', dischargeCfs: 20, gaugeHeightFt: null }], 'cfs', { from: '2024-02-28', to: '2024-03-01' }, undefined, 'America/Chicago');
      assert.equal(priorYearPointFor(prior, { t: stationNoon('2024-02-29', 'America/Chicago'), timestamp: '2024-02-29', v: 15, qualifiers: [] }, 'America/Chicago'), null);
      return { date: stationDate(instant, 'America/Chicago'), stamp: chartStamp(instant, 'America/Chicago'), points, prior,
        window: stationDayWindow('2026-03-08', '2026-03-08', 'America/Chicago'), view: chartView(fixtureView()) };
    });
    assert.deepEqual(results[0], results[1]); assert.deepEqual(results[1], results[2]);
    assert.equal(results[0].date, '2026-03-08'); assert.match(results[0].stamp, /CDT/);
    assert.equal(Date.parse(results[0].window.to) - Date.parse(results[0].window.from), 23 * 3_600_000 - 1000);
    assert.equal(results[0].points[0].t, Date.parse('2026-03-08T17:00:00Z'));
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});

test('station zones come from catalog geometry, with a deterministic UTC fallback', () => {
  assert.equal(stationTimeZone(37.15, -91.1), 'America/Chicago');
  assert.equal(stationTimeZone(45, -122.6), 'America/Los_Angeles');
  assert.equal(stationTimeZoneFromGeometry({ type: 'Point', coordinates: [-91.1, 37.15] }), 'America/Chicago');
  const ewkb = Buffer.alloc(25); ewkb[0] = 1; ewkb.writeUInt32LE(0x20000001, 1); ewkb.writeUInt32LE(4326, 5); ewkb.writeDoubleLE(-91.1, 9); ewkb.writeDoubleLE(37.15, 17);
  assert.equal(stationTimeZoneFromGeometry(ewkb.toString('hex')), 'America/Chicago');
  for (const bad of [null, 'oops', '01', { type: 'Point', coordinates: [999, 999] }]) assert.equal(stationTimeZoneFromGeometry(bad), 'UTC');
});

test('cold and warm links keep the chart and both station providers; association stays gated', () => {
  const url = `https://eddy.guide${chartSharePath(fixtureState)}`;
  const warm = redirectSystemPath({ path: url, initial: false });
  assert.match(warm, /^\/gauge\/07067000\?chart=/);
  assert.equal(redirectSystemPath({ path: url, initial: true }), `/(tabs)/(today)${warm}`);
  assert.deepEqual(parseChartShare('usgs', '07067000', new URLSearchParams(new URL(warm, 'https://eddy.guide').searchParams.get('chart')!)), fixtureState);
  assert.equal(sharedGaugeDestination(gaugeSharePath({ provider: 'usace', siteId: 'bull-shoals' })), '/dam/bull-shoals');
  assert.equal(sharedGaugeDestination(gaugeSharePath({ provider: 'usgs', siteId: '07067000' })), '/gauge/07067000');
  const invalidStation = '/share/gauge/usgs/not-a-station';
  assert.equal(sharedGaugeDestination(invalidStation), invalidStation);
  assert.equal(redirectSystemPath({ path: invalidStation, initial: true }), invalidStation, 'invalid stations reach the unmatched-link explanation, not Today');
  assert.equal(redirectSystemPath({ path: url.replace('eddy.guide', 'evil.example'), initial: false }), url.replace('eddy.guide', 'evil.example'));
  const paths = (enabled: boolean) => appleAppSiteAssociation(enabled).applinks.details[0].components.map(c => c['/']);
  assert.deepEqual(paths(false), ['/plan/*']);
  assert.deepEqual(paths(true), ['/plan/*', '/share/gauge/*', '/share/chart/*']);
});

test('invalid image requests are rejected before any upstream fetch and cannot be cached', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Must not fetch'); });
  const response = await imageRoute(new NextRequest('https://eddy.guide/api/share/chart/usgs/07067000/image?v=99'), { params: Promise.resolve({ provider: 'usgs', siteId: '07067000' }) });
  assert.equal(response.status, 400); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(fetch.mock.callCount(), 0);
});

test('image query variants redirect to one cache key without fetching or rendering', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Must not fetch'); });
  const canonical = new URL(chartImagePath(fixtureState), 'https://eddy.guide');
  const reordered = new URL(canonical);
  reordered.search = new URLSearchParams([...canonical.searchParams].reverse()).toString();
  for (const url of [canonical.href + '&utm_source=slack', reordered.href, canonical.href.replace('%3A', '%3a')]) {
    const response = await imageRoute(new NextRequest(url), { params: Promise.resolve({ provider: 'usgs', siteId: fixtureState.siteId }) });
    assert.equal(response.status, 308);
    assert.equal(response.headers.get('location'), canonical.href);
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test('public detail and image quotas are separate, with no crawler bypass or cached limiter failure', async t => {
  const previous = { url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN };
  process.env.UPSTASH_REDIS_REST_URL = 'https://limiter.example';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test';
  const keys: string[] = [];
  let unavailable = false;
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    keys.push(JSON.parse(String(init?.body))[0][1]);
    return unavailable ? new Response('', { status: 503 }) : Response.json([{ result: 61 }, { result: 1 }, { result: 60_000 }]);
  });
  try {
    const headers = { 'x-real-ip': '192.0.2.1', 'user-agent': 'Slackbot-LinkExpanding 1.0' };
    const request = new NextRequest('https://eddy.guide/api/gauges/empty', { headers });
    const context = { params: Promise.resolve({ siteId: '' }) };
    assert.equal((await detailRoute(request, context)).status, 429);
    assert.equal((await gaugeDetailResponse(request, context)).status, 400, 'the internal handler must not spend the public quota');
    const imageRequest = new NextRequest(new URL(chartImagePath(fixtureState), 'https://eddy.guide'), { headers });
    const imageContext = { params: Promise.resolve({ provider: 'usgs', siteId: fixtureState.siteId }) };
    const limited = await imageRoute(imageRequest, imageContext);
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('cache-control'), 'no-store');
    assert.deepEqual(keys, ['rl:gauge-detail:192.0.2.1', 'rl:chart-image:192.0.2.1']);
    unavailable = true;
    const failure = await imageRoute(imageRequest, imageContext);
    assert.equal(failure.status, 503);
    assert.equal(failure.headers.get('cache-control'), 'no-store');
  } finally {
    if (previous.url === undefined) delete process.env.UPSTASH_REDIS_REST_URL; else process.env.UPSTASH_REDIS_REST_URL = previous.url;
    if (previous.token === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN; else process.env.UPSTASH_REDIS_REST_TOKEN = previous.token;
  }
});

test('the real Satori renderer produces a PNG from the shared chart geometry', async () => {
  const data = fixtureImageData();
  const image = new ImageResponse(createElement(ChartShareImage, { data }), { width: 1200, height: 630, fonts: loadOgFonts() });
  const bytes = Buffer.from(await image.arrayBuffer());
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG'); assert.ok(bytes.length > 10_000);
  assert.equal(bytes.readUInt32BE(16), 1200); assert.equal(bytes.readUInt32BE(20), 630);
});

test('alternate thresholds retain their units and absent ladders cannot be fabricated', () => {
  const primary = fixtureImageData().thresholds!;
  assert.equal(thresholdsForUnit(primary, 'ft'), null);
  const alternate = thresholdsForUnit({ ...primary, altLevelTooLow: 1, altLevelLow: 2 }, 'ft');
  assert.equal(alternate?.thresholdUnit, 'ft'); assert.equal(alternate?.levelLow, 2);
  assert.equal(alternate?.levelDangerous, null);
  assert.equal(thresholdsForUnit(primary, 'cfs'), primary);
});

test('a shared chart can initially be open during server rendering without touching document', () => {
  const client = new QueryClient();
  assert.equal(renderToString(createElement(QueryClientProvider, { client }, createElement(ExpandedGaugeChart, {
    open: true, onClose: () => {}, initialShareState: fixtureState, siteId: fixtureState.siteId,
    siteName: 'Fixture station', displayUnit: 'cfs', showTypical: true, lastYearOn: true, onLastYearChange: () => {},
    capabilities: { maxInstantDays: 90, supportsDaily: true, supportsCustomRange: true },
  }))), '');
  client.clear();
});
