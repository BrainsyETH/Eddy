import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// Every Meramec put-in read the Steelville gauge by stored mile, because the
// river's stretches name no gauge and none of its gauge links carries a mile.
// The migration adds seven stretches whose bounds fall between put-ins on both
// mile scales: the stored access mile (the planner, the access page) and the
// river-line mile a map point snaps to (embeds, /api/conditions), which are 22
// to 27 miles apart here. These tests run the real file against production's
// put-ins and gauges as read on 2026-11-21, and check both paths.

const migration = readFileSync('supabase/migrations/20261121170000_meramec_put_ins_read_the_gauge_on_their_water.sql', 'utf8');

const COOK = '07010350', STEELVILLE = '07013000', SULLIVAN = '07014500', EUREKA = '07019000';

/**
 * name, stored mile, river-line mile (snap_to_river of the put-in's point),
 * nearest gauge by distance, the gauge on its water (EDDY_KNOWLEDGE.md).
 */
const PUT_INS: [name: string, stored: number, line: number, nearest: string, water: string][] = [
  ['Short Bend Low Water Bridge', 0.1, 24.34, COOK, COOK], ['Short Bend', 0.9, 25.4, COOK, COOK],
  ['Highway M Low-Water Bridge', 6.3, 30.59, COOK, COOK], ['Cook Station', 8.7, 32.7, COOK, COOK],
  ['Wesco', 13.7, 37.35, COOK, COOK], ['Wesco–Highway U Access', 16.7, 40.09, COOK, COOK],
  ['Highway U Access', 18.7, 42.25, COOK, COOK],
  // Above Maramec Spring (stored 28.1), but its line mile is nearer Steelville.
  ['Woodson K. Woods Memorial CA', 26.2, 49.4, STEELVILLE, COOK],
  ['Maramec Spring Park', 28.1, 51.37, STEELVILLE, STEELVILLE], ['Scotts Ford', 35.1, 57.83, STEELVILLE, STEELVILLE],
  ['Indian Springs Resort', 41, 63.67, STEELVILLE, STEELVILLE], ['Riverview Public Access', 42.3, 64.84, STEELVILLE, STEELVILLE],
  ['Lucky Clover Resort', 47.4, 69.94, STEELVILLE, STEELVILLE], ["Bird's Nest Access", 50, 72.54, STEELVILLE, STEELVILLE],
  ["Garrison's River Resort", 55.3, 77.58, STEELVILLE, STEELVILLE],
  // Below the Huzzah (line 87.79), but nearer Steelville by distance.
  ['Onondaga Cave State Park', 68.4, 90.43, STEELVILLE, SULLIVAN], ['Ozark Outdoors Resort', 68.5, 90.65, STEELVILLE, SULLIVAN],
  ['Campbell Bridge', 73.6, 95.94, SULLIVAN, SULLIVAN], ['Riverview Ranch', 74.2, 96.47, SULLIVAN, SULLIVAN],
  ['Blue Springs Creek Conservation Area', 78.6, 100.38, SULLIVAN, SULLIVAN], ['Sappington Bridge', 83.2, 105.21, SULLIVAN, SULLIVAN],
  ['Meramec State Park (Lower Ramp)', 86.4, 109.83, SULLIVAN, SULLIVAN], ['Meramec State Park', 88, 112.12, SULLIVAN, SULLIVAN],
  ['Spanish Claim Access', 92, 114.79, SULLIVAN, SULLIVAN], ['Meramec Caverns Campground', 94.3, 116.29, SULLIVAN, SULLIVAN],
  ['Sand Ford', 95.4, 117.21, SULLIVAN, SULLIVAN], ['Red Horse Access', 112, 135.37, SULLIVAN, SULLIVAN],
  // Above the Bourbeuse (line 156.71), but nearer Eureka by distance.
  ["River 'Round Conservation Area", 126.9, 150.72, EUREKA, SULLIVAN],
  ['Chouteau Claim', 131.5, 156.65, EUREKA, EUREKA], ['Robertsville MO State Park', 136, 162.55, EUREKA, EUREKA],
  ['Pacific Palisades Conservation Area', 148.38, 174.93, EUREKA, EUREKA], ['Allenton Access', 155.55, 182.1, EUREKA, EUREKA],
  ['Meramec Landing (Valley Park)', 175.3, 201.85, EUREKA, EUREKA],
];

