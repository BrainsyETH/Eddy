import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import GaugeHistoryChart from '@/components/gauge/GaugeHistoryChart';
import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import {
  captureNativeChart,
  nativeChartView,
  sharedGaugeDestination,
} from '../../../../eddy-ios/src/lib/chartSharing';
import { redirectSystemPath } from '../../../../eddy-ios/app/+native-intent';
import {
  parseChartShare,
  chartSharePath,
  chartShareQuery,
  chartImagePath,
  chartSharePageRiver,
  resolutionNotice,
  chartStatisticForUnit,
  gaugeSharePath,
} from '@shared/chart-share';
import { chartView, chartReferences, thresholdsForUnit } from '@shared/chart-view';
import { hasLadder } from '@shared/condition-ladder';
import { chartGeometry } from '@shared/chart-geometry';
import { stationDate, stationNoon, chartStamp, stationDayWindow } from '@shared/chart-calendar';
import { chartPoints, alignPriorYear, priorYearPointFor } from '@shared/chart-model';
import { stationTimeZone, stationTimeZoneForSite } from './station-time-zone';
import { appleAppSiteAssociation } from '../navigation/apple-app-site-association';
import {
  fixtureState,
  fixtureHistory,
  fixtureView,
  fixtureImageData,
  fixtureThresholds,
} from './__fixtures__/chart-share';
import { ChartShareImage } from '../og/chart-share-image';
import { loadOgFonts } from '../og/fonts';
import { GET as imageRoute } from '../../app/api/share/chart/[provider]/[siteId]/image/route';
import { GET as detailRoute } from '../../app/api/gauges/[siteId]/route';
import { gaugeDetailResponse } from './detail-response';
import { gaugeHistoryResponse } from './history-response';
import { loadChartShareData } from './chart-share-data';
import { getFlowProvider } from '../flow-providers';

test('a stage share without a ladder keeps the page river and rated vocabulary on both platforms', () => {
  const captured = captureNativeChart({
    siteId: fixtureState.siteId,
    provider: 'usgs',
    unit: 'ft',
    history: fixtureHistory,
    matchesRequest: true,
    comparisonPending: false,
    layers: [],
    scale: 'full',
    domain: chartView(fixtureView({ ...fixtureState, unit: 'ft', layers: [], riverId: undefined }))
      .domain,
  });
  assert.ok(captured);
  assert.equal(captured.riverId, undefined);
  const restored = parseChartShare(
    'usgs',
    captured.siteId,
    new URLSearchParams(chartShareQuery(captured)),
  )!;
  const secondary = {
    ...fixtureThresholds,
    riverId: '22222222-2222-2222-2222-222222222222',
    isPrimary: false,
  };
  // Both screens use this shared selection rule, independently of chart units.
  const pageRiver = chartSharePageRiver([secondary, fixtureThresholds], restored.riverId);
  assert.equal(pageRiver, fixtureThresholds);
  assert.equal(pageRiver.riverSlug, 'fixture');
  assert.equal(pageRiver.thresholdUnit, 'cfs');
  assert.equal(hasLadder(pageRiver), true);
  assert.equal(thresholdsForUnit(pageRiver, restored.unit), null);
  assert.deepEqual(
    chartReferences('ft', null, { actionFt: 8, floodFt: 10, moderateFt: 12, majorFt: 15 }),
    [8, 10, 12, 15],
  );
  assert.equal(chartSharePageRiver([secondary, fixtureThresholds], secondary.riverId), secondary);
  assert.equal(
    chartSharePageRiver([fixtureThresholds], secondary.riverId),
    null,
    'a missing explicit river must not silently substitute another ladder',
  );
});

