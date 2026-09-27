/* eslint-disable @typescript-eslint/no-explicit-any -- Offline PostgREST query fixture and heterogeneous tool payloads. */
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createAgentExecutor } from './executor';
import { createAgentServer } from './mcp-server';
import { AGENT_TOOLS } from './catalog';
import { AGENT_VERSION, freshness, tripDate } from './contracts';
import {
  readMcpBody,
  MAX_BODY_BYTES,
  expensiveTool,
  validOrigin,
} from './http';
import { memoizeReads } from './read-cache';
import type { Db } from './data';
import type { SourceProviders } from './sources';

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
// Keep estimator Date.now() and injected source clock in the same hour.
const NOW = Date.now();
const savedWeatherKey = process.env.OPENWEATHER_API_KEY;
process.env.OPENWEATHER_API_KEY = 'offline-fixture';
after(() => {
  if (savedWeatherKey === undefined) delete process.env.OPENWEATHER_API_KEY;
  else process.env.OPENWEATHER_API_KEY = savedWeatherKey;
});
const observed = new Date(NOW - 60_000).toISOString();
const date = (offset: number) =>
  new Date(NOW + offset * 86400000).toLocaleDateString('en-CA', {
    timeZone: 'America/Chicago',
  });
const trip = {
  river: 'current',
  putIn: 'launch-0',
  takeOut: 'launch-2',
  vesselType: 'canoe',
};

