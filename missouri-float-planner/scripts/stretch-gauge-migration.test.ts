import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// 20261117200000 records a gauge and mile bounds for twenty-one stretches.
// Stretch Reads are paused, so the Read does not use them yet. The same
// columns choose the gauge that grades a float plan
// (get_river_condition_segment), so the migration's own promise is that no
// put-in changes gauge. These tests run the real file against a fixture and
// check that promise holds, and that the file refuses to apply when it would
// not.

const migration = readFileSync(
  'supabase/migrations/20261117200000_twenty_one_stretches_read_their_own_gauge.sql',
  'utf8',
);

interface PlanRow { river: string; section: string; site: string; start: number; end: number }

/** The plan rows, read out of the migration so the fixture cannot drift from it. */
const plan: PlanRow[] = [...migration.matchAll(/^\s+\('([a-z-]+)', '([a-z0-9-]+)', '(\d+)', ([\d.]+), ([\d.]+)\)[,;]$/gm)]
  .map((m) => ({ river: m[1], section: m[2], site: m[3], start: Number(m[4]), end: Number(m[5]) }));

const rivers = [...new Set(plan.map((p) => p.river))];
const primarySite = new Map(plan.map((p) => [p.river, p.site]));
/** Big River's second gauge: linked and rated, not primary, no stored mile. */
const BYRNESVILLE = '07018500';

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE rivers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text UNIQUE NOT NULL);
    CREATE TABLE gauge_stations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), usgs_site_id text UNIQUE, active boolean NOT NULL DEFAULT true);
    CREATE TABLE river_gauges (river_id uuid REFERENCES rivers, gauge_station_id uuid REFERENCES gauge_stations,
      is_primary boolean, level_optimal_min numeric, river_mile numeric, UNIQUE (river_id, gauge_station_id));
    CREATE TABLE river_sections (river_id uuid REFERENCES rivers, section_slug text, sort_order int,
      river_mile_start numeric, river_mile_end numeric, primary_gauge_station_id uuid REFERENCES gauge_stations,
      UNIQUE (river_id, section_slug));
    CREATE TABLE access_points (river_id uuid REFERENCES rivers, name text, river_mile_downstream numeric, approved boolean NOT NULL DEFAULT true);

    -- The gauge-selection half of production's get_river_condition_segment
    -- (20261117014151): a stretch's own gauge, then the nearest gauge at or
    -- above the put-in, then the nearest below, then the primary.
    CREATE FUNCTION get_river_condition_segment(p_river_id uuid, p_put_in_point text DEFAULT NULL, p_put_in_mile numeric DEFAULT NULL)
    RETURNS TABLE (gauge_usgs_id text) LANGUAGE sql STABLE AS $f$
      WITH selected AS (SELECT COALESCE(
        (SELECT rs.primary_gauge_station_id FROM river_sections rs
          WHERE rs.river_id = p_river_id AND rs.primary_gauge_station_id IS NOT NULL AND p_put_in_mile IS NOT NULL
            AND (rs.river_mile_start IS NULL OR p_put_in_mile >= rs.river_mile_start)
            AND (rs.river_mile_end IS NULL OR p_put_in_mile < rs.river_mile_end)
          ORDER BY rs.sort_order LIMIT 1),
        (SELECT gs.id FROM gauge_stations gs JOIN river_gauges rg ON rg.gauge_station_id = gs.id
          WHERE rg.river_id = p_river_id AND gs.active AND rg.river_mile IS NOT NULL AND rg.river_mile <= p_put_in_mile
          ORDER BY rg.river_mile DESC LIMIT 1),
        (SELECT gs.id FROM gauge_stations gs JOIN river_gauges rg ON rg.gauge_station_id = gs.id
          WHERE rg.river_id = p_river_id AND gs.active AND rg.river_mile IS NOT NULL AND rg.river_mile > p_put_in_mile
          ORDER BY rg.river_mile ASC LIMIT 1),
        (SELECT rg.gauge_station_id FROM river_gauges rg WHERE rg.river_id = p_river_id AND rg.is_primary LIMIT 1)) AS gauge_id)
      SELECT gs.usgs_site_id FROM selected s JOIN gauge_stations gs ON gs.id = s.gauge_id
    $f$;
  `);

  for (const slug of rivers) {
    await db.query('INSERT INTO rivers (slug) VALUES ($1)', [slug]);
    await db.query('INSERT INTO gauge_stations (usgs_site_id) VALUES ($1)', [primarySite.get(slug)]);
    await db.query(
      `INSERT INTO river_gauges (river_id, gauge_station_id, is_primary, level_optimal_min)
       SELECT r.id, g.id, true, 1 FROM rivers r, gauge_stations g WHERE r.slug = $1 AND g.usgs_site_id = $2`,
      [slug, primarySite.get(slug)],
    );
    // A stretch the plan leaves alone, sorted first so it would win if it matched.
    await db.query(
      `INSERT INTO river_sections (river_id, section_slug, sort_order) SELECT id, 'not-in-the-plan', -1 FROM rivers WHERE slug = $1`,
      [slug],
    );
  }
  for (const [i, p] of plan.entries()) {
    await db.query(
      `INSERT INTO river_sections (river_id, section_slug, sort_order) SELECT id, $2, $3 FROM rivers WHERE slug = $1`,
      [p.river, p.section, i],
    );
    // A put-in at each end of every stretch.
    for (const mile of [p.start, p.end]) {
      await db.query(
        `INSERT INTO access_points (river_id, name, river_mile_downstream) SELECT id, $2, $3 FROM rivers WHERE slug = $1`,
        [p.river, `${p.section} @${mile}`, mile],
      );
    }
  }
  await db.query('INSERT INTO gauge_stations (usgs_site_id) VALUES ($1)', [BYRNESVILLE]);
  await db.query(
    `INSERT INTO river_gauges (river_id, gauge_station_id, is_primary, level_optimal_min)
     SELECT r.id, g.id, false, 1 FROM rivers r, gauge_stations g WHERE r.slug = 'big-river' AND g.usgs_site_id = $1`,
    [BYRNESVILLE],
  );
  // Morse Mill: on Big River, outside every planned stretch.
  await db.query(
    `INSERT INTO access_points (river_id, name, river_mile_downstream) SELECT id, 'Morse Mill Access', 110.25 FROM rivers WHERE slug = 'big-river'`,
  );
  return db;
}

const assignedCount = async (db: PGlite) =>
  Number((await db.query<{ n: string }>('SELECT count(*) AS n FROM river_sections WHERE primary_gauge_station_id IS NOT NULL')).rows[0].n);

test('the plan is twenty-one bounded stretches on ten rivers', () => {
  assert.equal(plan.length, 21);
  assert.equal(rivers.length, 10);
  for (const p of plan) assert.ok(p.start < p.end, `${p.river}/${p.section} has no length`);
  // One gauge per river: overlapping stretches are only harmless because of it.
  assert.equal(new Set(plan.map((p) => `${p.river}:${p.site}`)).size, 10);
});

test('a gauge and its bounds are set together, and gauge miles are left alone', () => {
  // A stretch with a gauge and no bounds matches every mile on its river.
  assert.match(migration, /set primary_gauge_station_id = g\.id,\s+river_mile_start = p\.start_mile,\s+river_mile_end = p\.end_mile/);
  // Setting river_gauges.river_mile would switch on positional selection for
  // put-ins outside these stretches, which is not what was reviewed.
  assert.doesNotMatch(migration, /update\s+(public\.)?river_gauges/i);
});

test('applying it connects every stretch and moves no put-in to another gauge', async () => {
  const db = await fixture();
  await db.exec(migration);

  assert.equal(await assignedCount(db), 21);
  const rows = (await db.query<{ slug: string; section_slug: string; site: string; a: string; b: string }>(
    `SELECT r.slug, s.section_slug, g.usgs_site_id AS site, s.river_mile_start AS a, s.river_mile_end AS b
     FROM river_sections s JOIN rivers r ON r.id = s.river_id JOIN gauge_stations g ON g.id = s.primary_gauge_station_id`,
  )).rows;
  for (const p of plan) {
    const row = rows.find((r) => r.slug === p.river && r.section_slug === p.section);
    assert.deepEqual([row?.site, Number(row?.a), Number(row?.b)], [p.site, p.start, p.end], `${p.river}/${p.section}`);
  }

  // Outside every stretch, and on a river with a second gauge: still the primary.
  const morseMill = await db.query<{ gauge_usgs_id: string }>(
    `SELECT c.gauge_usgs_id FROM rivers r, get_river_condition_segment(p_river_id => r.id, p_put_in_mile => 110.25) c WHERE r.slug = 'big-river'`,
  );
  assert.equal(morseMill.rows[0].gauge_usgs_id, '07018100');
});

test('it refuses, and changes nothing, when a put-in would switch gauge', async () => {
  const db = await fixture();
  // Give the second gauge a mile: positional selection now sends Morse Mill to
  // it, so "every put-in still resolves to the primary" is no longer true.
  await db.query(
    `UPDATE river_gauges rg SET river_mile = 100 FROM gauge_stations g WHERE g.id = rg.gauge_station_id AND g.usgs_site_id = $1`,
    [BYRNESVILLE],
  );
  await assert.rejects(db.exec(migration), /no longer resolves to its river's primary gauge: big-river: .*Morse Mill Access/);
  assert.equal(await assignedCount(db), 0);
});

test('it refuses when a stretch has already been given a gauge or bounds', async () => {
  const db = await fixture();
  await db.exec(migration);
  // A second run would otherwise overwrite whatever somebody curated since.
  await assert.rejects(db.exec(migration), /0 of 21 stretches exist unassigned and unbounded/);
  assert.equal(await assignedCount(db), 21);
});

test('it refuses when a planned gauge is not rated', async () => {
  const db = await fixture();
  await db.query(
    `UPDATE river_gauges rg SET level_optimal_min = NULL FROM gauge_stations g WHERE g.id = rg.gauge_station_id AND g.usgs_site_id = '07252000'`,
  );
  // An unrated gauge cannot produce a Read whatever it is connected to.
  await assert.rejects(db.exec(migration), /16 of 21 gauges are linked, active, rated and primary/);
  assert.equal(await assignedCount(db), 0);
});

test('a database without these rivers is left alone', async () => {
  const db = await fixture();
  await db.exec('DELETE FROM access_points; DELETE FROM river_sections; DELETE FROM river_gauges; DELETE FROM rivers;');
  await db.exec(migration);
  assert.equal(await assignedCount(db), 0);
});
