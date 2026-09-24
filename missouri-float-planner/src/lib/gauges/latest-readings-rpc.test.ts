import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// In-memory PostgreSQL only: no project credentials or external database access.
test('latest readings migration preserves results and permissions', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.gauge_readings (
        gauge_station_id uuid, gauge_height_ft numeric, discharge_cfs numeric,
        reading_timestamp timestamptz NOT NULL,
        UNIQUE(gauge_station_id, reading_timestamp)
      );
      CREATE INDEX idx_gauge_readings_latest
        ON public.gauge_readings(gauge_station_id, reading_timestamp DESC);
      INSERT INTO public.gauge_readings
      SELECT ('00000000-0000-0000-0000-' || lpad(s::text,12,'0'))::uuid,
        CASE WHEN s=2 THEN NULL ELSE n::numeric/100 END,
        CASE WHEN s=3 THEN NULL ELSE n*10 END,
        '2026-09-01'::timestamptz + n * interval '1 minute'
      FROM generate_series(1,27) s CROSS JOIN generate_series(1,300) n;
    `);
    const migrations = new URL('../../../supabase/migrations/', import.meta.url);
    const original = readFileSync(new URL('00161_latest_readings_rpc.sql', migrations), 'utf8');
    await db.exec(original);
    const properties = () => db.query(`SELECT prosecdef, provolatile, proacl::text
      FROM pg_proc WHERE oid='public.latest_readings_for_stations(uuid[])'::regprocedure`);
    const before = (await properties()).rows;
    await db.exec('ALTER FUNCTION public.latest_readings_for_stations(uuid[]) RENAME TO original_latest_readings;');
    await db.exec(original);
    // The version can be renamed after production records its migration ID.
    const file = readdirSync(migrations).find(name => name.endsWith('_latest_readings_station_seeks.sql'));
    assert.ok(file);
    await db.exec(readFileSync(new URL(file, migrations), 'utf8'));
    assert.deepEqual((await properties()).rows, before);
    const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
    const all = Array.from({ length: 27 }, (_, i) => id(i + 1));
    const cases = [null, [], [null], [id(99)], [id(1), id(1), null, id(2), id(3), id(99)], all];
    for (const input of cases) {
      const oldRows = (await db.query('SELECT * FROM public.original_latest_readings($1::uuid[])', [input])).rows;
      const newRows = (await db.query('SELECT * FROM public.latest_readings_for_stations($1::uuid[])', [input])).rows;
      assert.deepEqual(newRows, oldRows, JSON.stringify(input));
    }
    const result = await db.query<{ gauge_station_id: string; gauge_height_ft: string | null; discharge_cfs: string | null }>(
      'SELECT * FROM public.latest_readings_for_stations($1::uuid[])', [all]);
    assert.equal(result.rows.length, 27);
    assert.equal(new Set(result.rows.map(row => row.gauge_station_id)).size, 27);
    assert.equal(Number(result.rows[0].gauge_height_ft), 3);
    assert.equal(Number(result.rows[0].discharge_cfs), 3000);
    assert.equal(result.rows[1].gauge_height_ft, null);
    assert.equal(result.rows[2].discharge_cfs, null);
  } finally {
    await db.close();
  }
});