function fixture(
  options: {
    fail?: string;
    stale?: boolean;
    downstream?: number;
    spanTime?: string;
    spanSuspect?: boolean;
    forecast?: 'none' | 'stale';
    alertFail?: boolean;
    closure?: boolean;
    cfs?: boolean;
    noStageThresholds?: boolean;
    tailwater?: boolean;
    points?: number;
    snapshots?: boolean;
    searchBudgetMs?: number;
    stallAfter?: number;
  } = {},
) {
  const calls: string[] = [];
  const river = {
    id: uuid(1),
    active: true,
    region: 'Ozarks',
    name: 'Current River',
    slug: 'current',
    state: 'MO',
    river_type: options.tailwater ? 'dam_tailwater' : 'spring_fed_float',
    timezone: 'America/Chicago',
    park_code: 'ozar',
    alert_search_terms: ['Current River'],
    weather_lat: 37,
    weather_lon: -91,
  };
  const points = Array.from({ length: options.points ?? 3 }, (_, i) => ({
    id: uuid(i + 10),
    name: `Launch ${i}`,
    slug: `launch-${i}`,
    river_id: river.id,
    river_mile_downstream: i * 4,
    approved: true,
    is_float_endpoint: true,
    is_public: true,
    type: 'access',
    types: ['access'],
    amenities: ['parking'],
    location_orig: { type: 'Point', coordinates: [-91, 37] },
  }));
  const station = (n: number) => ({
    id: uuid(n),
    name: n === 100 ? 'Anchor' : 'Downstream',
    usgs_site_id: `07000${n}`,
    nws_lid: n === 100 ? 'AAAAA' : 'BBBBB',
    curated: true,
    active: true,
    provider: 'usgs',
  });
  const thresholds = {
    threshold_unit: options.cfs ? 'cfs' : 'ft',
    level_too_low: 1,
    level_low: 2,
    level_optimal_min: 3,
    level_optimal_max: 4,
    level_high: 5,
    level_dangerous: 7,
    flood_stage_ft: 9,
  };
  const link = (n: number) => ({
    river_id: river.id,
    gauge_station_id: uuid(n),
    is_primary: n === 100,
    river_mile: n === 100 ? 0 : 6,
    ...thresholds,
    ...(options.cfs && !options.noStageThresholds
      ? {
          alt_level_too_low: 1,
          alt_level_low: 2,
          alt_level_optimal_min: 3,
          alt_level_optimal_max: 4,
          alt_level_high: 5,
          alt_level_dangerous: 7,
        }
      : {}),
    gauge_stations: station(n),
  });
  const reading = (n: number) => ({
    gauge_station_id: uuid(n),
    gauge_height_ft: n === 100 ? 3.5 : options.downstream,
    discharge_cfs: 400,
    reading_timestamp:
      n === 101 && options.spanTime
        ? options.spanTime
        : options.stale
          ? new Date(NOW - 7 * 3600000).toISOString()
          : observed,
    qualifiers: n === 101 && options.spanSuspect ? ['Ice'] : [],
  });
  const gauges = [100, ...(options.downstream == null ? [] : [101])];
  const tables: Record<string, any[]> = {
    rivers: [river],
    access_points: points,
    river_gauges: gauges.map(link),
    gauge_stations: gauges.map(station),
    gauge_readings: gauges.map(reading),
    gauge_latest: gauges.map(reading),
    vessel_types: ['canoe', 'kayak', 'raft', 'tube'].map((slug, i) => ({
      id: uuid(200 + i),
      name: slug,
      slug,
      speed_low_water: 2,
      speed_normal: slug === 'tube' ? 1 : 2.5,
      speed_high_water: 3.5,
    })),
    river_characteristics: [],
    river_sections: [],
    usgs_daily_percentiles: [],
    river_hazards: [],
    service_rivers: [],
  };
  function query(name: string, initial: any[]) {
    let rows = initial,
      single = false;
    let signal: AbortSignal | undefined;
    const q: any = {
      select: () => q,
      abortSignal: (value: AbortSignal) => {
        signal = value;
        return q;
      },
      eq: (column: string, value: unknown) => {
        rows = rows.filter((r) => r[column] === value);
        return q;
      },
      ilike: (column: string, value: string) => {
        rows = rows.filter(
          (r) => String(r[column]).toLowerCase() === value.toLowerCase(),
        );
        return q;
      },
      in: (column: string, values: unknown[]) => {
        rows = rows.filter((r) => values.includes(r[column]));
        return q;
      },
      not: (column: string, _op: string, value: unknown) => {
        rows = rows.filter((r) => r[column] !== value);
        return q;
      },
      order: () => q,
      limit: (n: number) => {
        rows = rows.slice(0, n);
        return q;
      },
      single: () => {
        single = true;
        return q;
      },
      maybeSingle: () => {
        single = true;
        return q;
      },
      then: (
        resolve: (v: unknown) => unknown,
        reject: (e: unknown) => unknown,
      ) => {
        calls.push(name);
        if (
          name === 'get_float_segment' &&
          options.stallAfter !== undefined &&
          calls.filter((c) => c === name).length > options.stallAfter
        ) {
          return new Promise((_resolve, rejectWork) => {
            const cancel = () => {
              calls.push('cancelled');
              rejectWork(signal?.reason);
            };
            signal?.addEventListener('abort', cancel, { once: true });
            if (signal?.aborted) cancel();
          }).then(resolve, reject);
        }
        return Promise.resolve({
          data:
            options.fail === name ? null : single ? (rows[0] ?? null) : rows,
          error:
            options.fail === name
              ? { message: 'private backend failure' }
              : null,
        }).then(resolve, reject);
      },
    };
    return q;
  }
  const db = {
    from: (name: string) => {
      assert.ok(name in tables, name);
      return query(name, tables[name]);
    },
    rpc(name: string, args: any) {
      let rows: any[];
      if (name === 'get_float_segment') {
        const a = points.find((p) => p.id === args.p_start_access_id)!,
          b = points.find((p) => p.id === args.p_end_access_id)!;
        rows = [
          {
            distance_miles: String(
              b.river_mile_downstream - a.river_mile_downstream,
            ),
            start_river_mile: String(a.river_mile_downstream),
            end_river_mile: String(b.river_mile_downstream),
          },
        ];
      } else if (name === 'get_river_condition_segment')
        rows = [
          {
            condition_code: 'good',
            condition_label: 'Optimal',
            gauge_height_ft: 3.5,
            discharge_cfs: 400,
            gauge_name: 'Anchor',
            gauge_usgs_id: station(100).usgs_site_id,
            reading_timestamp: reading(100).reading_timestamp,
          },
        ];
      else if (name === 'get_segment_float_time') rows = [];
      else if (name === 'get_latest_curated_readings')
        rows = gauges
          .filter((n) => args.p_station_ids.includes(uuid(n)))
          .map(reading);
      else throw new Error(`Unexpected RPC ${name}`);
      return query(name, rows);
    },
  } as unknown as Db;
  const sources: SourceProviders = {
    fetchNWSAlerts: async () => {
      calls.push('nws-alerts');
      if (options.alertFail) throw new Error('offline');
      return [];
    },
    fetchNPSAlerts: async () => {
      calls.push('nps-alerts');
      return options.closure
        ? [
            {
              id: 'closure',
              parkCode: 'ozar',
              title: 'The entire park is closed',
              description: 'Current closure',
              category: 'Park Closure',
              url: 'https://www.nps.gov/ozar/',
            },
          ]
        : [];
    },
    fetchNwsForecast: async () => {
      calls.push('forecast');
      return options.forecast === 'none'
        ? { issuedAt: null, points: [] }
        : {
            issuedAt:
              options.forecast === 'stale'
                ? new Date(NOW - 25 * 3600000).toISOString()
                : observed,
            points: [0, 1, 2].map((n) => ({
              timestamp: `${date(n)}T18:00:00Z`,
              gaugeHeightFt: 3.5,
              dischargeCfs: null,
            })),
          };
    },
    fetchWeather: async () => ({
      temp: 75,
      condition: 'Clear',
      conditionIcon: '01d',
      windSpeed: 4,
      windDirection: 0,
      humidity: 40,
      city: 'Fixture',
      rain1hInches: 0,
      rain3hInches: 0,
    }),
    fetchForecast: async () => ({ city: 'Fixture', days: [] }),
  };
  return {
    db,
    calls,
    tables,
    execute: createAgentExecutor(db, {
      now: NOW,
      searchBudgetMs: options.searchBudgetMs,
      sources,
      routeProviders: options.snapshots
        ? undefined
        : {
            fetchDailyStatistics: async () => null,
            fetchGaugeReadings: async () => {
              throw new Error('Unexpected network fallback');
            },
          },
    }),
  };
}