test('a zoomed native view round-trips into web dates, comparisons, geometry and each scale', () => {
  const maxima = new Map<string, number>();
  for (const scale of ['loaded', 'visible', 'full'] as const) {
    const native = nativeChartView(fixtureView({ ...fixtureState, scale }));
    const captured = captureNativeChart({
      siteId: fixtureState.siteId,
      provider: 'usgs',
      unit: 'cfs',
      history: fixtureHistory,
      matchesRequest: true,
      comparisonPending: false,
      layers: fixtureState.layers,
      scale,
      domain: native.domain,
      riverId: fixtureState.riverId,
    });
    assert.ok(captured);
    const url = new URL(chartSharePath(captured), 'https://eddy.guide');
    const restored = parseChartShare('usgs', captured.siteId, url.searchParams);
    assert.deepEqual(restored, captured);
    assert.notDeepEqual(
      restored.loaded,
      restored.visible,
      'loaded and zoomed dates must remain distinct',
    );
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
  for (const [key, value] of [
    ['v', '2'],
    ['unit', 'cms'],
    ['scale', 'automatic'],
    ['tz', 'Planet/Mars'],
    ['from', '2026-02-30T00:00:00Z'],
    ['start', fixtureState.visible.to],
    ['layers', 'median,median'],
    ['layers', 'paidRead'],
    ['river', '../other'],
    ['cfrom', '2026-02-28'],
    ['to', '2028-01-01T00:00:00Z'],
  ]) {
    const params = new URLSearchParams(query);
    params.set(key, value);
    assert.equal(parseChartShare('usgs', '07067000', params), null, key);
    assert.equal(
      sharedGaugeDestination(`/share/chart/usgs/07067000?${params}`),
      '/gauge/07067000?shareUnavailable=1',
    );
  }
  const duplicate = new URLSearchParams(query);
  duplicate.append('unit', 'ft');
  assert.equal(parseChartShare('usgs', '07067000', duplicate), null);
  assert.equal(parseChartShare('usace', 'bull-shoals', new URLSearchParams(query)), null);
  assert.equal(parseChartShare('usgs', '../07067000', new URLSearchParams(query)), null);
  assert.equal(
    parseChartShare(
      'usgs',
      '07067000',
      new URLSearchParams(query + '&tracking=' + 'x'.repeat(2048)),
    ),
    null,
  );
  assert.ok(parseChartShare('usgs', '07067000', new URLSearchParams(query + '&utm_source=friend')));
});

test('pending or stale data cannot be exported, and stage shares exclude discharge comparisons', () => {
  const input = {
    siteId: '07067000',
    provider: 'usgs',
    unit: 'cfs' as const,
    history: fixtureHistory,
    matchesRequest: true,
    comparisonPending: false,
    layers: fixtureState.layers,
    scale: fixtureState.scale,
    domain: chartView(fixtureView()).domain,
  };
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
    const results = ['Pacific/Honolulu', 'UTC', 'Asia/Tokyo'].map((zone) => {
      process.env.TZ = zone;
      const instant = Date.parse('2026-03-09T04:30:00Z');
      const points = chartPoints(
        [{ timestamp: '2026-03-08', dischargeCfs: 123, gaugeHeightFt: null }],
        'cfs',
        'America/Chicago',
      );
      const prior = alignPriorYear(
        [
          { timestamp: '2023-02-28', dischargeCfs: 10, gaugeHeightFt: null },
          { timestamp: '2023-03-01', dischargeCfs: 20, gaugeHeightFt: null },
        ],
        'cfs',
        { from: '2024-02-28', to: '2024-03-01' },
        undefined,
        'America/Chicago',
      );
      assert.equal(
        priorYearPointFor(
          prior,
          {
            t: stationNoon('2024-02-29', 'America/Chicago'),
            timestamp: '2024-02-29',
            v: 15,
            qualifiers: [],
          },
          'America/Chicago',
        ),
        null,
      );
      return {
        date: stationDate(instant, 'America/Chicago'),
        stamp: chartStamp(instant, 'America/Chicago'),
        points,
        prior,
        window: stationDayWindow('2026-03-08', '2026-03-08', 'America/Chicago'),
        view: chartView(fixtureView()),
      };
    });
    assert.deepEqual(results[0], results[1]);
    assert.deepEqual(results[1], results[2]);
    assert.equal(results[0].date, '2026-03-08');
    assert.match(results[0].stamp, /CDT/);
    assert.equal(
      Date.parse(results[0].window.to) - Date.parse(results[0].window.from),
      23 * 3_600_000 - 1000,
    );
    assert.equal(results[0].points[0].t, Date.parse('2026-03-08T17:00:00Z'));
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test('station zones use the same projected coordinates as detail and reject lookup outages', async () => {
  assert.equal(stationTimeZone(37.15, -91.1), 'America/Chicago');
  assert.equal(stationTimeZone(45, -122.6), 'America/Los_Angeles');
  for (const [lat, lng] of [
    [null, null],
    [0, 0],
    [999, 999],
    [NaN, 1],
  ]) {
    assert.equal(stationTimeZone(lat, lng), 'UTC');
  }
  const client = {
    rpc: async (name: string, params: unknown) => {
      assert.equal(name, 'search_gauges');
      assert.deepEqual(params, { p_query: '07067000', p_limit: 50 });
      return {
        data: [
          { site_id: '070670001', lat: 45, lng: -122.6 },
          { site_id: '07067000', lat: 37.15, lng: -91.1 },
        ],
        error: null,
      };
    },
  } as unknown as Parameters<typeof stationTimeZoneForSite>[0];
  assert.equal(await stationTimeZoneForSite(client, '07067000'), 'America/Chicago');
  const failed = {
    rpc: async () => ({ data: null, error: { message: 'offline' } }),
  } as unknown as typeof client;
  await assert.rejects(stationTimeZoneForSite(failed, '07067000'), /lookup unavailable/);
});

test('new links retain a unique river slug fallback while old UUID-only links stay valid', () => {
  const state = { ...fixtureState, riverSlug: 'fixture' };
  assert.deepEqual(
    parseChartShare('usgs', state.siteId, new URLSearchParams(chartShareQuery(state))),
    state,
  );
  const reseeded = { ...fixtureThresholds, riverId: '22222222-2222-2222-2222-222222222222' };
  assert.equal(chartSharePageRiver([reseeded], state.riverId, state.riverSlug), reseeded);
  assert.equal(chartSharePageRiver([reseeded], state.riverId), null);
  assert.equal(
    chartSharePageRiver(
      [reseeded, { ...reseeded, riverId: 'another' }],
      state.riverId,
      state.riverSlug,
    ),
    null,
  );
  assert.equal(
    chartSharePageRiver([{ ...reseeded, riverSlug: 'other' }], state.riverId, state.riverSlug),
    null,
  );
  const duplicate = new URLSearchParams(chartShareQuery(state));
  duplicate.append('rslug', 'other');
  assert.equal(parseChartShare('usgs', state.siteId, duplicate), null);
});

test('cold and warm links keep the chart and both station providers; association stays gated', () => {
  const url = `https://eddy.guide${chartSharePath(fixtureState)}`;
  const warm = redirectSystemPath({ path: url, initial: false });
  assert.match(warm, /^\/gauge\/07067000\?chart=/);
  assert.equal(redirectSystemPath({ path: url, initial: true }), `/(tabs)/(today)${warm}`);
  assert.deepEqual(
    parseChartShare(
      'usgs',
      '07067000',
      new URLSearchParams(new URL(warm, 'https://eddy.guide').searchParams.get('chart')!),
    ),
    fixtureState,
  );
  assert.equal(
    sharedGaugeDestination(gaugeSharePath({ provider: 'usace', siteId: 'bull-shoals' })),
    '/dam/bull-shoals',
  );
  assert.equal(
    sharedGaugeDestination(gaugeSharePath({ provider: 'usgs', siteId: '07067000' })),
    '/gauge/07067000',
  );
  const invalidStation = '/share/gauge/usgs/not-a-station';
  assert.equal(sharedGaugeDestination(invalidStation), invalidStation);
  assert.equal(
    redirectSystemPath({ path: invalidStation, initial: true }),
    invalidStation,
    'invalid stations reach the unmatched-link explanation, not Today',
  );
  assert.equal(
    redirectSystemPath({ path: url.replace('eddy.guide', 'evil.example'), initial: false }),
    url.replace('eddy.guide', 'evil.example'),
  );
  const paths = (enabled: boolean) =>
    appleAppSiteAssociation(enabled).applinks.details[0].components.map((c) => c['/']);
  assert.deepEqual(paths(false), ['/plan/*']);
  assert.deepEqual(paths(true), ['/plan/*', '/share/gauge/*', '/share/chart/*']);
});

test('invalid image requests are rejected before any upstream fetch and cannot be cached', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('Must not fetch');
  });
  const response = await imageRoute(
    new NextRequest('https://eddy.guide/api/share/chart/usgs/07067000/image?v=99'),
    { params: Promise.resolve({ provider: 'usgs', siteId: '07067000' }) },
  );
  assert.equal(response.status, 400);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(fetch.mock.callCount(), 0);
});

