import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { deriveFloatSummaryFindings } from '../src/lib/trust/checks/float-summary';
import { classifyReading } from '../shared/condition-ladder';

// Two rivers had a main gauge that sits above the spring that carries the
// float: the Jacks Fork at Alley Spring and the Niangua at Windyville. Three
// migrations move the put-ins below each spring, and the river's headline, to
// the gauge below it. Each promises which put-ins change gauge and that no
// other does. These tests run the real files against a fixture built from
// production's rows on 2026-11-17 and check those promises, and that each
// file refuses to apply when they would not hold.

const read = (name: string) => readFileSync(`supabase/migrations/${name}`, 'utf8');
const jacksForkStretch = read('20261117221408_jacks_fork_below_alley_spring_reads_eminence.sql');
const jacksForkMain = read('20261117225734_eminence_is_the_jacks_fork_main_gauge.sql');
const niangua = read('20261117230200_niangua_below_bennett_spring_reads_tunnel_dam.sql');

const ALLEY = '07065495';
const EMINENCE = '07066000';
const WINDYVILLE = '06923250';
const TUNNEL_DAM = '06923950';

/** name, stored mile, mile on the river line, approved */
type PutIn = [string, number, number, boolean?];

const JACKS_FORK_PUT_INS: PutIn[] = [
  ['MDC South Prong Access', 0.1, 0.1], ['Buck Hollow', 6.8, 6.8], ['Salvation Army Camp', 9.2, 9.2],
  ['Blue Spring', 9.6, 9.6], ['Bachers', 10.9, 10.9], ['Rymers Access', 16.2, 16.2],
  ['Bee Bluff Access', 23.47, 23.47], ['Bay Creek', 25.2, 25.25], ['Alley Spring', 31.0, 30.76],
  ['Circle B Campground & Resort', 36.66, 36.66], ['Eminence City Access', 37.3, 37.33],
  ['Shawnee Creek', 41.9, 42.41], ['Two Rivers', 44.3, 44.84],
];

const NIANGUA_PUT_INS: PutIn[] = [
  ['Charity Access', 0.1, 7.15, false], ['Big John Access', 1.3, 26.27], ['Williams Ford Access', 12.2, 37.21],
  ['Moon  Valley', 22.3, 47.13], ['Cat Hollow', 26.5, 51.32], ['Riverfront Campground & Canoe', 28.8, 53.6],
  ['Bennett Spring Access', 30.2, 55.01], ['Hidden Valley Outfitters', 30.5, 55.11], ['Niangua River Oasis', 33.0, 58.1],
  ['Barclay Conservation Area Access', 36.5, 61.46], ['Big Bear River Resort', 37.5, 62.71],
  ['Maggard Canoe & Corkery Campground', 37.8, 63.02], ['Prosperine Access', 40.0, 66.07],
  ['Mountain Creek Family Resort', 40.1, 66.28], ['Lead Mine Access', 53.7, 79.07], ['Herrick Ford', 54.3, 80.15],
  ['Berry Bluff Access', 56.1, 82.82], ['Tunnel Dam Boat Launch', 66.0, 92.02], ['Whistle Bridge', 68.0, 94.03],
  ["Mother Nature's Riverfront Retreat", 70.0, 95.57], ['Ha Ha Tonka State Park', 79.5, 106.88],
];