async function sdk(
  f: ReturnType<typeof fixture>,
  fn: (client: Client, tracked: string[]) => Promise<void>,
) {
  const tracked: string[] = [];
  const server = createAgentServer(f.execute, {
    track: async (name, run) => {
      tracked.push(name);
      return run();
    },
  });
  const client = new Client({ name: 'eddy-tests', version: '1.0.0' });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    await fn(client, tracked);
  } finally {
    await client.close();
    await server.close();
  }
}

test('SDK negotiates all tools, schemas, read-only annotations, instructions and version', async () => {
  await sdk(fixture(), async (client, tracked) => {
    assert.equal(client.getServerVersion()?.version, AGENT_VERSION);
    assert.match(client.getInstructions()!, /MCP access is free/);
    const { tools } = await client.listTools();
    assert.equal(tools.length, 13);
    for (const t of tools) {
      assert.equal(t.annotations?.readOnlyHint, true);
      assert.equal(t.annotations?.destructiveHint, false);
      assert.ok(t.outputSchema?.properties?.status);
    }
    const result = await client.callTool({
      name: 'list_rivers',
      arguments: {},
    });
    assert.equal(result.isError, false);
    assert.equal(
      (result.structuredContent as any).data.rivers[0].slug,
      'current',
    );
    assert.deepEqual(
      JSON.parse((result.content as any)[0].text),
      result.structuredContent,
    );
    assert.deepEqual(tracked, ['list_rivers']);
    const invalid = await client.callTool({
      name: 'plan_float',
      arguments: { ...trip, takeOut: 'missing' },
    });
    assert.equal(invalid.isError, true);
    assert.equal((invalid.structuredContent as any).status, 'invalid_request');
  });
});