test('image query variants redirect to one cache key without fetching or rendering', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('Must not fetch');
  });
  const canonical = new URL(chartImagePath(fixtureState), 'https://eddy.guide');
  const reordered = new URL(canonical);
  reordered.search = new URLSearchParams([...canonical.searchParams].reverse()).toString();
  for (const url of [
    canonical.href + '&utm_source=slack',
    reordered.href,
    canonical.href.replace('%3A', '%3a'),
  ]) {
    const response = await imageRoute(new NextRequest(url), {
      params: Promise.resolve({ provider: 'usgs', siteId: fixtureState.siteId }),
    });
    assert.equal(response.status, 308);
    assert.equal(response.headers.get('location'), canonical.href);
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test('public detail and image quotas are separate, with no crawler bypass or cached limiter failure', async (t) => {
  const previous = {
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  };
  process.env.UPSTASH_REDIS_REST_URL = 'https://limiter.example';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test';
  const keys: string[] = [];
  let unavailable = false;
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    keys.push(JSON.parse(String(init?.body))[0][1]);
    return unavailable
      ? new Response('', { status: 503 })
      : Response.json([{ result: 61 }, { result: 1 }, { result: 60_000 }]);
  });
  try {
    const headers = { 'x-real-ip': '192.0.2.1', 'user-agent': 'Slackbot-LinkExpanding 1.0' };
    const request = new NextRequest('https://eddy.guide/api/gauges/empty', { headers });
    const context = { params: Promise.resolve({ siteId: '' }) };
    assert.equal((await detailRoute(request, context)).status, 429);
    assert.equal(
      (await gaugeDetailResponse(request, context)).status,
      400,
      'the internal handler must not spend the public quota',
    );
    const imageRequest = new NextRequest(
      new URL(chartImagePath(fixtureState), 'https://eddy.guide'),
      { headers },
    );
    const imageContext = {
      params: Promise.resolve({ provider: 'usgs', siteId: fixtureState.siteId }),
    };
    const limited = await imageRoute(imageRequest, imageContext);
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('cache-control'), 'no-store');
    assert.deepEqual(keys, ['rl:gauge-detail:192.0.2.1', 'rl:chart-image:192.0.2.1']);
    unavailable = true;
    const failure = await imageRoute(imageRequest, imageContext);
    assert.equal(failure.status, 503);
    assert.equal(failure.headers.get('cache-control'), 'no-store');
  } finally {
    if (previous.url === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = previous.url;
    if (previous.token === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = previous.token;
  }
});

