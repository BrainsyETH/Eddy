import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test, { afterEach } from 'node:test';

import { fetchNwsForecastStages, forecastStages, upcomingPeak } from './forecast';

// A trimmed copy of what NWPS served for the Current at Van Buren (VNBM7) on
// 2026-11-11: a forecast issued the day before, so its first point is already
// in the past by the time anyone reads it.
const VAN_BUREN = {
  observed: { primaryUnits: 'ft', secondaryUnits: 'kcfs', data: [] },
  forecast: {
    issuedTime: '2026-11-10T13:47:00Z',
    primaryUnits: 'ft',
    secondaryUnits: 'kcfs',
    data: [
      { validTime: '2026-11-10T18:00:00Z', primary: 2.9, secondary: 0.95 },
      { validTime: '2026-11-11T18:00:00Z', primary: 2.6, secondary: 0.821 },
      { validTime: '2026-11-12T18:00:00Z', primary: 2.7, secondary: 0.86 },
      { validTime: '2026-11-15T12:00:00Z', primary: 3.4, secondary: 1.2 },
    ],
  },
};

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function serve(body: unknown, status = 200): string[] {
  const requested: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requested.push(String(input));
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  return requested;
}

test('a live NWPS forecast reaches the outlook as stages in feet', async () => {
  const requested = serve(VAN_BUREN);
  const stages = await fetchNwsForecastStages('VNBM7');

  assert.deepEqual(requested, ['https://api.water.noaa.gov/nwps/v1/gauges/VNBM7/stageflow']);
  assert.deepEqual(stages, [
    { dateTime: '2026-11-10T18:00:00Z', valueFt: 2.9 },
    { dateTime: '2026-11-11T18:00:00Z', valueFt: 2.6 },
    { dateTime: '2026-11-12T18:00:00Z', valueFt: 2.7 },
    { dateTime: '2026-11-15T12:00:00Z', valueFt: 3.4 },
  ]);
});

test('a gauge with no active forecast, or a failing upstream, is an empty list', async () => {
  // What NWPS sends for a forecast point that has nothing issued right now.
  serve({ forecast: { issuedTime: '0001-01-01T00:00:00Z', primaryUnits: '', secondaryUnits: '', data: [] } });
  assert.deepEqual(await fetchNwsForecastStages('SEEM7'), []);

  serve({ message: 'not found' }, 404);
  assert.deepEqual(await fetchNwsForecastStages('NOPE'), []);
});

test('points published as flow alone are not handed to a foot ladder', () => {
  assert.deepEqual(
    forecastStages([
      { timestamp: '2026-11-11T18:00:00Z', gaugeHeightFt: null, dischargeCfs: 821 },
      { timestamp: '2026-11-12T18:00:00Z', gaugeHeightFt: 2.7, dischargeCfs: 860 },
    ]),
    [{ dateTime: '2026-11-12T18:00:00Z', valueFt: 2.7 }],
  );
});

test('the 72-hour peak ignores points already past and points beyond the window', () => {
  const stages = forecastStages(
    VAN_BUREN.forecast.data.map((d) => ({ timestamp: d.validTime, gaugeHeightFt: d.primary, dischargeCfs: null })),
  );
  const now = Date.parse('2026-11-11T13:00:00Z');

  // 2.9 ft was yesterday and 3.4 ft is four days out; neither is "the next 72 hours".
  assert.deepEqual(upcomingPeak(stages, now), { peakFt: 2.7, peakAt: '2026-11-12T18:00:00Z' });
  assert.equal(upcomingPeak(stages, Date.parse('2026-11-16T00:00:00Z')), null);
  assert.equal(upcomingPeak([], now), null);
});

// ── The retired AHPS host may not be named under src/ ────────────────
//
// The AHPS hydrograph XML host went away in 2024. The module that read it
// swallowed the connection failure and returned [], so the river outlook and
// the statewide forecast endpoint reported "no official forecast" for every
// river for as long as nobody compared them with the gauge chart. A fetch that
// fails silently cannot be caught by its own output; the host name can.
test('nothing under src/ reads the retired AHPS host', () => {
  const RETIRED_HOST = ['water', 'weather', 'gov'].join('.');
  const offenders: string[] = [];
  let scanned = 0;
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      const full = path.join(directory, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry)) {
        scanned++;
        if (readFileSync(full, 'utf8').includes(RETIRED_HOST)) offenders.push(path.relative(process.cwd(), full));
      }
    }
  };
  walk(path.resolve(process.cwd(), 'src'));

  assert.ok(scanned > 100, `scanned only ${scanned} files; run from missouri-float-planner/`);
  assert.deepEqual(offenders, [], 'use src/lib/nws/forecast.ts (NWPS) instead of the retired AHPS host');
});
