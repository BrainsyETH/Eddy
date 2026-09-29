import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOccupancySnapshots, type HistoryObservation } from './history';

// Noon Chicago, Tuesday Sept 29 2026.
const now = new Date('2026-09-29T17:00:00Z');
function obs(overrides: Partial<HistoryObservation> = {}): HistoryObservation {
  return {
    facility_id: 'a',
    date: '2026-09-29',
    sites_open: 10,
    sites_reservable: 40,
    status: 'open',
    fetched_at: '2026-09-29T14:00:00Z',
    ...overrides,
  };
}

test('every enabled facility gets lead 0, 7 and 14 rows on the Chicago calendar', () => {
  const rows = buildOccupancySnapshots(
    [{ id: 'a', source: 'recreation_gov' }],
    [obs(), obs({ date: '2026-10-06', sites_open: 0, status: 'full' })],
    now,
  );
  assert.deepEqual(rows.map((r) => [r.date, r.lead_days, r.status]), [
    ['2026-09-29', 0, 'open'],
    ['2026-10-06', 7, 'full'],
    ['2026-10-13', 14, 'missing'],
  ]);
  assert.equal(rows[0].observed_at, '2026-09-29T14:00:00Z');
  assert.equal(rows[2].sites_open, null);
  assert.equal(rows[2].observed_at, null);
  assert.equal(rows[2].captured_at, now.toISOString());
});

test('late evening UTC still captures the Chicago night', () => {
  const late = new Date('2026-09-30T03:00:00Z');
  const rows = buildOccupancySnapshots([{ id: 'a', source: 'recreation_gov' }], [], late);
  assert.equal(rows[0].date, '2026-09-29');
});

test('expected capacity ignores closed, zero and stale rows; source is kept', () => {
  const rows = buildOccupancySnapshots(
    [{ id: 'a', source: 'mo_state_parks' }],
    [
      obs({ sites_reservable: 40 }),
      obs({ date: '2026-09-30', sites_reservable: 90, fetched_at: '2026-08-01T00:00:00Z' }),
      obs({ date: '2026-10-01', status: 'closed', sites_open: 0, sites_reservable: 0 }),
    ],
    now,
  );
  assert.equal(rows[0].expected_reservable, 40);
  assert.equal(rows[0].source, 'mo_state_parks');
});

test('the latest reading of a night wins', () => {
  const rows = buildOccupancySnapshots(
    [{ id: 'a', source: 'recreation_gov' }],
    [obs({ sites_open: 30, fetched_at: '2026-09-28T09:00:00Z' }), obs({ sites_open: 12 })],
    now,
  );
  assert.equal(rows[0].sites_open, 12);
});