test('plans resolve slugs, preserve anchor attribution and retain vessel deep links', async () => {
  const f = fixture();
  const plan = (
    await f.execute('plan_float', {
      ...trip,
      vesselType: 'tube',
      date: date(1),
    })
  ).data as any;
  assert.equal(plan.vesselType, 'tube');
  assert.equal(plan.anchorGauge.name, 'Anchor');
  assert.equal(plan.anchorGauge.stale, false);
  assert.equal(plan.routeAssessment.conditionCode, 'good');
  assert.equal(plan.estimateBasis, 'current_conditions');
  assert.equal(plan.outlooks[0].days[0].date, date(1));
  assert.ok(plan.estimatedFloatTime.timeRange.min > 200);
  assert.equal(new URL(plan.url).searchParams.get('putIn'), uuid(10));
  assert.equal(new URL(plan.url).searchParams.get('vessel'), uuid(203));
});

test('upstream, non-launch and conflicting endpoint requests fail with actionable reasons', async () => {
  const f = fixture();
  const upstream = await f.execute('plan_float', {
    ...trip,
    putIn: 'launch-2',
    takeOut: 'launch-0',
  });
  assert.equal(upstream.status, 'invalid_request');
  assert.match(String(upstream.data.message), /downstream/);
  assert.equal(
    (await f.execute('plan_float', { ...trip, riverId: uuid(99) })).status,
    'invalid_request',
  );
  f.tables.access_points[0].is_float_endpoint = false;
  assert.match(
    String((await f.execute('plan_float', trip)).data.message),
    /not a launch/,
  );
  assert.equal(f.calls.filter((c) => c === 'get_float_segment').length, 0);
});

test('estimator errors are recoverable tool errors rather than opaque protocol failures', async () => {
  const out = await fixture({ fail: 'get_float_segment' }).execute(
    'plan_float',
    trip,
  );
  assert.equal(out.status, 'lookup_failed');
  assert.match(String(out.data.message), /retry/i);
  assert.doesNotMatch(JSON.stringify(out), /private backend/);
});

test('downstream danger is separately attributed and withholds duration', async () => {
  const plan = (await fixture({ downstream: 8 }).execute('plan_float', trip))
    .data as any;
  assert.equal(plan.anchorGauge.conditionCode, 'good');
  assert.equal(plan.anchorGauge.gaugeHeightFt, 3.5);
  assert.equal(plan.routeAssessment.conditionCode, 'dangerous');
  assert.equal(plan.routeAssessment.contributingGauges[0].name, 'Downstream');
  assert.equal(plan.routeAssessment.contributingGauges[0].gaugeHeightFt, 8);
  assert.equal(plan.estimatedFloatTime, null);
  assert.equal(plan.routeAssessment.recommendationStatus, 'not_recommended');
});

test('stale, invalid or suspect span readings cannot support a recommendation', async () => {
  for (const options of [
    { stale: true },
    { downstream: 3.5, spanTime: 'invalid' },
    { downstream: 3.5, spanSuspect: true },
  ]) {
    const plan = (await fixture(options).execute('plan_float', trip))
      .data as any;
    assert.equal(
      plan.routeAssessment.conditionCode,
      'unknown',
      JSON.stringify(options),
    );
    assert.equal(plan.estimatedFloatTime, null);
    assert.equal(plan.routeAssessment.recommendationStatus, 'not_recommended');
  }
});

test('missing future forecasts stay conditional; feet are never graded as discharge', async () => {
  const unknown = (
    await fixture({ forecast: 'none' }).execute('plan_float', {
      ...trip,
      date: date(1),
    })
  ).data as any;
  assert.equal(unknown.routeAssessment.recommendationStatus, 'conditional');
  assert.equal(unknown.outlooks[0].status, 'unavailable');
  for (const options of [
    { cfs: true, noStageThresholds: true },
    { forecast: 'stale' as const },
  ]) {
    const out = await fixture(options).execute('get_outlook', {
      slug: 'current',
      date: date(1),
    });
    assert.equal(out.status, 'unavailable');
    assert.equal((out.data.days as any)[0].conditionCode, null);
  }
  const rated = await fixture({ cfs: true }).execute('get_outlook', {
    slug: 'current',
    date: date(1),
  });
  assert.equal(rated.status, 'ok');
  assert.equal((rated.data.days as any)[0].conditionCode, 'flowing');
  assert.equal(
    (await fixture().execute('get_outlook', { slug: 'current', date: date(4) }))
      .status,
    'unavailable',
  );
});