const ALLEY_SUMMARY =
  "At the Alley Spring gauge (primary), 159–637 cfs is the ideal range on the Jacks Fork. Around 100 cfs it's low and you'll drag with gear.";

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE rivers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text UNIQUE NOT NULL, float_summary text);
    CREATE TABLE gauge_stations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), usgs_site_id text UNIQUE, active boolean NOT NULL DEFAULT true);
    CREATE TABLE river_gauges (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), river_id uuid REFERENCES rivers,
      gauge_station_id uuid REFERENCES gauge_stations, is_primary boolean NOT NULL DEFAULT false, threshold_unit text,
      level_too_low numeric, level_low numeric, level_optimal_min numeric, level_optimal_max numeric, level_high numeric,
      level_dangerous numeric, alt_level_too_low numeric, alt_level_low numeric, alt_level_optimal_min numeric,
      alt_level_optimal_max numeric, alt_level_high numeric, alt_level_dangerous numeric, flood_stage_ft numeric,
      threshold_source text, threshold_source_url text, threshold_updated_at timestamptz,
      river_mile numeric, last_condition_code text, pending_condition_code text, pending_count int NOT NULL DEFAULT 0,
      pending_first_at timestamptz, pending_reading_at timestamptz, UNIQUE (river_id, gauge_station_id));
    CREATE UNIQUE INDEX river_gauges_one_primary_per_river ON river_gauges (river_id) WHERE is_primary;
    CREATE TABLE river_sections (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), river_id uuid REFERENCES rivers,
      section_slug text NOT NULL, name text NOT NULL, description text, sort_order int NOT NULL,
      river_mile_start numeric, river_mile_end numeric, primary_gauge_station_id uuid REFERENCES gauge_stations,
      UNIQUE (river_id, section_slug));
    CREATE TABLE access_points (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), river_id uuid REFERENCES rivers,
      name text, river_mile_downstream numeric, approved boolean NOT NULL DEFAULT true);

    -- The gauge-selection half of production's get_river_condition_segment
    -- (20261117014151): a stretch's own gauge, then the nearest gauge at or
    -- above the put-in, then the nearest below, then the main gauge.
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

  const river = async (slug: string, summary: string | null, putIns: PutIn[]) => {
    await db.query('INSERT INTO rivers (slug, float_summary) VALUES ($1, $2)', [slug, summary]);
    for (const [name, stored, , approved = true] of putIns) {
      await db.query(
        'INSERT INTO access_points (river_id, name, river_mile_downstream, approved) SELECT id, $2, $3, $4 FROM rivers WHERE slug = $1',
        [slug, name, stored, approved],
      );
    }
  };
  const gauge = async (slug: string, site: string, primary: boolean, mile: number | null, stamp: string | null) => {
    await db.query('INSERT INTO gauge_stations (usgs_site_id) VALUES ($1)', [site]);
    await db.query(
      `INSERT INTO river_gauges (river_id, gauge_station_id, is_primary, threshold_unit, level_too_low, level_low,
         level_optimal_min, level_optimal_max, level_dangerous, river_mile, last_condition_code, pending_condition_code, pending_count)
       SELECT r.id, g.id, $3, 'cfs', 1, 2, 3, 4, 5, $4, $5, $5, 2 FROM rivers r, gauge_stations g WHERE r.slug = $1 AND g.usgs_site_id = $2`,
      [slug, site, primary, mile, stamp],
    );
  };

  await river('jacks-fork', ALLEY_SUMMARY, JACKS_FORK_PUT_INS);
  await gauge('jacks-fork', ALLEY, true, 8, 'too_low');
  await gauge('jacks-fork', EMINENCE, false, 40, null);
  await gauge('jacks-fork', '07065200', false, null, null);
  await river('niangua', null, NIANGUA_PUT_INS);
  await gauge('niangua', WINDYVILLE, true, null, 'low');
  await gauge('niangua', TUNNEL_DAM, false, null, 'low');
  // Production's two Niangua ladders on 2026-11-18, cfs then ft.
  await db.query(
    `UPDATE river_gauges rg SET level_too_low = 23, level_low = 95, level_optimal_min = 100, level_optimal_max = 400,
       level_high = 400, level_dangerous = 2000, alt_level_too_low = 0.86, alt_level_low = 1.42, alt_level_optimal_min = 1.45,
       alt_level_optimal_max = 2.51, alt_level_high = 2.52, alt_level_dangerous = 5.01, flood_stage_ft = 12,
       threshold_source = 'editorial'
     FROM gauge_stations g WHERE g.id = rg.gauge_station_id AND g.usgs_site_id = $1`,
    [WINDYVILLE],
  );
  await db.query(
    `UPDATE river_gauges rg SET level_too_low = 90, level_low = 142, level_optimal_min = 234, level_optimal_max = 441,
       level_high = 754, level_dangerous = 1508, alt_level_too_low = 1.5, alt_level_low = 2, alt_level_optimal_min = 2.5,
       alt_level_optimal_max = 5, alt_level_high = 7, alt_level_dangerous = 10, flood_stage_ft = 11,
       threshold_source = 'usgs'
     FROM gauge_stations g WHERE g.id = rg.gauge_station_id AND g.usgs_site_id = $1`,
    [TUNNEL_DAM],
  );
  return db;
}