/** The two put-ins no bound can serve on the point path; both read there as they do today. */
const POINT_EXCEPTIONS = ['Woodson K. Woods Memorial CA', "River 'Round Conservation Area"];

async function fixture({ meramec = true } = {}) {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE rivers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text UNIQUE NOT NULL);
    CREATE TABLE gauge_stations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), usgs_site_id text UNIQUE, name text NOT NULL,
      active boolean NOT NULL DEFAULT true);
    CREATE TABLE river_gauges (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), river_id uuid REFERENCES rivers,
      gauge_station_id uuid REFERENCES gauge_stations, is_primary boolean NOT NULL DEFAULT false, river_mile numeric,
      level_too_low numeric, level_optimal_min numeric, UNIQUE (river_id, gauge_station_id));
    CREATE TABLE river_sections (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), river_id uuid REFERENCES rivers,
      section_slug text NOT NULL, name text NOT NULL, description text, sort_order int NOT NULL, river_type text,
      river_mile_start numeric, river_mile_end numeric, primary_gauge_station_id uuid REFERENCES gauge_stations,
      UNIQUE (river_id, section_slug));
    CREATE TABLE access_points (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), river_id uuid REFERENCES rivers, name text,
      river_mile_downstream numeric, line_mile numeric, nearest_site text, approved boolean NOT NULL DEFAULT true);

    -- The gauge-selection half of production's get_river_condition_segment for a
    -- stored mile: a stretch's own gauge, then the nearest gauge at or above the
    -- put-in by river_gauges.river_mile, then the nearest below, then the main gauge.
    CREATE FUNCTION get_river_condition_segment(p_river_id uuid, p_put_in_point text DEFAULT NULL, p_put_in_mile numeric DEFAULT NULL)
    RETURNS TABLE (gauge_name text, gauge_usgs_id text) LANGUAGE sql STABLE AS $f$
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
      SELECT gs.name, gs.usgs_site_id FROM selected s JOIN gauge_stations gs ON gs.id = s.gauge_id
    $f$;
  `);
  if (!meramec) return db;
  await db.exec(`
    INSERT INTO rivers (slug) VALUES ('meramec');
    INSERT INTO gauge_stations (usgs_site_id, name) VALUES
      ('${COOK}', 'Meramec River at Cook Station, MO'), ('${STEELVILLE}', 'Meramec River near Steelville, MO'),
      ('${SULLIVAN}', 'Meramec River near Sullivan, MO'), ('${EUREKA}', 'Meramec River near Eureka, MO');
    INSERT INTO river_gauges (river_id, gauge_station_id, is_primary)
      SELECT r.id, g.id, g.usgs_site_id = '${STEELVILLE}' FROM rivers r, gauge_stations g;
    -- The two stretches production already has: a catalogue, no gauge, no bounds.
    INSERT INTO river_sections (river_id, section_slug, name, sort_order)
      SELECT id, 'upper-meramec', 'Upper Meramec (above Meramec State Park)', 1 FROM rivers
      UNION ALL SELECT id, 'lower-meramec', 'Lower Meramec (below Meramec State Park)', 2 FROM rivers;`);
  for (const [name, stored, line, nearest] of PUT_INS) {
    await db.query(`INSERT INTO access_points (river_id, name, river_mile_downstream, line_mile, nearest_site)
      SELECT id, $1, $2, $3, $4 FROM rivers WHERE slug = 'meramec'`, [name, stored, line, nearest]);
  }
  return db;
}

/**
 * Each put-in's gauge by stored mile (the planner and the access page), and
 * by map point: production snaps the point to the line, takes a stretch that
 * holds that mile, else the nearest gauge by distance.
 */
async function gauges(db: PGlite) {
  const { rows } = await db.query<{ name: string; stored: string; point: string }>(`
    SELECT ap.name,
      (SELECT c.gauge_usgs_id FROM get_river_condition_segment(p_river_id => r.id, p_put_in_mile => ap.river_mile_downstream) c) AS stored,
      COALESCE((SELECT g.usgs_site_id FROM river_sections rs JOIN gauge_stations g ON g.id = rs.primary_gauge_station_id
        WHERE rs.river_id = r.id AND ap.line_mile >= rs.river_mile_start AND ap.line_mile < rs.river_mile_end
        ORDER BY rs.sort_order LIMIT 1), ap.nearest_site) AS point
    FROM access_points ap JOIN rivers r ON r.id = ap.river_id ORDER BY ap.river_mile_downstream, ap.name`);
  return rows;
}
const sections = async (db: PGlite) => (await db.query<{ n: number }>('SELECT count(*)::int AS n FROM river_sections')).rows[0].n;
const wrong = (rows: Awaited<ReturnType<typeof gauges>>, path: 'stored' | 'point') =>
  rows.filter((row) => row[path] !== PUT_INS.find(([name]) => name === row.name)![4]).map((row) => row.name);

test('before: every put-in reads Steelville by stored mile, and 26 of them are not on its water', async () => {
  const before = await gauges(await fixture());
  assert.equal(before.length, 33);
  assert.ok(before.every((row) => row.stored === STEELVILLE));
  assert.equal(wrong(before, 'stored').length, 26);
  assert.deepEqual(wrong(before, 'point'), ['Woodson K. Woods Memorial CA', 'Onondaga Cave State Park', 'Ozark Outdoors Resort', "River 'Round Conservation Area"]);
});

test('after: every put-in reads its own water by stored mile, and all but two by map point', async () => {
  const db = await fixture();
  await db.exec(migration);
  const after = await gauges(db);
  assert.deepEqual(wrong(after, 'stored'), []);
  assert.deepEqual(wrong(after, 'point'), POINT_EXCEPTIONS);
  // The two exceptions read by map point exactly as they do today.
  for (const name of POINT_EXCEPTIONS) {
    assert.equal(after.find((row) => row.name === name)?.point, PUT_INS.find(([n]) => n === name)![3]);
  }
  const count = (site: string) => after.filter((row) => row.stored === site).length;
  assert.deepEqual([count(COOK), count(STEELVILLE), count(SULLIVAN), count(EUREKA)], [8, 7, 13, 5]);
});

test('the point path only gains: Onondaga and Ozark Outdoors move to Sullivan, nothing else changes', async () => {
  const before = await gauges(await fixture());
  const db = await fixture();
  await db.exec(migration);
  const after = await gauges(db);
  const moved = after.filter((row, i) => row.point !== before[i].point).map((row) => `${row.name} ${before.find((b) => b.name === row.name)!.point} -> ${row.point}`);
  assert.deepEqual(moved, [`Onondaga Cave State Park ${STEELVILLE} -> ${SULLIVAN}`, `Ozark Outdoors Resort ${STEELVILLE} -> ${SULLIVAN}`]);
});

test('seven stretches with both bounds, none overlapping, two of them bounded at an inflow', async () => {
  const db = await fixture();
  await db.exec(migration);
  const { rows } = await db.query<{ section_slug: string; lo: string; hi: string; site: string; sort_order: number; river_type: string | null }>(`
    SELECT s.section_slug, s.river_mile_start AS lo, s.river_mile_end AS hi, g.usgs_site_id AS site, s.sort_order, s.river_type
    FROM river_sections s JOIN gauge_stations g ON g.id = s.primary_gauge_station_id ORDER BY s.sort_order`);
  assert.deepEqual(rows.map((row) => `${row.section_slug} [${Number(row.lo)}, ${Number(row.hi)}) ${row.site} #${row.sort_order}`), [
    `above-maramec-spring [0, 28.1) ${COOK} #3`,
    `huzzah-to-ozark-outdoors [65.6, 69.9) ${SULLIVAN} #4`,
    `campbell-bridge-to-riverview-ranch [73, 77.5) ${SULLIVAN} #5`,
    `blue-springs-creek-to-the-bourbeuse [78, 131.5) ${SULLIVAN} #6`,
    `chouteau-claim [131.5, 135) ${EUREKA} #7`,
    `robertsville-to-pacific-palisades [135.9, 150.5) ${EUREKA} #8`,
    `allenton-to-valley-park [151, 230) ${EUREKA} #9`,
  ]);
  // No reach panel lists them: none declares its own hydrology.
  assert.ok(rows.every((row) => row.river_type === null));
  for (let i = 1; i < rows.length; i++) assert.ok(Number(rows[i].lo) >= Number(rows[i - 1].hi), `${rows[i].section_slug} overlaps the stretch above`);
  // 28.1 is the Maramec Spring branch and 131.5 the Bourbeuse at Chouteau Claim, on the stored scale.
  assert.equal(Number(rows[0].hi), 28.1);
  assert.equal(Number(rows[3].hi), 131.5);
});

