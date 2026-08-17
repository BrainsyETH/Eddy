import assert from 'node:assert/strict';
import test from 'node:test';
import {
  loadCurrentReadings,
  mergeReadingRows,
  pickNewerReading,
  type RawReadingRow,
} from './latest-readings';
import type { StationReading } from '@/lib/alerts/gauge-threshold';

function stationReading(overrides: Partial<StationReading> = {}): StationReading {
  return {
    gauge_station_id: 'station-1',
    gauge_height_ft: 3,
    discharge_cfs: 400,
    qualifiers: null,
    reading_at: '2026-07-28T17:00:00Z',
    provider: 'usgs',
    ...overrides,
  };
}

test('the newer timestamp wins', () => {
  // The point of reading both tiers: gauge_latest is refreshed hourly at :20,
  // gauge_readings every 15 minutes on a rising curated river. Taking the wrong
  // one would make curated alerts an hour slower than the app that shows them.
  const older = stationReading({ reading_at: '2026-07-28T16:00:00Z', gauge_height_ft: 2.8 });
  const newer = stationReading({ reading_at: '2026-07-28T17:45:00Z', gauge_height_ft: 3.4 });

  assert.equal(pickNewerReading(older, newer)?.gauge_height_ft, 3.4);
  assert.equal(pickNewerReading(newer, older)?.gauge_height_ft, 3.4);
});

test('an undated reading loses to a dated one', () => {
  // gate.ts cannot judge staleness without a timestamp and lets such a reading
  // through, so preferring it would smuggle old water past the staleness check.
  const dated = stationReading({ reading_at: '2026-07-28T16:00:00Z' });
  const undated = stationReading({ reading_at: null, gauge_height_ft: 9.9 });

  assert.equal(pickNewerReading(dated, undated)?.gauge_height_ft, 3);
  assert.equal(pickNewerReading(undated, dated)?.gauge_height_ft, 3);
  // But it beats nothing at all.
  assert.equal(pickNewerReading(undefined, undated)?.gauge_height_ft, 9.9);
});

test('numeric columns arrive as strings and must not be compared as strings', () => {
  // numeric(10,2) comes off PostgREST as text. Left alone, "9.00" > "10.00" is
  // true and every threshold above ten feet inverts.
  const rows: RawReadingRow[] = [
    {
      gauge_station_id: 'station-1',
      reading_timestamp: '2026-07-28T17:00:00Z',
      gauge_height_ft: '10.00',
      discharge_cfs: '1240.50',
      qualifiers: ['P'],
    },
  ];

  const merged = mergeReadingRows(rows, [], new Map([['station-1', 'usgs']]));
  const reading = merged.get('station-1')!;
  assert.equal(typeof reading.gauge_height_ft, 'number');
  assert.equal(reading.gauge_height_ft, 10);
  assert.equal(reading.discharge_cfs, 1240.5);
  assert.ok((reading.gauge_height_ft as number) > 9);
});

test('merging keeps one row per station and carries the provider through', () => {
  // provider drives the gate's staleness allowance — usgs 3h, nws 6h, usace 4h —
  // so losing it would gate a healthy dam as stale.
  const latest: RawReadingRow[] = [
    { gauge_station_id: 'a', reading_timestamp: '2026-07-28T16:00:00Z', gauge_height_ft: 2, discharge_cfs: null },
    { gauge_station_id: 'b', reading_timestamp: '2026-07-28T16:00:00Z', gauge_height_ft: 5, discharge_cfs: null },
  ];
  const history: RawReadingRow[] = [
    { gauge_station_id: 'a', reading_timestamp: '2026-07-28T17:45:00Z', gauge_height_ft: 2.6, discharge_cfs: null },
  ];

  const merged = mergeReadingRows(
    latest,
    history,
    new Map([['a', 'usgs'], ['b', 'usace']]),
  );

  assert.equal(merged.size, 2);
  assert.equal(merged.get('a')?.gauge_height_ft, 2.6);
  assert.equal(merged.get('b')?.provider, 'usace');
});

type ReadingRow = { gauge_station_id: string; reading_timestamp: string };

/**
 * A stand-in for the PostgREST client, recording which tables and functions
 * were asked for.
 *
 * Deliberately tiny: the point is to pin the read path's CONTRACT — that it
 * consults both tiers and prefers the newer row — not to reimplement PostgREST.
 *
 * `rpc: 'missing'` models a database that has not run the migration adding
 * get_latest_curated_readings, which is the state of production between a
 * website deploy and its migration. That is not a hypothetical ordering: the
 * fallback exists precisely because it happens.
 */
function fakeSupabase(
  tables: Record<string, unknown[]>,
  options: { rpc?: 'ok' | 'missing' } = {},
) {
  const asked: string[] = [];
  const rpcCalls: string[] = [];
  const builder = (rows: unknown[]) => {
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'in', 'eq', 'order', 'limit']) {
      chain[method] = () => chain;
    }
    // Awaiting the builder is what PostgREST resolves; `then` is how that works.
    chain.then = (resolve: (r: { data: unknown[] }) => unknown) => resolve({ data: rows });
    return chain;
  };
  return {
    asked,
    rpcCalls,
    from(table: string) {
      asked.push(table);
      return builder(tables[table] ?? []);
    },
    rpc(name: string, args: { p_station_ids: string[] }) {
      rpcCalls.push(name);
      if (options.rpc === 'missing') {
        return Promise.resolve({
          data: null,
          error: { code: 'PGRST202', message: 'Could not find the function' },
        });
      }
      // The real function returns the NEWEST gauge_readings row per station,
      // one per id — never the whole history.
      const wanted = new Set(args.p_station_ids);
      const newest = new Map<string, ReadingRow>();
      for (const row of (tables.gauge_readings ?? []) as ReadingRow[]) {
        if (!wanted.has(row.gauge_station_id)) continue;
        const held = newest.get(row.gauge_station_id);
        if (!held || row.reading_timestamp > held.reading_timestamp) {
          newest.set(row.gauge_station_id, row);
        }
      }
      return Promise.resolve({ data: [...newest.values()], error: null });
    },
  };
}