test('the real Satori renderer produces a PNG from the shared chart geometry', async () => {
  const data = fixtureImageData();
  const image = new ImageResponse(createElement(ChartShareImage, { data }), {
    width: 1200,
    height: 630,
    fonts: loadOgFonts(),
  });
  const bytes = Buffer.from(await image.arrayBuffer());
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
  assert.ok(bytes.length > 10_000);
  assert.equal(bytes.readUInt32BE(16), 1200);
  assert.equal(bytes.readUInt32BE(20), 630);
});

test('alternate thresholds retain their units and absent ladders cannot be fabricated', () => {
  const primary = fixtureImageData().thresholds!;
  assert.equal(thresholdsForUnit(primary, 'ft'), null);
  const alternate = thresholdsForUnit({ ...primary, altLevelTooLow: 1, altLevelLow: 2 }, 'ft');
  assert.equal(alternate?.thresholdUnit, 'ft');
  assert.equal(alternate?.levelLow, 2);
  assert.equal(alternate?.levelDangerous, null);
  assert.equal(thresholdsForUnit(primary, 'cfs'), primary);
});

test('a shared chart renders safely before the responsive breakpoint is known', () => {
  const client = new QueryClient();
  const html = renderToString(
    createElement(
      QueryClientProvider,
      { client },
      createElement(GaugeHistoryChart, {
        initialShareState: fixtureState,
        siteId: fixtureState.siteId,
        siteName: 'Fixture station',
        displayUnit: 'cfs',
        showTypical: true,
        lastYearOn: true,
        onUnitChange: () => {},
        canToggleUnit: true,
        onLastYearChange: () => {},
        onRangeChange: () => {},
        onExpand: () => {},
        capabilities: { maxInstantDays: 90, supportsDaily: true, supportsCustomRange: true },
      }),
    ),
  );
  assert.match(html, /Shared view/);
  assert.doesNotMatch(html, /role="dialog"/);
  client.clear();
});