async function gaugeAt(db: PGlite, slug: string, mile: number): Promise<string | undefined> {
  const result = await db.query<{ gauge_usgs_id: string }>(
    'SELECT c.gauge_usgs_id FROM rivers r, get_river_condition_segment(p_river_id => r.id, p_put_in_mile => $2) c WHERE r.slug = $1',
    [slug, mile],
  );
  return result.rows[0]?.gauge_usgs_id;
}

const LADDER_COLUMNS = `rg.level_too_low, rg.level_low, rg.level_optimal_min, rg.level_optimal_max, rg.level_high,
  rg.level_dangerous, rg.alt_level_too_low, rg.alt_level_low, rg.alt_level_optimal_min, rg.alt_level_optimal_max,
  rg.alt_level_high, rg.alt_level_dangerous, rg.flood_stage_ft, rg.threshold_source, rg.threshold_source_url`;

/** A gauge's ladder as numbers, cfs rungs then ft rungs, in ladder order. */
async function ladder(db: PGlite, site: string) {
  const row = (await db.query<Record<string, string | null>>(
    `SELECT ${LADDER_COLUMNS} FROM river_gauges rg JOIN gauge_stations g ON g.id = rg.gauge_station_id WHERE g.usgs_site_id = $1`,
    [site],
  )).rows[0];
  const rungs = (prefix: string) =>
    ['too_low', 'low', 'optimal_min', 'optimal_max', 'high', 'dangerous'].map((rung) => Number(row[`${prefix}${rung}`]));
  return {
    cfs: rungs('level_'),
    ft: rungs('alt_level_'),
    floodStageFt: Number(row.flood_stage_ft),
    source: row.threshold_source,
    sourceUrl: row.threshold_source_url,
  };
}

async function mainGauge(db: PGlite, slug: string) {
  return (await db.query<{ site: string; last: string | null; pending: string | null; count: number }>(
    `SELECT g.usgs_site_id AS site, rg.last_condition_code AS last, rg.pending_condition_code AS pending, rg.pending_count AS count
     FROM river_gauges rg JOIN rivers r ON r.id = rg.river_id JOIN gauge_stations g ON g.id = rg.gauge_station_id
     WHERE r.slug = $1 AND rg.is_primary`,
    [slug],
  )).rows;
}

const stretchCount = async (db: PGlite) =>
  Number((await db.query<{ n: string }>('SELECT count(*) AS n FROM river_sections')).rows[0].n);

test('before either migration, the put-ins below Alley Spring are graded from above it', async () => {
  const db = await fixture();
  for (const name of ['Alley Spring', 'Circle B Campground & Resort', 'Eminence City Access']) {
    const [, mile] = JACKS_FORK_PUT_INS.find((p) => p[0] === name)!;
    assert.equal(await gaugeAt(db, 'jacks-fork', mile), ALLEY, name);
  }
});

test('the Jacks Fork stretch moves exactly the three put-ins between the spring and the Eminence gauge', async () => {
  const db = await fixture();
  await db.exec(jacksForkStretch);

  for (const [name, stored, line] of JACKS_FORK_PUT_INS) {
    const expected = stored >= 30.5 ? EMINENCE : ALLEY;
    assert.equal(await gaugeAt(db, 'jacks-fork', stored), expected, `${name} by stored mile`);
    // A map-point caller resolves a line mile and meets the same stretch.
    assert.equal(line >= 30.5, stored >= 30.5, `${name} sits on the same side of the start on both scales`);
  }
  // The main gauge is untouched by this file.
  assert.deepEqual((await mainGauge(db, 'jacks-fork')).map((g) => g.site), [ALLEY]);
});

test('the Jacks Fork stretch refuses when the river already has stretches', async () => {
  const db = await fixture();
  await db.exec(jacksForkStretch);
  await assert.rejects(db.exec(jacksForkStretch), /already has stretches/);
  assert.equal(await stretchCount(db), 1);
});

