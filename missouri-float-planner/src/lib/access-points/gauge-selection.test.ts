import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { getGaugeStatus } from './detail';
import { sectionGaugeAssignment } from '../../../scripts/ingestion/section-gauges';

const reaches = [
  { primary_gauge_station_id: 'boxley', river_mile_start: null, river_mile_end: 6 },
  { primary_gauge_station_id: 'ponca', river_mile_start: 6, river_mile_end: 27.8 },
  { primary_gauge_station_id: 'pruitt', river_mile_start: 27.8, river_mile_end: 36.7 },
  { primary_gauge_station_id: 'st-joe', river_mile_start: 36.7, river_mile_end: 76.9 },
  { primary_gauge_station_id: 'harriet', river_mile_start: 76.9, river_mile_end: null },
];
function db(options: { error?: boolean; missing?: boolean } = {}) {
  const selected: string[] = [];
  const client = { from(table: string) {
    let id = 'st-joe';
    const result = () => ({ data: table === 'river_sections' ? reaches
      : table === 'river_gauges' ? options.missing ? null : {
        gauge_stations: { id, name: id, usgs_site_id: id, provider: 'usgs' },
        threshold_unit: 'cfs', level_too_low: 100, level_low: 200,
        level_optimal_min: null, level_optimal_max: 1000, level_high: 1000, level_dangerous: 2000,
      } : { gauge_height_ft: 3, discharge_cfs: 300, reading_timestamp: '2026-10-08T01:00:00Z' },
      error: options.error && table === 'river_sections' ? new Error('unavailable') : null });
    const q = {
      select: () => q, order: () => q, limit: () => q, not: () => q, lte: () => q,
      eq: (key: string, value: string) => { if (key === 'gauge_station_id') { id = value; if (table === 'river_gauges') selected.push(value); } return q; },
      single: async () => result(), maybeSingle: async () => result(),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    }; return q;
  }} as unknown as Parameters<typeof getGaugeStatus>[0];
  return { client, selected };
}
test('access overview honors reach boundaries, including Boxley mile zero and Ozark on Pruitt', async () => {
  for (const [mile, expected] of [[0,'boxley'],[6,'ponca'],[8.7,'ponca'],[16.7,'ponca'],[22.3,'ponca'],[27.79,'ponca'],[27.8,'pruitt'],[29.9,'pruitt'],[36.69,'pruitt'],[36.7,'st-joe'],[71.5,'st-joe'],[76.9,'harriet'],[131.4,'harriet']] as const) {
    const f = db(); const result = await getGaugeStatus(f.client, 'buffalo', mile);
    assert.equal(result?.gaugeId, expected, `mile ${mile}`);
    assert.deepEqual(f.selected, [expected]);
    assert.equal(result?.level, 'good');
  }
});
test('an access point with no recorded mile is rated by the primary, not the mile-0 headwater reach', async () => {
  const f = db(); const result = await getGaugeStatus(f.client, 'buffalo', null);
  assert.equal(result?.gaugeId, 'st-joe');
  assert.deepEqual(f.selected, []);
});
test('a failed section read or missing curated gauge never silently falls back to St. Joe', async () => {
  for (const options of [{ error: true }, { missing: true }]) {
    assert.equal(await getGaugeStatus(db(options).client, 'buffalo', 8.7), null);
  }
});
test('ingestion persists verified gauge AND bounds; unbounded legacy sections cannot capture a whole river', () => {
  const stations = new Map([['07055660','ponca']]);
  assert.deepEqual(sectionGaugeAssignment({ representativeGauge: { siteId: '07055660' } }, stations), {});
  assert.deepEqual(sectionGaugeAssignment({ riverMileStart: 6, riverMileEnd: 29.9, representativeGauge: { siteId: '07055660' } }, stations), {
    primary_gauge_station_id: 'ponca', river_mile_start: 6, river_mile_end: 29.9,
  });
  assert.throws(() => sectionGaugeAssignment({ riverMileStart: 6 }, stations));
  assert.throws(() => sectionGaugeAssignment({ riverMileStart: 8, riverMileEnd: 6 }, stations));
});

test('Buffalo migration skips an unseeded database but still rejects incorrect populated routing', async () => {
  const pg = new PGlite();
  try {
    await pg.exec('create table public.rivers(id uuid primary key, slug text);');
    const sql = readFileSync('supabase/migrations/20261008014150_buffalo_section_gauges_and_pruitt.sql', 'utf8');
    await pg.exec(sql);
    assert.deepEqual((await pg.query('select * from public.rivers')).rows, []);
    await pg.exec(`
      insert into public.rivers values ('11111111-1111-1111-1111-111111111111', 'buffalo');
      create function get_river_condition_segment(uuid, p_put_in_mile numeric)
        returns table(gauge_usgs_id text) language sql as 'select null::text';
    `);
    const assertion = sql.slice(sql.lastIndexOf('DO $$'), sql.lastIndexOf('COMMIT;'));
    await assert.rejects(pg.exec(assertion), /Buffalo gauge boundary regression: 9/);
  } finally { await pg.close(); }
});

test('Ozark-on-Pruitt migration skips an unseeded database and asserts the new boundary', async () => {
  const pg = new PGlite();
  try {
    await pg.exec('create table public.rivers(id uuid primary key, slug text);');
    const sql = readFileSync('supabase/migrations/20261008160000_buffalo_ozark_on_pruitt.sql', 'utf8');
    await pg.exec(sql);
    assert.match(sql, /\(27\.79,'07055660'\),\(27\.8,'07055680'\)/);
  } finally { await pg.close(); }
});
