import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeReadingRows, pickNewerReading, type RawReadingRow } from './gauge-readings';
import type { StationReading } from './gauge-threshold';

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
