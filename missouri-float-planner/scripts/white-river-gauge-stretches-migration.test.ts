import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { classifyReading } from '../shared/condition-ladder';

// Every White River put-in read the Bull Shoals Dam release, 0.2 miles below
// the dam, because none of the river's gauge links carried a mile and it had
// no stretches. The migration adds three stretches and the three gauge miles.
// These tests run the real file against production's put-ins and gauges as
// read on 2026-11-20, and check both paths that choose a gauge.

const migration = readFileSync('supabase/migrations/20261120170000_white_river_put_ins_read_the_gauge_near_them.sql', 'utf8');

const DAM = 'swl-bull-shoals-dam', NORFORK = '07057370', CALICO = '07060500', NORFORK_DAM = 'swl-norfork-dam';

/** name, mile (stored and planner miles are the same on the White), nearest gauge by distance, gauge after on both paths */
const PUT_INS: [name: string, mile: number, nearest: string, after: string][] = [
  ['Jim Griffin Access', 0.54, DAM, DAM], ['Forrest and Nina Wood Rivercliff Access', 0.76, DAM, DAM],
  ['Bull Shoals-White River State Park Ramp', 1.5, DAM, DAM], ["Gaston's Access", 4.39, DAM, DAM],
  ['White Hole Access', 7.28, DAM, DAM], ['Bronie Yurkonis Walk-In Access (The Narrows)', 9.43, DAM, DAM],
  ['Wildcat Shoals Access', 11.01, DAM, DAM], ['Cotter Access (Big Spring Park)', 17.12, DAM, DAM],
  ['Armstrong Hole Walk-In Access', 17.67, DAM, DAM], ['Roundhouse Shoals Walk-In Access', 18.34, DAM, DAM],
  ['Rim Shoals Access', 21.85, DAM, DAM],
  ['Ranchette Access', 26.88, NORFORK, NORFORK], ['Buffalo City Access', 30.65, NORFORK, NORFORK],
  ['Cartney Access', 35.06, NORFORK, NORFORK], ["Shipp's Ferry Access", 37.02, NORFORK, NORFORK],
  // Below the North Fork (mile 43.12) the gauge near Norfork is the nearer one but has not met Norfork Dam's water.
  ['Norfork Access', 43.12, NORFORK, CALICO], ["Red's Landing Access", 50.84, NORFORK, CALICO],
  ['Sneed Creek Access', 52.5, CALICO, CALICO], ['Chesmond Ferry Access', 57.43, CALICO, CALICO],
  ['Calico Rock City Park Access', 60.73, CALICO, CALICO], ['Boswell Shoals Access', 68.48, CALICO, CALICO],
  ['Mount Olive Access', 73.04, CALICO, CALICO], ['Sylamore Ferry Access', 77.58, CALICO, CALICO],
  ['Round Bottom Access', 82.16, CALICO, CALICO], ['Guion Access (Izard County)', 90.46, CALICO, CALICO],
  ['Guion Access (Stone County)', 90.46, CALICO, CALICO],
];

async function fixture({ white = true } = {}) {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE rivers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text UNIQUE NOT NULL);
    CREATE TABLE gauge_stations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider text NOT NULL, site_id_external text NOT NULL,
      usgs_site_id text, name text NOT NULL, active boolean NOT NULL DEFAULT true, UNIQUE (provider, site_id_external));
    CREATE TABLE river_gauges (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), river_id uuid REFERENCES rivers,
      gauge_station_id uuid REFERENCES gauge_stations, is_primary boolean NOT NULL DEFAULT false, role text, threshold_unit text DEFAULT 'cfs',
      level_too_low numeric, level_low numeric, level_optimal_min numeric, level_optimal_max numeric, level_high numeric,
      level_dangerous numeric, river_mile numeric, UNIQUE (river_id, gauge_station_id));
    CREATE TABLE river_sections (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), river_id uuid REFERENCES rivers,
      section_slug text NOT NULL, name text NOT NULL, description text, sort_order int NOT NULL, river_type text,
      river_mile_start numeric, river_mile_end numeric, primary_gauge_station_id uuid REFERENCES gauge_stations,
      UNIQUE (river_id, section_slug));
    CREATE TABLE access_points (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), river_id uuid REFERENCES rivers, name text,
      river_mile_downstream numeric, nearest_site text, approved boolean NOT NULL DEFAULT true);

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
  if (!white) return db;
  await db.exec(`
    INSERT INTO rivers (slug) VALUES ('white');
    INSERT INTO gauge_stations (provider, site_id_external, usgs_site_id, name) VALUES
      ('usace', '${DAM}', NULL, 'White River below Bull Shoals Dam'),
      ('usgs', '${NORFORK}', '${NORFORK}', 'White River near Norfork, AR'),
      ('usgs', '${CALICO}', '${CALICO}', 'White River at Calico Rock, AR'),
      ('usace', '${NORFORK_DAM}', NULL, 'North Fork River below Norfork Dam');
    INSERT INTO river_gauges (river_id, gauge_station_id, is_primary, role)
      SELECT r.id, g.id, g.site_id_external = '${DAM}',
        CASE g.site_id_external WHEN '${DAM}' THEN 'release' WHEN '${NORFORK_DAM}' THEN 'tributary' ELSE 'downstream' END
      FROM rivers r, gauge_stations g WHERE r.slug = 'white';`);
  for (const [name, mile, nearest] of PUT_INS) {
    await db.query(`INSERT INTO access_points (river_id, name, river_mile_downstream, nearest_site)
      SELECT id, $1, $2, $3 FROM rivers WHERE slug = 'white'`, [name, mile, nearest]);
  }
  return db;
}