test('failed alerts remain visible and make ranked options conditional', async () => {
  const f = fixture({ alertFail: true });
  const alerts = await f.execute('get_river_alerts', { slug: 'current' });
  assert.equal(alerts.status, 'lookup_failed');
  assert.equal(alerts.data.checkedAllApplicable, false);
  const floats = await f.execute('find_floats', { river: 'current' });
  assert.equal(floats.status, 'partial');
  assert.ok((floats.data.recommendations as any[]).length > 0);
  for (const plan of floats.data.recommendations as any[]) {
    assert.equal(plan.data.routeAssessment.recommendationStatus, 'conditional');
    assert.match(
      plan.data.routeAssessment.cautionReasons
        .map((r: any) => r.message)
        .join(' '),
      /NWS/,
    );
    assert.doesNotMatch(
      plan.data.routeAssessment.cautionReasons
        .map((r: any) => r.message)
        .join(' '),
      /future river rating/,
    );
  }
});

test('closed parks, low in-span water and regulated-time withholding prevent ranked recommendations', async () => {
  for (const opts of [
    { closure: true },
    { downstream: 0.5 },
    { tailwater: true },
  ]) {
    const out = await fixture(opts).execute('find_floats', {
      river: 'current',
      targetHours: 3,
      limit: 1,
    });
    // The low-water fixture can still produce the short reach above that gauge.
    if ('downstream' in opts) {
      const plan = (await fixture(opts).execute('plan_float', trip))
        .data as any;
      assert.equal(
        plan.routeAssessment.recommendationStatus,
        'not_recommended',
      );
    } else {
      assert.deepEqual(out.data.recommendations, [], JSON.stringify(opts));
    }
  }
});

test('search bounds route calculations, returned options and repeated source reads', async () => {
  const f = fixture({ points: 16 });
  const out = await f.execute('find_floats', {
    river: 'current',
    targetHours: 3,
  });
  assert.equal(out.data.evaluated, 6);
  assert.equal((out.data.recommendations as any[]).length, 3);
  assert.equal(f.calls.filter((c) => c === 'get_float_segment').length, 6);
  assert.equal(f.calls.filter((c) => c === 'nws-alerts').length, 1);
  assert.equal(f.calls.filter((c) => c === 'forecast').length, 1);
  assert.equal(f.calls.filter((c) => c === 'river_hazards').length, 1);
});

test('database failures do not masquerade as absent access, hazards or gauge readings', async () => {
  for (const [fail, name] of [
    ['access_points', 'get_access_points'],
    ['river_hazards', 'get_hazards'],
    ['gauge_latest', 'get_gauges'],
  ]) {
    const out = await fixture({ fail }).execute(name, { slug: 'current' });
    assert.equal(out.status, 'lookup_failed', name);
  }
  const f = fixture({ downstream: 3.5 });
  const out = await f.execute('get_gauges', { slug: 'current' });
  assert.equal((out.data.gauges as any[]).length, 2);
  assert.equal(
    f.calls.filter((c) => c === 'get_latest_curated_readings').length,
    1,
  );
  assert.equal(f.calls.filter((c) => c === 'gauge_readings').length, 0);
});

test('every tool is callable and tracked through the real SDK', async () => {
  await sdk(fixture(), async (client, tracked) => {
    for (const t of AGENT_TOOLS) {
      const args =
        t.name === 'list_rivers'
          ? {}
          : t.name === 'find_floats'
            ? { river: 'current' }
            : ['plan_float', 'get_drive_estimate'].includes(t.name)
              ? trip
              : { slug: 'current' };
      const out = await client.callTool({ name: t.name, arguments: args });
      assert.ok(out.structuredContent, t.name);
      assert.equal(out.isError, false, `${t.name}: ${JSON.stringify(out)}`);
    }
    assert.deepEqual(
      tracked,
      AGENT_TOOLS.map((t) => t.name),
    );
  });
});