test('no gauge gets a mile and no float levels change', async () => {
  assert.doesNotMatch(migration.replace(/^--.*$/gm, ''), /level_|river_mile\s*=/);
  const db = await fixture();
  await db.exec(migration);
  const { rows } = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM river_gauges WHERE river_mile IS NOT NULL');
  assert.equal(rows[0].n, 0);
});

test('it refuses, and changes nothing, when production is not as it was reviewed', async () => {
  const unchanged = async (db: PGlite, message: RegExp) => {
    const before = [await gauges(db), await sections(db)];
    await assert.rejects(db.exec(migration), message);
    assert.deepEqual([await gauges(db), await sections(db)], before);
  };
  // A put-in approved since the review, in a gap, would stay on Steelville unseen.
  let db = await fixture();
  await db.exec(`INSERT INTO access_points (river_id, name, river_mile_downstream, line_mile, nearest_site) SELECT id, 'New ramp', 60, 82, '${STEELVILLE}' FROM rivers`);
  await unchanged(db, /34 approved put-ins with a stored mile, expected the 33/);
  // Someone gave a gauge a mile in the meantime.
  db = await fixture();
  await db.exec(`UPDATE river_gauges rg SET river_mile = 50 FROM gauge_stations g WHERE g.id = rg.gauge_station_id AND g.usgs_site_id = '${STEELVILLE}'`);
  await unchanged(db, /a gauge link carries a mile/);
  // A gauge it names was retired.
  db = await fixture();
  await db.exec(`UPDATE gauge_stations SET active = false WHERE usgs_site_id = '${SULLIVAN}'`);
  await unchanged(db, /not linked to the river and active: 07014500/);
  // The main gauge changed, so the gaps would fall to another gauge.
  db = await fixture();
  await db.exec(`UPDATE river_gauges rg SET is_primary = (g.usgs_site_id = '${EUREKA}') FROM gauge_stations g WHERE g.id = rg.gauge_station_id`);
  await unchanged(db, /Steelville \(07013000\) is not the main gauge/);
  // A stretch that already names a gauge covers the same miles.
  db = await fixture();
  await db.exec(`INSERT INTO river_sections (river_id, section_slug, name, sort_order, river_mile_start, river_mile_end, primary_gauge_station_id)
    SELECT r.id, 'someone-elses', 'x', 9, 100, 110, g.id FROM rivers r, gauge_stations g WHERE g.usgs_site_id = '${EUREKA}'`);
  await unchanged(db, /overlaps one that already names a gauge/);
  // Applied twice.
  db = await fixture();
  await db.exec(migration);
  await unchanged(db, /a stretch already exists/);
});

test('a database without the Meramec is left alone', async () => {
  const db = await fixture({ meramec: false });
  await db.exec(migration);
  assert.equal(await sections(db), 0);
});