/** Each put-in's gauge by stored mile (the planner and the access page) and by map point alone. */
async function gauges(db: PGlite) {
  const { rows } = await db.query<{ name: string; stored: string; point: string }>(`
    SELECT ap.name,
      (SELECT g.site_id_external FROM get_river_condition_segment(p_river_id => r.id, p_put_in_mile => ap.river_mile_downstream) c
        JOIN gauge_stations g ON g.name = c.gauge_name) AS stored,
      -- By map point: a stretch that holds the mile, else the nearest gauge by distance.
      COALESCE((SELECT g.site_id_external FROM river_sections rs JOIN gauge_stations g ON g.id = rs.primary_gauge_station_id
        WHERE rs.river_id = r.id AND ap.river_mile_downstream >= rs.river_mile_start AND ap.river_mile_downstream < rs.river_mile_end
        ORDER BY rs.sort_order LIMIT 1), ap.nearest_site) AS point
    FROM access_points ap JOIN rivers r ON r.id = ap.river_id ORDER BY ap.river_mile_downstream, ap.name`);
  return rows;
}
const sections = async (db: PGlite) => (await db.query<{ n: number }>('SELECT count(*)::int AS n FROM river_sections')).rows[0].n;
const miles = async (db: PGlite) => Object.fromEntries((await db.query<{ site: string; mile: string | null }>(`
  SELECT g.site_id_external AS site, rg.river_mile AS mile FROM river_gauges rg JOIN gauge_stations g ON g.id = rg.gauge_station_id`))
  .rows.map(row => [row.site, row.mile === null ? null : Number(row.mile)]));

test('before: every put-in reads the dam by stored mile, and 15 read another gauge by map point', async () => {
  const before = await gauges(await fixture());
  assert.equal(before.length, 26);
  assert.ok(before.every(row => row.stored === DAM));
  assert.equal(before.filter(row => row.stored !== row.point).length, 15);
});

test('after: every put-in reads the gauge on its own stretch, on both paths', async () => {
  const db = await fixture();
  await db.exec(migration);
  const after = await gauges(db);
  assert.deepEqual(after, PUT_INS.map(([name, , , gauge]) => ({ name, stored: gauge, point: gauge })));
  const count = (site: string) => after.filter(row => row.stored === site).length;
  assert.deepEqual([count(DAM), count(NORFORK), count(CALICO)], [11, 4, 11]);
});

test("Red's Landing to Calico Rock reads Calico Rock, not the dam or the gauge above the North Fork", async () => {
  const db = await fixture();
  await db.exec(migration);
  const after = await gauges(db);
  assert.equal(after.find(row => row.name === "Red's Landing Access")?.stored, CALICO);
  assert.equal(after.find(row => row.name === 'Norfork Access')?.stored, CALICO);
  assert.equal(after.find(row => row.name === "Shipp's Ferry Access")?.stored, NORFORK);
});

test('three stretches with both bounds, and a mile on the three gauges that are on this river', async () => {
  const db = await fixture();
  await db.exec(migration);
  const { rows } = await db.query<{ section_slug: string; lo: string; hi: string; site: string; sort_order: number; river_type: string | null }>(`
    SELECT s.section_slug, s.river_mile_start AS lo, s.river_mile_end AS hi, g.site_id_external AS site, s.sort_order, s.river_type
    FROM river_sections s JOIN gauge_stations g ON g.id = s.primary_gauge_station_id ORDER BY s.sort_order`);
  assert.deepEqual(rows.map(row => `${row.section_slug} [${Number(row.lo)}, ${Number(row.hi)}) ${row.site} #${row.sort_order}`), [
    `bull-shoals-dam-to-crooked-creek [0, 24) ${DAM} #0`,
    `crooked-creek-to-the-north-fork [24, 43) ${NORFORK} #1`,
    `below-the-north-fork [43, 95) ${CALICO} #2`,
  ]);
  // The stretches are the river's own tailwater: no reach declares a different hydrology.
  assert.ok(rows.every(row => row.river_type === null));
  // Each gauge sits inside the stretch that names it; Norfork Dam is on another river and gets no mile.
  assert.deepEqual(await miles(db), { [DAM]: 0.2, [NORFORK]: 42, [CALICO]: 60.7, [NORFORK_DAM]: null });
});