// Exercise the real handlers; only the public providers and database transport
// are replaced. No credentials or live readings are used by this suite.
function mockPublicSources(t: TestContext) {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://chart-fixture.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture';
  t.after(() => {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const controls = { missing: false, outage: false, linked: true };
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname !== 'chart-fixture.supabase.co')
      return Response.json({ value: { timeSeries: [] }, features: [] });
    if (controls.outage) return Response.json({ message: 'fixture outage' }, { status: 503 });
    const table = url.pathname.split('/').at(-1);
    if (table === 'search_gauges')
      return Response.json(
        controls.missing
          ? []
          : [
              {
                id: 'station-fixture',
                site_id: fixtureState.siteId,
                name: 'Fixture Station',
                provider: 'usgs',
                lat: 45,
                lng: -122.6,
                curated: true,
                reading_timestamp: new Date().toISOString(),
                gauge_height_ft: 2,
                discharge_cfs: 600,
              },
            ],
      );
    if (table === 'gauge_stations')
      return Response.json([
        {
          id: 'station-fixture',
          provider: 'usgs',
          nws_lid: null,
          usgs_site_id: fixtureState.siteId,
        },
      ]);
    if (table === 'usgs_daily_percentiles')
      return Response.json([{ day_of_year: 61, p25: 300, p50: 600, p75: 900, count_years: 35 }]);
    if (table === 'river_gauges')
      return Response.json(
        controls.linked
          ? [
              {
                is_primary: true,
                threshold_unit: 'cfs',
                level_low: 300,
                level_optimal_min: 450,
                level_optimal_max: 1000,
                rivers: {
                  id: '22222222-2222-2222-2222-222222222222',
                  name: 'Fixture River',
                  slug: 'fixture',
                  active: true,
                },
              },
            ]
          : [],
      );
    assert.ok(
      ['gauge_latest', 'gauge_readings', 'get_latest_curated_readings'].includes(table!),
      `Unexpected table: ${table}`,
    );
    return Response.json([]);
  });
  const provider = getFlowProvider('usgs')!;
  t.mock.method(provider, 'fetchDailyStatistics', async () => null);
  const history = t.mock.method(provider, 'fetchHistory', async () => ({
    siteId: fixtureState.siteId,
    siteName: 'Fixture Station',
    readings: fixtureHistory.readings,
    minDischarge: 300,
    maxDischarge: 12000,
    minHeight: 1,
    maxHeight: 3,
  }));
  return { controls, history };
}