test('read cache coalesces identical queries and refuses mutations', async () => {
  const f = fixture(),
    db = memoizeReads(f.db);
  await Promise.all([
    db.from('rivers').select('*').eq('id', uuid(1)),
    db.from('rivers').select('*').eq('id', uuid(1)),
  ]);
  assert.equal(f.calls.length, 1);
  assert.throws(() => db.from('rivers').delete(), /reads only/);
});

test('request parser bounds streamed bytes, forbids batches and classifies heavy tools', async () => {
  const request = (body: string) =>
    new Request('https://eddy.guide/api/mcp', { method: 'POST', body });
  await assert.rejects(readMcpBody(request('[]')), /invalid_request/);
  await assert.rejects(
    readMcpBody(request('x'.repeat(MAX_BODY_BYTES + 1))),
    /too_large/,
  );
  assert.deepEqual(
    await readMcpBody(
      request('{"jsonrpc":"2.0","method":"tools/list","id":1}'),
    ),
    {
      jsonrpc: '2.0',
      method: 'tools/list',
      id: 1,
    },
  );
  for (const name of ['plan_float', 'find_floats', 'get_drive_estimate'])
    assert.equal(
      expensiveTool({ method: 'tools/call', params: { name } }),
      name,
    );
  assert.equal(
    expensiveTool({ method: 'tools/call', params: { name: 'get_river' } }),
    null,
  );
  assert.equal(
    validOrigin(
      new Request('https://eddy.guide/api/mcp', {
        headers: { origin: 'https://malicious.example' },
      }),
    ),
    false,
  );
  assert.equal(validOrigin(request('{}')), true);
});

test('dates and freshness reject malformed dates and undated/future readings', () => {
  assert.throws(
    () => tripDate('2027-02-30', 'America/Chicago', NOW),
    /valid local/,
  );
  assert.throws(
    () => tripDate('2020-01-01', 'America/Chicago', NOW),
    /Past trips/,
  );
  assert.equal(freshness(undefined, NOW).stale, null);
  assert.equal(
    freshness(new Date(NOW + 3600000).toISOString(), NOW).observedAt,
    null,
  );
  assert.equal(
    freshness(new Date(NOW - 7 * 3600000).toISOString(), NOW).stale,
    true,
  );
});

test('chat uses the shared tools while remaining disabled', () => {
  assert.match(readFileSync('src/lib/chat/tools.ts', 'utf8'), /AGENT_TOOLS/);
  assert.match(
    readFileSync('src/lib/chat/tool-handlers.ts', 'utf8'),
    /createAgentExecutor/,
  );
  assert.match(readFileSync('src/app/api/chat/route.ts', 'utf8'), /503/);
});

test('regulated withholding remains distinct from dangerous water in agent results', async () => {
  const out = await fixture({ tailwater: true }).execute('plan_float', trip);
  assert.equal(out.data.floatTimeWithheldReason, 'regulated');
  assert.match(out.warnings.join(' '), /dam-controlled river/);
  assert.doesNotMatch(out.warnings.join(' '), /Dangerous water/);
});

test('camping includes NPS records linked to approved access points and propagates failures', async () => {
  const f = fixture();
  f.tables.access_points[0].nps_campground_id = uuid(500);
  f.tables.nps_campgrounds = [
    {
      id: uuid(500),
      name: 'River campground',
      nps_url: 'https://www.nps.gov/ozar/',
      latitude: 37,
      longitude: -91,
    },
  ];
  const out = await f.execute('get_services', {
    slug: 'current',
    category: 'camping',
    near: 'launch-0',
  });
  assert.equal(out.status, 'ok');
  assert.equal((out.data.items as any[])[0].distanceMiles, 0);
  assert.equal((out.data.items as any[])[0].type, 'campground');
});

