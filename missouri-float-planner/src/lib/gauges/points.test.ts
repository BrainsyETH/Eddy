import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { decodeGaugePoints, GAUGE_POINTS_VERSION as PHONE_VERSION } from '@eddy/types';
import {
  buildGaugePoints,
  collectKeyset,
  collectRanges,
  GAUGE_POINTS_VERSION,
  type LatestPointRow,
  type StationPointRow,
} from './points';

const NOW = Date.parse('2026-09-24T12:00:00Z');

function station(overrides: Partial<StationPointRow> = {}): StationPointRow {
  return { id: 's1', site_id: '07019000', curated: false, lng: -90.123456, lat: 38.654321, ...overrides };
}

function latest(overrides: Partial<LatestPointRow> = {}): LatestPointRow {
  return {
    gauge_station_id: 's1',
    discharge_cfs: '1234.56',
    gauge_height_ft: '5.123',
    reading_timestamp: '2026-09-24T11:00:00Z',
    qualifiers: null,
    flow_percentile: 62,
    ...overrides,
  };
}

test('the server and the phone agree on the format version', () => {
  assert.equal(GAUGE_POINTS_VERSION, PHONE_VERSION);
});

test('a station round-trips into the MapGaugeLite the layer already draws', () => {
  const body = JSON.parse(JSON.stringify(buildGaugePoints([station()], [latest()], NOW)));
  const [g] = decodeGaugePoints(body, NOW);
  assert.equal(g.siteId, '07019000');
  assert.equal(g.id, 'idx:07019000');
  assert.deepEqual(g.coordinates, { lng: -90.1235, lat: 38.6543 });
  assert.equal(g.dischargeCfs, 1234.6);
  assert.equal(g.gaugeHeightFt, 5.12);
  assert.equal(g.readingTimestamp, '2026-09-24T11:00:00.000Z');
  assert.equal(g.readingAgeHours, 1);
  assert.equal(g.readingSuspect, false);
  assert.equal(g.curated, false);
  assert.equal(g.flowPercentile, 62);
});

test('curated, unlocated and unread stations are left out', () => {
  const stations = [
    station({ id: 'curated', curated: true }),
    station({ id: 'nowhere', lng: null }),
    station({ id: 'unread' }),
    station({ id: 'nosite', site_id: null }),
    station(),
  ];
  const body = buildGaugePoints(stations, [latest(), latest({ gauge_station_id: 'curated' }), latest({ gauge_station_id: 'nowhere' }), latest({ gauge_station_id: 'nosite' })], NOW);
  assert.equal(body.rows.length, 1);
});

test('a stale or suspect reading carries no percentile, as on /api/gauges/map', () => {
  const stale = buildGaugePoints([station()], [latest({ reading_timestamp: '2026-09-20T00:00:00Z' })], NOW);
  assert.equal(stale.rows[0][7], null);
  const suspect = buildGaugePoints([station()], [latest({ qualifiers: ['Ice'] })], NOW);
  assert.equal(suspect.rows[0][6], 1);
  assert.equal(suspect.rows[0][7], null);
});

test('the phone decodes an unknown version, or garbage, to nothing', () => {
  assert.deepEqual(decodeGaugePoints({ v: 99, rows: [['1', 0, 0, null, null, null, 0, null]] }), []);
  assert.deepEqual(decodeGaugePoints(null), []);
  assert.deepEqual(decodeGaugePoints({ v: 1, rows: [['', 1, 2], ['x', 'a', 2], 'nope'] }), []);
});

test('the route is priced and uses the shared CDN helper', () => {
  const src = fs.readFileSync(path.join(process.cwd(), 'src/app/api/gauges/points/route.ts'), 'utf8');
  assert.match(src, /withX402Route\(_GET, '\/api\/gauges\/points'\)/);
  assert.match(src, /cdnCacheHeaders\(/);
});

// ── Paging under PostgREST's silent cap ─────────────────────────────────────

const CAP = 1000;
const ids = Array.from({ length: 14_000 }, (_, i) => `s${String(i).padStart(5, '0')}`);

/** A keyset RPC behind a 1,000-row cap, however many rows were asked for. */
function cappedKeyset(requested: number) {
  return async (after: string | null) => {
    const start = after === null ? 0 : ids.indexOf(after) + 1;
    return ids.slice(start, start + Math.min(requested, CAP)).map((id) => ({ id }));
  };
}

test('the keyset walk collects every station past a 1,000-row cap', async () => {
  // The shipped bug: asking for 5,000 and stopping on a short page returned
  // 1,000 of 14,000. Ending on an empty page is right whatever the cap is.
  for (const requested of [1000, 5000]) {
    const rows = await collectKeyset(cappedKeyset(requested), (r) => r.id);
    assert.equal(rows.length, 14_000, `page size ${requested}`);
  }
});

test('the range walk collects every reading, and refuses a short page', async () => {
  const fetchRange = (cap: number, table = ids) => async (from: number, to: number) =>
    table.slice(from, Math.min(to + 1, from + cap));
  assert.equal((await collectRanges(14_000, 1000, fetchRange(CAP))).length, 14_000);
  // A short LAST page is the end of the table, not a cap.
  const shorter = ids.slice(0, 13_500);
  assert.equal((await collectRanges(13_500, 1000, fetchRange(CAP, shorter))).length, 13_500);
  assert.equal((await collectRanges(0, 1000, fetchRange(CAP))).length, 0);
  // A server capped below the page size must fail loudly, not ship a hole.
  await assert.rejects(collectRanges(14_000, 1000, fetchRange(500)), /returned 500 of 1000/);
});