test('the Jacks Fork stretch refuses, and adds nothing, when a different set of put-ins would move', async () => {
  const db = await fixture();
  await db.query(
    `INSERT INTO access_points (river_id, name, river_mile_downstream) SELECT id, 'A new access', 33 FROM rivers WHERE slug = 'jacks-fork'`,
  );
  await assert.rejects(db.exec(jacksForkStretch), /4 put-ins moved to Eminence, expected 3/);
  assert.equal(await stretchCount(db), 0);
});

test('the main-gauge switch waits for the stretch', async () => {
  const db = await fixture();
  await assert.rejects(db.exec(jacksForkMain), /apply 20261117221408 first/);
  assert.deepEqual((await mainGauge(db, 'jacks-fork')).map((g) => g.site), [ALLEY]);
});

test('Eminence becomes the main gauge, no put-in moves, and no stale stamp is left to fire an alert', async () => {
  const db = await fixture();
  await db.exec(jacksForkStretch);
  const before = await Promise.all(JACKS_FORK_PUT_INS.map(([, mile]) => gaugeAt(db, 'jacks-fork', mile)));
  await db.exec(jacksForkMain);

  assert.deepEqual(await mainGauge(db, 'jacks-fork'), [{ site: EMINENCE, last: null, pending: null, count: 0 }]);
  const old = await db.query<{ last: string | null; primary: boolean }>(
    `SELECT rg.last_condition_code AS last, rg.is_primary AS primary FROM river_gauges rg
     JOIN gauge_stations g ON g.id = rg.gauge_station_id WHERE g.usgs_site_id = $1`,
    [ALLEY],
  );
  assert.deepEqual(old.rows, [{ last: null, primary: false }]);
  assert.deepEqual(await Promise.all(JACKS_FORK_PUT_INS.map(([, mile]) => gaugeAt(db, 'jacks-fork', mile))), before);
});

test('the rewritten float summary agrees with the Eminence ladder', async () => {
  const db = await fixture();
  await db.exec(jacksForkStretch);
  await db.exec(jacksForkMain);
  const summary = (await db.query<{ float_summary: string }>(`SELECT float_summary FROM rivers WHERE slug = 'jacks-fork'`)).rows[0].float_summary;

  assert.match(summary, /^At the Eminence gauge \(primary\)/);
  // The ladder production holds for 07066000: 100 / 200 / 313-900 / 900 / 1700 cfs.
  for (const line of ['313–900 cfs', '200 cfs', '~100 cfs', '1,700 cfs']) assert.ok(summary.includes(line), line);
  assert.deepEqual(
    deriveFloatSummaryFindings([{
      riverSlug: 'jacks-fork', floatSummary: summary, thresholdUnit: 'cfs', levelDangerous: 1700,
      primaryGaugeName: 'Jacks Fork at Eminence, MO',
    }]),
    [],
  );
});

test('the main-gauge switch refuses to overwrite a float summary somebody rewrote', async () => {
  const db = await fixture();
  await db.exec(jacksForkStretch);
  await db.query(`UPDATE rivers SET float_summary = 'Edited by hand.' WHERE slug = 'jacks-fork'`);
  await assert.rejects(db.exec(jacksForkMain), /rewrite it by hand/);
  assert.deepEqual((await mainGauge(db, 'jacks-fork')).map((g) => g.site), [ALLEY]);
});

test('the Niangua splits at Bennett Spring for stored miles, with Tunnel Dam as the main gauge', async () => {
  const db = await fixture();
  await db.exec(niangua);

  assert.deepEqual(await mainGauge(db, 'niangua'), [{ site: TUNNEL_DAM, last: null, pending: null, count: 0 }]);
  for (const [name, stored] of NIANGUA_PUT_INS) {
    assert.equal(await gaugeAt(db, 'niangua', stored), stored < 30 ? WINDYVILLE : TUNNEL_DAM, `${name} by stored mile`);
  }
});