test('weather reports the put-in location and current/forecast components', async () => {
  const out = await fixture().execute('get_weather', {
    slug: 'current',
    putIn: 'launch-0',
  });
  assert.equal(out.status, 'ok');
  assert.equal((out.data.location as any).basis, 'put_in');
  assert.equal((out.data.current as any).temp, 75);
  assert.ok(Array.isArray(out.data.days));
  assert.equal(out.data.observedAt, undefined);
});

test('non-USGS stations link to their actual provider', async () => {
  const f = fixture();
  const gauge = f.tables.river_gauges[0].gauge_stations;
  gauge.provider = 'nws';
  gauge.usgs_site_id = 'ROZM7';
  const out = await f.execute('get_gauges', { slug: 'current' });
  const reading = (out.data.gauges as any[])[0];
  assert.equal(reading.provider, 'nws');
  assert.equal(reading.source, 'https://water.noaa.gov/gauges/ROZM7');
});

test('missing alert configuration yields explicit conditional candidates outside Missouri', async () => {
  const f = fixture();
  Object.assign(f.tables.rivers[0], {
    state: 'AR',
    name: 'Buffalo River',
    slug: 'buffalo',
    alert_search_terms: [],
    park_code: null,
  });
  const out = await f.execute('find_floats', { river: 'buffalo' });
  assert.ok((out.data.recommendations as any[]).length > 0);
  assert.equal(out.status, 'partial');
  const plan = (out.data.recommendations as any[])[0];
  assert.equal(plan.data.routeAssessment.recommendationStatus, 'conditional');
  assert.match(
    plan.data.routeAssessment.cautionReasons
      .map((r: any) => r.message)
      .join(' '),
    /matching is not configured/,
  );
  assert.doesNotMatch(
    plan.data.routeAssessment.cautionReasons
      .map((r: any) => r.message)
      .join(' '),
    /NPS/,
  );
  assert.equal(f.calls.filter((c) => c === 'nws-alerts').length, 0);
});

test('empty searches explain exclusions and expose source checks', async () => {
  const out = await fixture({ closure: true }).execute('find_floats', {
    river: 'current',
  });
  assert.deepEqual(out.data.recommendations, []);
  assert.ok(Number(out.data.excludedCandidates) > 0);
  assert.ok(
    (out.data.exclusionReasons as any[]).some(
      (r) => r.code === 'official_closure',
    ),
  );
  assert.equal((out.data.alertChecks as any).checkedAllApplicable, true);
});

const clearThresholds = (row: Record<string, unknown>) => {
  for (const name of [
    'level_too_low',
    'level_low',
    'level_optimal_min',
    'level_optimal_max',
    'level_high',
    'level_dangerous',
  ])
    row[name] = null;
};

test('uncalibrated gauges report unknown instead of false too-low, including the anchor', async () => {
  const f = fixture();
  clearThresholds(f.tables.river_gauges[0]);
  const gauges = await f.execute('get_gauges', { slug: 'current' });
  assert.equal((gauges.data.gauges as any[])[0].conditionCode, 'unknown');
  assert.match(
    (gauges.data.gauges as any[])[0].accuracyWarningReason,
    /calibrated/,
  );
  const plan = await f.execute('plan_float', trip);
  assert.equal((plan.data.anchorGauge as any).conditionCode, 'unknown');
  assert.equal(
    (plan.data.routeAssessment as any).recommendationStatus,
    'not_recommended',
  );
  assert.equal(plan.data.estimatedFloatTime, null);
});

test('an unrated in-route gauge makes coverage incomplete, while flood stage still blocks', async () => {
  for (const level of [3.5, 10]) {
    const f = fixture({ downstream: level });
    clearThresholds(f.tables.river_gauges[1]);
    const plan = await f.execute('plan_float', trip);
    const route = plan.data.routeAssessment as any;
    assert.equal(route.conditionCode, level === 10 ? 'dangerous' : 'unknown');
    assert.equal(route.recommendationStatus, 'not_recommended');
    assert.equal(plan.data.estimatedFloatTime, null);
    assert.equal(route.spanCheckComplete, level === 10);
  }
});

