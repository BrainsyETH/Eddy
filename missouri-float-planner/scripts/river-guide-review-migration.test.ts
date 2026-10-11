import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { classifyReading } from '../shared/condition-ladder';

const migration = readFileSync('supabase/migrations/20261011202743_river_guide_review_data_corrections.sql', 'utf8');
const gasconade = 'f067668b-b9a2-4482-aad6-4952155162d2';
const crooked = '376f7b8e-0cfb-421d-a66a-976207cfe774';
const northFork = '4593382d-dfbb-40b1-b5ad-8344af4dfcd5';
const richFountain = '2ae05171-441c-4910-8357-19369824c3ad';
const hazelgreen = 'e854bae9-64ae-4bf8-ae2d-67b8f2fdf135';

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE rivers (id uuid PRIMARY KEY, slug text UNIQUE);
    CREATE TABLE gauge_stations (id uuid PRIMARY KEY, usgs_site_id text UNIQUE, name text, active boolean);
    CREATE TABLE river_gauges (
      river_id uuid REFERENCES rivers, gauge_station_id uuid REFERENCES gauge_stations,
      is_primary boolean, threshold_unit text, level_too_low numeric, level_low numeric,
      level_optimal_min numeric, level_optimal_max numeric, level_high numeric,
      level_dangerous numeric, threshold_source text, threshold_source_url text,
      UNIQUE (river_id, gauge_station_id)
    );
    CREATE TABLE access_points (id uuid PRIMARY KEY, river_id uuid REFERENCES rivers, slug text,
      name text, river_mile_downstream numeric, updated_at timestamptz, UNIQUE (river_id, slug));
    CREATE TABLE river_hazards (id uuid PRIMARY KEY, river_id uuid REFERENCES rivers, name text,
      type text, active boolean, portage_required boolean, portage_side text, description text,
      river_mile_downstream numeric, seasonal_notes text, updated_at timestamptz);
    INSERT INTO rivers VALUES ('${gasconade}', 'gasconade'), ('${crooked}', 'crooked-creek'), ('${northFork}', 'north-fork-white');
    INSERT INTO gauge_stations VALUES
      ('${richFountain}', '06934000', 'Gasconade River near Rich Fountain, MO', true),
      ('${hazelgreen}', '06928000', 'Gasconade River near Hazelgreen, MO', true);
    INSERT INTO river_gauges VALUES ('${gasconade}', '${hazelgreen}', true, 'cfs', 70, 100, 200, 1000, 1000, 3000, 'editorial', NULL);
    INSERT INTO access_points VALUES
      ('0cdb8b91-4a67-4ef9-99e9-a97a80366aed', '${crooked}', 'kelly-s-slab-access', 'Kelly''s Slab Access', 59.36, '2026-01-01');
    INSERT INTO river_hazards VALUES
      ('93062149-e42f-452e-bff6-b4e4cde70f6f', '${northFork}', 'Dawt Mill Dam', 'low_water_dam', true, true, 'right',
       'Dawt Mill Dam, a low dam just above the Tecumseh take-out that backs water up about a quarter mile and is a known canoe-buster. Portage or slide down the shallow chute at the right end (a rough path also goes around the right). A good rapid runs below the dam.',
       57.5, 'The right-end chute is the usual line/portage.', '2026-07-19T15:26:30.776941+00:00'),
      ('11111111-1111-1111-1111-111111111111', '${northFork}', 'Unrelated obstruction', 'strainer', true, false, NULL, 'Keep this warning', 20, NULL, '2026-01-01');
  `);
  return db;
}

test('guide correction links an unrated gauge, preserves navigation identities, and retires only the obsolete dam', async () => {
  const db = await fixture();
  try {
    const primaryBefore = (await db.query('SELECT * FROM river_gauges WHERE is_primary')).rows;
    await db.exec(migration);
    assert.deepEqual((await db.query('SELECT * FROM river_gauges WHERE is_primary')).rows, primaryBefore);
    const link = (await db.query<{ level_too_low: number | null; is_primary: boolean; threshold_unit: 'cfs' }>(
      `SELECT * FROM river_gauges WHERE gauge_station_id = '${richFountain}'`)).rows[0];
    assert.equal(link.is_primary, false);
    for (const [key, value] of Object.entries(link)) if (key.startsWith('level_') || key.startsWith('threshold_source')) assert.equal(value, null, key);
    assert.equal(classifyReading(5, { thresholdUnit: link.threshold_unit, levelTooLow: null, levelLow: null,
      levelOptimalMin: null, levelOptimalMax: null, levelHigh: null, levelDangerous: null }, 800), 'unknown');
    assert.deepEqual((await db.query('SELECT slug, name, river_mile_downstream FROM access_points')).rows,
      [{ slug: 'kelly-s-slab-access', name: "Kelley's Slab Access", river_mile_downstream: '59.36' }]);
    assert.deepEqual((await db.query('SELECT name FROM river_hazards WHERE active')).rows, [{ name: 'Unrelated obstruction' }]);
    const retired = (await db.query<{ description: string; portage_required: boolean; portage_side: string | null; seasonal_notes: string | null }>(
      "SELECT * FROM river_hazards WHERE name = 'Dawt Mill Dam'")).rows[0];
    assert.equal(retired.portage_required, false);
    assert.equal(retired.portage_side, null);
    assert.equal(retired.seasonal_notes, null);
    assert.match(retired.description, /have not been verified/);
    const beforeRerun = (await db.query('SELECT * FROM river_hazards ORDER BY id')).rows;
    await db.exec(migration);
    assert.equal((await db.query('SELECT * FROM river_gauges')).rows.length, 2);
    assert.deepEqual((await db.query('SELECT * FROM river_hazards ORDER BY id')).rows, beforeRerun);

    // A later calibration must survive a rerun; this correction never owns it.
    await db.exec(`UPDATE river_gauges SET level_low = 123 WHERE gauge_station_id = '${richFountain}'`);
    await db.exec(migration);
    assert.deepEqual((await db.query(`SELECT level_low FROM river_gauges WHERE gauge_station_id = '${richFountain}'`)).rows, [{ level_low: '123' }]);
  } finally { await db.close(); }
});

test('a changed hazard or renamed access aborts all corrections, including the gauge insert', async () => {
  for (const change of ["UPDATE river_hazards SET description = 'New field report' WHERE name = 'Dawt Mill Dam'",
    "UPDATE access_points SET name = 'A reviewed new name'"]) {
    const db = await fixture();
    try {
      await db.exec(change);
      const before = (await db.query('SELECT * FROM access_points')).rows;
      await assert.rejects(db.exec(migration), /Refusing/);
      assert.deepEqual((await db.query('SELECT * FROM access_points')).rows, before);
      assert.equal((await db.query('SELECT * FROM river_gauges')).rows.length, 1);
      assert.equal((await db.query('SELECT * FROM river_hazards WHERE active')).rows.length, 2);
    } finally { await db.close(); }
  }
});

test('empty seed data is a no-op, but a missing station in a populated dataset fails', async () => {
  const db = await fixture();
  try {
    await db.exec(`DELETE FROM gauge_stations WHERE id = '${richFountain}'`);
    await assert.rejects(db.exec(migration), /query returned no rows/);
    assert.deepEqual((await db.query('SELECT name FROM access_points')).rows, [{ name: "Kelly's Slab Access" }]);
    await db.exec('TRUNCATE rivers CASCADE');
    await db.exec(migration);
    assert.deepEqual((await db.query('SELECT * FROM river_gauges')).rows, []);
  } finally { await db.close(); }
});