test('ordinary daily dispatch stays auto; saved calendars preserve their dates after catalog changes', async (t) => {
  const { history } = mockPublicSources(t);
  const context = { params: Promise.resolve({ siteId: fixtureState.siteId }) };
  for (const age of [89, 90, 92, 365]) {
    const from = new Date(Date.now() - age * 86400000).toISOString();
    const params = new URLSearchParams({ from, to: new Date().toISOString(), resolution: 'auto' });
    assert.equal(
      (
        await gaugeHistoryResponse(
          new NextRequest(`https://eddy.guide/api/gauges/${fixtureState.siteId}/history?${params}`),
          context,
        )
      ).status,
      200,
    );
    assert.equal(
      history.mock.calls.at(-1)!.arguments[2]?.resolution,
      'auto',
      `ordinary ${age}-day request`,
    );
  }
  const params = new URLSearchParams({
    ...fixtureState.loaded,
    resolution: 'auto',
    calendar: 'station',
    tz: fixtureState.timeZone,
  });
  const response = await gaugeHistoryResponse(
    new NextRequest(`https://eddy.guide/api/gauges/${fixtureState.siteId}/history?${params}`),
    context,
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.timeZone, 'America/Chicago', 'catalog now says Los Angeles');
  assert.deepEqual(body.requestedWindow, fixtureState.loaded);
  const dispatched = history.mock.calls.at(-1)!.arguments[2]!;
  assert.equal(dispatched.resolution, 'daily');
  assert.equal(dispatched.from?.toISOString(), '2026-03-01T00:00:00.000Z');
  assert.equal(dispatched.to?.toISOString(), '2026-03-31T23:59:59.000Z');
});

test('invalid saved timezones are rejected before upstream reads', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('must not fetch');
  });
  for (const query of [
    'calendar=station&tz=Planet/Mars',
    'tz=America/Chicago',
    'calendar=station&tz=UTC&tz=UTC',
  ]) {
    const response = await gaugeHistoryResponse(
      new NextRequest(`https://eddy.guide/api/gauges/07067000/history?${query}`),
      { params: Promise.resolve({ siteId: fixtureState.siteId }) },
    );
    assert.equal(response.status, 400);
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test('image loading preserves a saved timezone and recovers a reseeded river through its slug', async (t) => {
  mockPublicSources(t);
  const state = { ...fixtureState, riverSlug: 'fixture', layers: [] };
  const data = await loadChartShareData(state, new Headers());
  assert.equal(data.gauge.timeZone, 'America/Los_Angeles');
  assert.equal(data.history.timeZone, 'America/Chicago');
  assert.equal(data.thresholds?.riverId, '22222222-2222-2222-2222-222222222222');
  assert.deepEqual(data.state.visible, fixtureState.visible);
});

test('missing context is a typed attachment error or neutral preview; outages stay retryable and uncached', async (t) => {
  const { controls } = mockPublicSources(t);
  const state = { ...fixtureState, layers: [] };
  const context = { params: Promise.resolve({ provider: 'usgs', siteId: state.siteId }) };
  const request = (preview = false) =>
    new NextRequest(new URL(chartImagePath(state, preview), 'https://eddy.guide'));
  const missingRiver = await imageRoute(request(), context);
  assert.equal(missingRiver.status, 422);
  assert.equal(missingRiver.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await missingRiver.json(), {
    error: 'This saved chart view is no longer available. Open the gauge for current conditions.',
    code: 'shared_view_unavailable',
    reason: 'river',
  });
  const preview = await imageRoute(request(true), context);
  assert.equal(preview.status, 200);
  assert.equal(preview.headers.get('cache-control'), 'no-store');
  assert.equal(preview.headers.get('x-eddy-chart-status'), 'unavailable');
  assert.equal(
    Buffer.from(await preview.arrayBuffer())
      .subarray(1, 4)
      .toString(),
    'PNG',
  );
  controls.missing = true;
  const missingStation = await imageRoute(request(), context);
  assert.equal((await missingStation.json()).reason, 'station');
  controls.outage = true;
  t.mock.method(console, 'error', () => {});
  const outage = await imageRoute(request(), context);
  assert.equal(outage.status, 503);
  assert.equal(outage.headers.get('cache-control'), 'no-store');
});