test('the gauge miles put Calico Rock and the Norfork gauge inside the floats that pass them', async () => {
  const db = await fixture();
  await db.exec(migration);
  const gaugeMiles = await miles(db);
  const mile = (name: string) => PUT_INS.find(([n]) => n === name)![1];
  // estimateRoute checks links whose mile is within [put-in, take-out].
  const inFloat = (site: string, from: string, to: string) => gaugeMiles[site]! >= mile(from) && gaugeMiles[site]! <= mile(to);
  assert.ok(inFloat(CALICO, "Shipp's Ferry Access", 'Calico Rock City Park Access'));
  assert.ok(inFloat(CALICO, "Red's Landing Access", 'Boswell Shoals Access'));
  assert.ok(inFloat(NORFORK, 'Rim Shoals Access', 'Norfork Access'));
  assert.ok(!inFloat(DAM, 'Jim Griffin Access', 'Guion Access (Izard County)'));
});

test('no float levels are set: the gauges stay unrated, Dangerous only at flood stage', async () => {
  assert.doesNotMatch(migration.replace(/^--.*$/gm, ''), /level_/);
  const db = await fixture();
  await db.exec(migration);
  const { rows } = await db.query<Record<string, string | null>>(`SELECT level_too_low, level_low, level_optimal_min, level_optimal_max, level_high, level_dangerous FROM river_gauges`);
  assert.ok(rows.every(row => Object.values(row).every(value => value === null)));
  // Calico Rock's NWS flood stage is 19 ft (20261117014151); it read 4.02 ft and 5,000 cfs on 2026-11-20.
  const calico = { levelTooLow: null, levelLow: null, levelOptimalMin: null, levelOptimalMax: null, levelHigh: null, levelDangerous: null,
    thresholdUnit: 'cfs' as const, floodStageFt: 19 };
  assert.equal(classifyReading(4.02, calico, 5000), 'unknown');
  assert.equal(classifyReading(19, calico, 90000), 'dangerous');
});

test('it refuses, and changes nothing, when production is not as it was reviewed', async () => {
  const unchanged = async (db: PGlite, message: RegExp) => {
    const before = [await gauges(db), await sections(db), await miles(db)];
    await assert.rejects(db.exec(migration), message);
    assert.deepEqual([await gauges(db), await sections(db), await miles(db)], before);
  };
  // A put-in approved since the review would move without anyone having looked at it.
  let db = await fixture();
  await db.exec(`INSERT INTO access_points (river_id, name, river_mile_downstream, nearest_site) SELECT id, 'New ramp', 47, '${NORFORK}' FROM rivers`);
  await unchanged(db, /07060500 took 12, expected 11/);
  // A put-in past the last stretch would fall back to position.
  db = await fixture();
  await db.exec(`INSERT INTO access_points (river_id, name, river_mile_downstream, nearest_site) SELECT id, 'Far ramp', 97, '${CALICO}' FROM rivers`);
  await unchanged(db, /does not read the gauge of its stretch: Far ramp/);
  // A gauge it names was retired.
  db = await fixture();
  await db.exec(`UPDATE gauge_stations SET active = false WHERE site_id_external = '${NORFORK}'`);
  await unchanged(db, /not linked to the river and active: 07057370/);
  // Someone gave a gauge a mile in the meantime.
  db = await fixture();
  await db.exec(`UPDATE river_gauges rg SET river_mile = 60 FROM gauge_stations g WHERE g.id = rg.gauge_station_id AND g.site_id_external = '${CALICO}'`);
  await unchanged(db, /already carries a mile/);
  // A stretch that already names a gauge covers the same miles.
  db = await fixture();
  await db.exec(`INSERT INTO river_sections (river_id, section_slug, name, sort_order, river_mile_start, river_mile_end, primary_gauge_station_id)
    SELECT r.id, 'someone-elses', 'x', 9, 40, 50, g.id FROM rivers r, gauge_stations g WHERE g.site_id_external = '${CALICO}'`);
  await unchanged(db, /overlaps one that already names a gauge/);
  // Applied twice.
  db = await fixture();
  await db.exec(migration);
  await unchanged(db, /a stretch already exists/);
});

test('a database without the White River is left alone', async () => {
  const db = await fixture({ white: false });
  await db.exec(migration);
  assert.equal(await sections(db), 0);
});