test('the Niangua stretches are also right for a mile read off the river line', async () => {
  const db = await fixture();
  await db.exec(niangua);
  const claimedBy = async (mile: number) => (await db.query<{ site: string }>(
    `SELECT g.usgs_site_id AS site FROM river_sections s JOIN gauge_stations g ON g.id = s.primary_gauge_station_id
     WHERE (s.river_mile_start IS NULL OR $1 >= s.river_mile_start) AND (s.river_mile_end IS NULL OR $1 < s.river_mile_end)
     ORDER BY s.sort_order LIMIT 1`,
    [mile],
  )).rows[0]?.site ?? null;

  for (const [name, stored, line] of NIANGUA_PUT_INS) {
    const aboveSpring = stored < 30;
    const claimed = await claimedBy(line);
    // Below the spring a stretch must claim it. Above the spring either the
    // upper stretch claims it or none does, which leaves a map-point caller to
    // the nearest gauge by distance: Windyville for these four on 2026-11-17.
    if (aboveSpring) assert.ok(claimed === WINDYVILLE || claimed === null, `${name} at line mile ${line}`);
    else assert.equal(claimed, TUNNEL_DAM, `${name} at line mile ${line}`);
  }
});

test('Tunnel Dam reads Dangerous at the NWS action flow and High above the provisional line', async () => {
  const db = await fixture();
  const windyvilleBefore = await ladder(db, WINDYVILLE);
  await db.exec(niangua);

  const after = await ladder(db, TUNNEL_DAM);
  // too low, low, flowing from, flowing to, high, dangerous. NWS publishes
  // 7,900 cfs for TUDM7's 10 ft action stage; 750 is the owner's provisional High.
  assert.deepEqual(after.cfs, [90, 142, 234, 750, 750, 7900]);
  // The same rungs in feet, off USGS rating 9.2.
  assert.deepEqual(after.ft, [0.86, 1.13, 1.45, 2.43, 2.43, 9.12]);
  assert.equal(after.source, 'editorial');
  assert.equal(after.sourceUrl, 'https://water.noaa.gov/gauges/tudm7');
  assert.deepEqual(await ladder(db, WINDYVILLE), windyvilleBefore);

  const [levelTooLow, levelLow, levelOptimalMin, levelOptimalMax, levelHigh, levelDangerous] = after.cfs;
  const grade = (cfs: number, ft: number | null = null) =>
    classifyReading(ft, {
      levelTooLow, levelLow, levelOptimalMin, levelOptimalMax, levelHigh, levelDangerous,
      thresholdUnit: 'cfs', floodStageFt: after.floodStageFt,
    }, cfs);
  assert.equal(grade(750), 'flowing');
  assert.equal(grade(751), 'high');
  // 1,508 cfs was the old danger line.
  assert.equal(grade(1508), 'high');
  assert.equal(grade(7899), 'high');
  assert.equal(grade(7900), 'dangerous');
  // NWS flood stage still wins by stage when the flow line has not tripped.
  assert.equal(grade(7000, 11), 'dangerous');
});

test('the Niangua migration refuses, and changes nothing, when the Tunnel Dam ladder was edited since', async () => {
  const db = await fixture();
  await db.query(
    `UPDATE river_gauges rg SET level_dangerous = 3000 FROM gauge_stations g
     WHERE g.id = rg.gauge_station_id AND g.usgs_site_id = $1`,
    [TUNNEL_DAM],
  );
  const before = await ladder(db, TUNNEL_DAM);
  await assert.rejects(db.exec(niangua), /ladder is not the one this was written against/);
  assert.deepEqual(await ladder(db, TUNNEL_DAM), before);
  assert.equal(await stretchCount(db), 0);
  assert.deepEqual((await mainGauge(db, 'niangua')).map((g) => g.site), [WINDYVILLE]);
});

test('the Niangua migration refuses, and changes nothing, when a different set of put-ins would move', async () => {
  const db = await fixture();
  await db.query(`UPDATE access_points SET approved = true WHERE name = 'Charity Access'`);
  await db.query(
    `INSERT INTO access_points (river_id, name, river_mile_downstream) SELECT id, 'A new access', 45 FROM rivers WHERE slug = 'niangua'`,
  );
  await assert.rejects(db.exec(niangua), /16 put-ins moved to Tunnel Dam, expected 15/);
  assert.equal(await stretchCount(db), 0);
  assert.deepEqual((await mainGauge(db, 'niangua')).map((g) => g.site), [WINDYVILLE]);
});

test('a database without these rivers is left alone', async () => {
  const db = await fixture();
  await db.exec('DELETE FROM access_points; DELETE FROM river_gauges; DELETE FROM rivers;');
  for (const migration of [jacksForkStretch, jacksForkMain, niangua]) await db.exec(migration);
  assert.equal(await stretchCount(db), 0);
});
