import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { forecastHistoryRows } from './dam-forecast-history';
import { buildSnapshot } from './dams';
import { USACE_DAMS } from '@/lib/flow-providers/usace-registry';
import type { DamGenerationForecast, DamScheduleDay, DamSnapshot } from '@shared/dam-types';

const DAM = Object.keys(USACE_DAMS)[0];

function forecast(firstStart: string, retrievedAt: string, peak = 3_560): DamGenerationForecast {
  return {
    windows: [
      { startUtc: firstStart, endUtc: '2026-10-12T17:00:00.000Z', generating: false, peakCfs: null },
      { startUtc: '2026-10-12T17:00:00.000Z', endUtc: '2026-10-12T21:00:00.000Z', generating: true, peakCfs: peak },
    ],
    timeZone: 'America/Chicago',
    retrievedAt,
    source: 'U.S. Army Corps of Engineers, Nashville District',
  };
}

function day(retrievedAt: string, mw = 0): DamScheduleDay {
  return {
    scheduleDate: '2026-10-12',
    hours: [{ hourEnding: 1, megawatts: mw }] as DamScheduleDay['hours'],
    idle: [{ from: 1, to: 24 }],
    retrievedAt,
  };
}

function snapshot(over: Partial<DamSnapshot>): DamSnapshot {
  return { ...buildSnapshot(USACE_DAMS[DAM], {}, []), ...over };
}

test('an hourly rebuild of an unchanged forecast hashes the same', () => {
  const a = forecastHistoryRows(snapshot({ generationForecast: forecast('2026-10-12T12:00:00.000Z', '2026-10-12T12:05:00Z'), schedule: [day('2026-10-12T12:05:00Z')] }));
  const b = forecastHistoryRows(snapshot({ generationForecast: forecast('2026-10-12T13:00:00.000Z', '2026-10-12T13:05:00Z'), schedule: [day('2026-10-12T13:05:00Z')] }));
  assert.deepEqual(a.map((r) => r.source), ['cwms_generation_forecast', 'swpa_schedule']);
  assert.deepEqual(a.map((r) => r.content_hash), b.map((r) => r.content_hash));
  // The payload is stored as served, fetch time included.
  assert.equal((b[0].payload as DamGenerationForecast).retrievedAt, '2026-10-12T13:05:00Z');
});

test('a changed peak or schedule is a new version', () => {
  const base = forecastHistoryRows(snapshot({ generationForecast: forecast('2026-10-12T12:00:00.000Z', 'x'), schedule: [day('x')] }));
  const changed = forecastHistoryRows(snapshot({ generationForecast: forecast('2026-10-12T12:00:00.000Z', 'x', 7_000), schedule: [day('x', 40)] }));
  assert.notEqual(base[0].content_hash, changed[0].content_hash);
  assert.notEqual(base[1].content_hash, changed[1].content_hash);
});

test('a dam with no forecast and no schedule records nothing', () => {
  assert.deepEqual(forecastHistoryRows(snapshot({ generationForecast: undefined, schedule: [] })), []);
  assert.deepEqual(
    forecastHistoryRows(snapshot({ generationForecast: { ...forecast('a', 'b'), windows: [] }, schedule: [] })),
    [],
  );
});

test('record_dam_forecasts keeps one row per version and its served interval', async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
    await db.exec(readFileSync('supabase/migrations/20261012030607_dam_forecast_history.sql', 'utf8'));
    const record = (hash: string, at: string) =>
      db.query<{ r: { inserted: number; extended: number; pruned: number } }>(
        'SELECT record_dam_forecasts($1::jsonb, $2::timestamptz) r',
        [JSON.stringify([{ dam_id: 'd', source: 'swpa_schedule', content_hash: `hash-${hash}`, payload: [] }]), at],
      );
    const rows = async () =>
      (await db.query<{ content_hash: string; first_seen_at: Date; last_seen_at: Date }>(
        'SELECT content_hash, first_seen_at, last_seen_at FROM dam_forecast_history ORDER BY first_seen_at',
      )).rows.map((r) => `${r.content_hash} ${r.first_seen_at.toISOString().slice(11, 16)}-${r.last_seen_at.toISOString().slice(11, 16)}`);

    await record('aaaaaaaa', '2026-10-12T10:00Z');
    await record('aaaaaaaa', '2026-10-12T11:00Z');
    await record('bbbbbbbb', '2026-10-12T12:00Z');
    await record('aaaaaaaa', '2026-10-12T13:00Z');
    // A late, older run neither rewinds an interval nor inserts out of order.
    await record('cccccccc', '2026-10-12T12:30Z');
    await record('aaaaaaaa', '2026-10-12T12:30Z');
    assert.deepEqual(await rows(), [
      'hash-aaaaaaaa 10:00-11:00',
      'hash-bbbbbbbb 12:00-12:00',
      'hash-aaaaaaaa 13:00-13:00',
    ]);

    const pruned = await record('aaaaaaaa', '2028-10-13T13:00Z');
    assert.equal(pruned.rows[0].r.pruned, 2, 'versions last served over 730 days ago are dropped');

    await db.exec('SET ROLE anon');
    await assert.rejects(() => record('aaaaaaaa', '2028-10-13T14:00Z'), /permission denied/);
    await assert.rejects(() => db.query('SELECT * FROM dam_forecast_history'), /permission denied/);
  } finally {
    await db.close();
  }
});