test('production danger severity excludes intersecting routes without requiring a portage flag', async () => {
  const f = fixture();
  f.tables.river_hazards.push({
    id: uuid(900),
    name: 'Recorded danger',
    active: true,
    river_id: uuid(1),
    river_mile_downstream: 3,
    severity: 'danger',
    portage_required: false,
  });
  const out = await f.execute('plan_float', trip);
  assert.equal(
    (out.data.routeAssessment as any).recommendationStatus,
    'not_recommended',
  );
  assert.equal(
    (out.data.routeAssessment as any).blockingReasons[0].code,
    'danger_on_route',
  );
});

test('MCP searches reuse public historical snapshots without live statistics requests', async () => {
  const f = fixture({ snapshots: true, points: 16 });
  const out = await f.execute('find_floats', { river: 'current' });
  assert.equal((out.data.recommendations as any[]).length, 3);
  assert.equal(f.calls.filter((c) => c === 'usgs_daily_percentiles').length, 1);
  const plan = (out.data.recommendations as any[])[0].data;
  assert.equal(plan.estimateBasis, 'current_conditions');
  assert.ok(plan.estimatedFloatTime.minutes > 0);
});

test(
  'search deadline preserves completed options and cancels outstanding route reads',
  { timeout: 2000 },
  async () => {
    const f = fixture({ points: 16, searchBudgetMs: 100, stallAfter: 1 });
    const out = await f.execute('find_floats', { river: 'current' });
    assert.equal(out.status, 'partial');
    assert.equal(out.data.deadlineReached, true);
    assert.equal(out.data.evaluated, 1);
    assert.equal((out.data.recommendations as any[]).length, 1);
    assert.ok(Number(out.data.timedOutCandidates) > 0);
    assert.ok(Number(out.data.notEvaluatedCandidates) > 0);
    assert.ok(f.calls.includes('cancelled'));
    assert.equal(
      f.calls.filter((c) => c === 'get_float_segment').length,
      out.data.attempted,
    );
  },
);

test('search summaries have a measured size budget and omit plan-only enrichment', async () => {
  const f = fixture({ points: 16 });
  const out = await f.execute('find_floats', {
    river: 'current',
    date: date(1),
  });
  assert.ok(
    Buffer.byteLength(JSON.stringify(out)) < 12_000,
    String(Buffer.byteLength(JSON.stringify(out))),
  );
  assert.equal(f.calls.includes('service_rivers'), false);
  for (const pick of out.data.recommendations as any[]) {
    assert.equal(pick.data.weather, undefined);
    assert.equal(pick.data.alerts, undefined);
    assert.ok(pick.data.anchorGauge.observedAt);
    assert.equal(pick.data.estimateBasis, 'current_conditions');
    assert.ok(pick.data.outlooks.length);
  }
});

test('portage plans are conditional and long instructions explicitly require full details', async () => {
  const f = fixture();
  f.tables.river_hazards.push({
    id: 'portage',
    river_id: uuid(1),
    active: true,
    name: 'Obstruction',
    severity: 'caution',
    portage_required: true,
    portage_side: 'left',
    river_mile_downstream: 2,
    description: 'Carry along the left bank. '.repeat(100),
  });
  const plan = await f.execute('plan_float', trip);
  assert.equal(
    (plan.data.routeAssessment as any).recommendationStatus,
    'conditional',
  );
  assert.match(
    (plan.data.routeAssessment as any).cautionReasons[0].message,
    /left/,
  );
  const search = await f.execute('find_floats', { river: 'current' });
  const crossing = (search.data.recommendations as any[]).find(
    (p) => p.data.putIn.riverMile < 2,
  );
  assert.ok(crossing);
  assert.equal(crossing.data.detailRequired, true);
  assert.equal(
    crossing.data.routeAssessment.cautionReasons[0].code,
    'portage_required',
  );
});