test('the read path prefers curated history over the hourly gauge_latest row', async () => {
  // The Huzzah case exactly: gauge_latest is rewritten once an hour at :20 and
  // held 80 cfs, while update-gauges had already appended 87 to gauge_readings.
  // The detail screen read only gauge_latest, so it showed a number an hour
  // behind the search row — and behind the value the alert engine seeds from.
  const supabase = fakeSupabase({
    gauge_stations: [{ id: 'huzzah', provider: 'usgs', curated: true }],
    gauge_latest: [
      {
        gauge_station_id: 'huzzah',
        reading_timestamp: '2026-07-31T09:45:00Z',
        gauge_height_ft: null,
        discharge_cfs: '80.00',
        qualifiers: ['P'],
      },
    ],
    gauge_readings: [
      {
        gauge_station_id: 'huzzah',
        reading_timestamp: '2026-07-31T10:45:00Z',
        gauge_height_ft: null,
        discharge_cfs: '87.00',
        qualifiers: ['P'],
      },
    ],
  });

  const readings = await loadCurrentReadings(supabase, ['huzzah']);

  assert.equal(readings.get('huzzah')?.discharge_cfs, 87);
  assert.equal(readings.get('huzzah')?.reading_at, '2026-07-31T10:45:00Z');
  // The curated tier was consulted — now by seeking it rather than scanning it.
  assert.ok(supabase.rpcCalls.includes('get_latest_curated_readings'));
});

test('the same answer comes back when the seek function is not deployed yet', async () => {
  // The website ships ahead of its migrations, so this is a real state of
  // production and not a defensive flourish. A database without the function
  // must still merge both tiers — slower, via the bounded scan, never wronger.
  const supabase = fakeSupabase(
    {
      gauge_stations: [{ id: 'huzzah', provider: 'usgs', curated: true }],
      gauge_latest: [
        {
          gauge_station_id: 'huzzah',
          reading_timestamp: '2026-07-31T09:45:00Z',
          gauge_height_ft: null,
          discharge_cfs: '80.00',
          qualifiers: ['P'],
        },
      ],
      gauge_readings: [
        {
          gauge_station_id: 'huzzah',
          reading_timestamp: '2026-07-31T10:45:00Z',
          gauge_height_ft: null,
          discharge_cfs: '87.00',
          qualifiers: ['P'],
        },
      ],
    },
    { rpc: 'missing' },
  );

  const readings = await loadCurrentReadings(supabase, ['huzzah']);

  assert.equal(readings.get('huzzah')?.discharge_cfs, 87);
  assert.equal(readings.get('huzzah')?.reading_at, '2026-07-31T10:45:00Z');
  // It tried the function first, then fell back to the table.
  assert.ok(supabase.rpcCalls.includes('get_latest_curated_readings'));
  assert.ok(supabase.asked.includes('gauge_readings'));
});

test('an uncurated station is never scanned for history it cannot have', async () => {
  // gauge_readings holds curated history only. Querying it for the ~16,500
  // national stations would be a scan for rows that cannot exist.
  const supabase = fakeSupabase({
    gauge_stations: [{ id: 'national', provider: 'usgs', curated: false }],
    gauge_latest: [
      {
        gauge_station_id: 'national',
        reading_timestamp: '2026-07-31T09:45:00Z',
        gauge_height_ft: '4.10',
        discharge_cfs: null,
        qualifiers: null,
      },
    ],
  });

  const readings = await loadCurrentReadings(supabase, ['national']);

  assert.equal(readings.get('national')?.gauge_height_ft, 4.1);
  assert.equal(supabase.asked.includes('gauge_readings'), false);
  // Neither by scanning the table nor by seeking through the function: an
  // uncurated station has no history in either shape.
  assert.equal(supabase.rpcCalls.includes('get_latest_curated_readings'), false);
});

test('a curated station whose history is older keeps its gauge_latest row', async () => {
  // The floor: merging must never DOWNGRADE a station to an older number just
  // because a second tier answered.
  const supabase = fakeSupabase({
    gauge_stations: [{ id: 'curated', provider: 'usgs', curated: true }],
    gauge_latest: [
      {
        gauge_station_id: 'curated',
        reading_timestamp: '2026-07-31T10:45:00Z',
        gauge_height_ft: '3.20',
        discharge_cfs: null,
        qualifiers: null,
      },
    ],
    gauge_readings: [
      {
        gauge_station_id: 'curated',
        reading_timestamp: '2026-07-31T08:00:00Z',
        gauge_height_ft: '2.90',
        discharge_cfs: null,
        qualifiers: null,
      },
    ],
  });

  const readings = await loadCurrentReadings(supabase, ['curated']);

  assert.equal(readings.get('curated')?.gauge_height_ft, 3.2);
});
