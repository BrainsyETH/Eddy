// A gauge's official flood stage has ONE resolution: the station's NWS value
// first, then the river_gauges pairing's (src/lib/gauges/flood-stages.ts).
//
// The safety row and the chart always resolved it that way. Condition logic
// read the pairing alone, so a station carrying a stage its pairing lacked
// (Calico Rock and Rich Fountain, 2026-11) drew a flood line on the page while
// verdicts, alerts and Reads could not see it. These tests hold the readers,
// the four database functions and the backfill to the same answer.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { gradeReading } from '@/lib/conditions';
import { linkFloodStageFt, resolveFloodStages } from './flood-stages';

const MIGRATIONS = 'supabase/migrations';
const UNRATED = {
  level_too_low: null, level_low: null, level_optimal_min: null,
  level_optimal_max: null, level_high: null, level_dangerous: null, threshold_unit: 'cfs',
};

// ── The resolver ────────────────────────────────────────────────────────────

test('a station-only flood stage resolves, in either embed shape PostgREST returns', () => {
  const station = { nwps_flood_stage_ft: '19.00' };
  assert.equal(linkFloodStageFt({ flood_stage_ft: null, gauge_stations: station }), 19);
  assert.equal(linkFloodStageFt({ flood_stage_ft: null, gauge_stations: [station] }), 19);
});

test('the pairing answers when the station has none, and a row without the embed still resolves', () => {
  assert.equal(linkFloodStageFt({ flood_stage_ft: '15.00', gauge_stations: { nwps_flood_stage_ft: null } }), 15);
  assert.equal(linkFloodStageFt({ flood_stage_ft: 15, gauge_stations: [] }), 15);
  assert.equal(linkFloodStageFt({ flood_stage_ft: 15 }), 15);
});

test('station first when both exist; zero and missing are absent', () => {
  assert.equal(linkFloodStageFt({ flood_stage_ft: 12, gauge_stations: { nwps_flood_stage_ft: 10 } }), 10);
  assert.equal(linkFloodStageFt({ flood_stage_ft: 12, gauge_stations: { nwps_flood_stage_ft: 0 } }), 12);
  assert.equal(linkFloodStageFt({ flood_stage_ft: 0, gauge_stations: null }), null);
  assert.equal(linkFloodStageFt({ flood_stage_ft: null, gauge_stations: null }), null);
  assert.equal(linkFloodStageFt(null), null);
});

test('condition logic and the safety display resolve the same stage', () => {
  const cases = [
    { station: { nwps_flood_stage_ft: 19, nwps_action_stage_ft: 16 }, link: { flood_stage_ft: null } },
    { station: { nwps_flood_stage_ft: null }, link: { flood_stage_ft: 15, action_stage_ft: 13 } },
    { station: { nwps_flood_stage_ft: 10 }, link: { flood_stage_ft: 12 } },
    { station: null, link: { flood_stage_ft: null } },
  ];
  for (const { station, link } of cases) {
    assert.equal(
      linkFloodStageFt({ ...link, gauge_stations: station }),
      resolveFloodStages(station, link)?.floodFt ?? null,
    );
  }
});

test('an unrated gauge above a station-only flood stage grades dangerous, and unknown below it', () => {
  // White at Calico Rock: no ladder, 19 ft on the station, nothing on the pairing.
  const row = { ...UNRATED, flood_stage_ft: null, gauge_stations: { nwps_flood_stage_ft: 19 } };
  assert.equal(gradeReading(row, 20.1, 60000).code, 'dangerous');
  assert.equal(gradeReading(row, 8, 9000).code, 'unknown');
});

test('a ladder with no upper levels cannot call a flood "good"', () => {
  // James near Boaz at June 2026's peak. NWS flood stage is 10 ft.
  const boaz = { ...UNRATED, level_too_low: 80, level_optimal_min: 150 };
  assert.equal(gradeReading({ ...boaz, flood_stage_ft: null }, 14.58, 16600).code, 'good');
  assert.equal(gradeReading({ ...boaz, flood_stage_ft: 10 }, 14.58, 16600).code, 'dangerous');
  assert.equal(
    gradeReading({ ...boaz, flood_stage_ft: null, gauge_stations: [{ nwps_flood_stage_ft: 10 }] }, 14.58, 16600).code,
    'dangerous',
  );
});

// ── Every reader goes through it (ratchet) ──────────────────────────────────

/**
 * Files that read `flood_stage_ft` from get_mo_surface_water_dataset's JSON,
 * where the function has already resolved it (pinned below), or that only name
 * the column in prose or a fixture. Nothing here queries river_gauges.
 */
const READS_RESOLVED_OUTPUT = new Set([
  'src/app/api/usgs/mo-statewide/route.ts',
  'src/components/mo-surface-water/MOSurfaceWaterApp.tsx',
  'src/components/mo-surface-water/chrome/rail.tsx',
  'src/components/mo-surface-water/chrome/shared.tsx',
  'src/components/mo-surface-water/derive.ts',
  'src/lib/calculations/route-estimate-fixture.ts',
  'src/lib/national-map/rated.ts',
  'src/lib/trust/remediation.ts',
  'src/lib/usgs/mo-statewide-data.ts',
]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

test('no reader takes the pairing flood stage without the station stage (ratchet)', () => {
  const files = [...sourceFiles('src'), ...sourceFiles('shared')]
    .map((path) => relative('.', path).split('\\').join('/'))
    .filter((path) => path !== 'src/types/database.ts');
  const mentions = files.filter((path) => readFileSync(path, 'utf8').includes('flood_stage_ft'));

  // 1. A file that selects flood_stage_ft also selects the station column.
  const pairingOnly = mentions.filter(
    (path) => !READS_RESOLVED_OUTPUT.has(path) && !readFileSync(path, 'utf8').includes('nwps_flood_stage_ft'),
  );
  assert.deepEqual(pairingOnly, [],
    'Select gauge_stations(nwps_flood_stage_ft) with flood_stage_ft and resolve through linkFloodStageFt()');

  // 2. Nobody reads row.flood_stage_ft by hand; the resolver is the one reader.
  const byHand = mentions.filter(
    (path) =>
      path !== 'src/lib/gauges/flood-stages.ts' &&
      !READS_RESOLVED_OUTPUT.has(path) &&
      /[A-Za-z_)\]]\??\.flood_stage_ft\b/.test(readFileSync(path, 'utf8').replace(/river_gauges\.flood_stage_ft/g, '')),
  );
  assert.deepEqual(byHand, [], 'Resolve through linkFloodStageFt() or gradeReading(), not row.flood_stage_ft');

  const stale = [...READS_RESOLVED_OUTPUT].filter((path) => !mentions.includes(path));
  assert.deepEqual(stale, [], 'These no longer mention flood_stage_ft: remove them from READS_RESOLVED_OUTPUT');
});

// ── The database functions ──────────────────────────────────────────────────

const SQL_RESOLVER = 'coalesce(nullif(gs.nwps_flood_stage_ft, 0), nullif(rg.flood_stage_ft, 0))';
const FLOOD_FUNCTIONS = [
  'get_river_condition',
  'get_river_condition_segment',
  'get_river_conditions',
  'get_mo_surface_water_dataset',
] as const;

/** The newest CREATE FUNCTION statement for `fn`, so this follows it forward. */
function latestDefinition(fn: string): { file: string; statement: string; body: string } {
  const re = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\.)?${fn}\\s*\\(`, 'gi');
  let found: { file: string; statement: string; body: string } | null = null;
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
    for (const match of sql.matchAll(re)) {
      const start = match.index;
      const tag = /\$[A-Za-z_]*\$/.exec(sql.slice(start));
      assert.ok(tag, `${file}: ${fn} has no dollar-quoted body`);
      const bodyStart = start + tag.index + tag[0].length;
      const bodyEnd = sql.indexOf(tag[0], bodyStart);
      const end = sql.indexOf(';', bodyEnd) + 1;
      found = { file, statement: sql.slice(start, end), body: sql.slice(bodyStart, bodyEnd) };
    }
  }
  assert.ok(found, `no migration defines ${fn}`);
  return found;
}

test('each database function that reads a flood stage resolves it the same way', () => {
  for (const fn of FLOOD_FUNCTIONS) {
    const { file, body } = latestDefinition(fn);
    assert.ok(body.includes(SQL_RESOLVER), `${fn} in ${file} must resolve station first, then pairing`);
    assert.doesNotMatch(body.replace(SQL_RESOLVER, ''), /rg\.flood_stage_ft/,
      `${fn} in ${file} reads the pairing flood stage outside the resolver`);
  }
});

test('the functions migration changes one select-list entry per function and nothing else', () => {
  const file = readdirSync(MIGRATIONS).find((f) => f.endsWith('_flood_stage_resolves_station_first.sql'));
  assert.ok(file);
  const bases: Record<string, string> = {
    get_river_condition: '20260826162627_an_unrated_gauge_reads_unknown_not_too_low.sql',
    get_river_condition_segment: '20260826162627_an_unrated_gauge_reads_unknown_not_too_low.sql',
    get_river_conditions: '20260902131340_the_rivers_list_asks_once_not_once_per_river.sql',
    get_mo_surface_water_dataset: '00123_dataset_includes_access_point_images.sql',
  };
  const definitionIn = (name: string, fn: string) => {
    const sql = readFileSync(join(MIGRATIONS, name), 'utf8');
    const re = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\.)?${fn}\\s*\\(`, 'i');
    const start = re.exec(sql)!.index;
    const tag = /\$[A-Za-z_]*\$/.exec(sql.slice(start))!;
    const bodyStart = start + tag.index + tag[0].length;
    const bodyEnd = sql.indexOf(tag[0], bodyStart);
    return { head: sql.slice(start, bodyStart), body: sql.slice(bodyStart, bodyEnd), tail: sql.slice(bodyEnd, sql.indexOf(';', bodyEnd) + 1) };
  };
  // Undo the replacement; what is left must be the base definition, byte for byte.
  const undo = (body: string) =>
    body
      .replace(/-- Station NWS stage first, then the pairing's: resolveFloodStages\(\) in SQL\.\n\s*/, '')
      .replace(new RegExp(`${SQL_RESOLVER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} as flood_stage_ft,`, 'i'), 'rg.flood_stage_ft,')
      .replace(/CASE WHEN nullif\(gs\.nwps_flood_stage_ft, 0\) IS NOT NULL\n\s*THEN gs\.nwps_action_stage_ft ELSE rg\.action_stage_ft END AS action_stage_ft,/, 'rg.action_stage_ft,');
  for (const [fn, base] of Object.entries(bases)) {
    const before = definitionIn(base, fn);
    const after = definitionIn(file, fn);
    assert.equal(after.head, before.head, `${fn}: signature and attributes`);
    assert.equal(after.tail, before.tail, `${fn}: trailing attributes`);
    assert.equal(undo(after.body), before.body, `${fn}: body`);
  }
});

test('the condition functions flag a flood from a station-only stage (in-memory PostgreSQL)', async () => {
  const file = readdirSync(MIGRATIONS).find((f) => f.endsWith('_flood_stage_resolves_station_first.sql'));
  assert.ok(file);
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE public.gauge_stations (
        id uuid PRIMARY KEY, name text, usgs_site_id text, active boolean DEFAULT true,
        nwps_flood_stage_ft numeric, nwps_action_stage_ft numeric);
      CREATE TABLE public.river_gauges (
        river_id uuid, gauge_station_id uuid, is_primary boolean DEFAULT true,
        distance_from_section_miles numeric, accuracy_warning_threshold_miles numeric,
        threshold_unit text DEFAULT 'cfs',
        level_too_low numeric, level_low numeric, level_optimal_min numeric,
        level_optimal_max numeric, level_high numeric, level_dangerous numeric,
        flood_stage_ft numeric, action_stage_ft numeric);
      CREATE TABLE public.gauge_readings (
        gauge_station_id uuid, gauge_height_ft numeric, discharge_cfs numeric, reading_timestamp timestamptz);
    `);
    for (const fn of ['get_river_condition', 'get_river_conditions']) {
      const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
      const re = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fn}\\s*\\(`, 'i');
      const start = re.exec(sql)!.index;
      const tag = /\$[A-Za-z_]*\$/.exec(sql.slice(start))!;
      const bodyEnd = sql.indexOf(tag[0], start + tag.index + tag[0].length);
      await db.exec(sql.slice(start, sql.indexOf(';', bodyEnd) + 1));
    }
    const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
    // [n, station stage, pairing stage, stage read, expected code]. All unrated.
    const cases: Array<[number, number | null, number | null, number, string]> = [
      [1, 19, null, 20, 'dangerous'], // station only, above
      [2, 19, null, 18, 'unknown'],   // station only, below
      [3, null, 15, 16, 'dangerous'], // pairing only
      [4, 10, 12, 11, 'dangerous'],   // station first
      [5, 0, 12, 11, 'unknown'],      // a zero stage is absent
      [6, 0, 12, 13, 'dangerous'],
      [7, null, null, 40, 'unknown'], // no stage anywhere
    ];
    for (const [n, station, pairing, stage] of cases) {
      await db.query('INSERT INTO public.gauge_stations (id, name, usgs_site_id, nwps_flood_stage_ft) VALUES ($1, $2, $3, $4)',
        [id(n), `g${n}`, `0${n}`, station]);
      await db.query('INSERT INTO public.river_gauges (river_id, gauge_station_id, flood_stage_ft) VALUES ($1, $2, $3)',
        [id(100 + n), id(n), pairing]);
      await db.query(`INSERT INTO public.gauge_readings VALUES ($1, $2, 5000, now() - interval '10 minutes')`, [id(n), stage]);
    }
    const batch = await db.query<{ river_id: string; condition_code: string }>('SELECT river_id, condition_code FROM public.get_river_conditions()');
    const batched = new Map(batch.rows.map((row) => [row.river_id, row.condition_code]));
    for (const [n, station, pairing, stage, expected] of cases) {
      const single = await db.query<{ condition_code: string }>('SELECT condition_code FROM public.get_river_condition($1)', [id(100 + n)]);
      const label = `station ${station}, pairing ${pairing}, reading ${stage} ft`;
      assert.equal(single.rows[0]?.condition_code, expected, label);
      assert.equal(batched.get(id(100 + n)), expected, `batched: ${label}`);
      // The TypeScript readers reach the same verdict from the same row.
      assert.equal(
        gradeReading({ ...UNRATED, flood_stage_ft: pairing, gauge_stations: { nwps_flood_stage_ft: station } }, stage, 5000).code,
        expected, `gradeReading: ${label}`);
    }
  } finally {
    await db.close();
  }
});

// ── The backfill ────────────────────────────────────────────────────────────

const BACKFILL: Array<[string, string, number, number]> = [
  ['07018500', 'BYRM7', 13, 16], ['07058000', 'TBCM7', 14, 16], ['07052250', 'JAMM7', 8, 10],
  ['07052500', 'GLNM7', 11, 15], ['07050500', 'BRYA4', 30, 31], ['07252000', 'MLBA4', 10, 18],
  ['07069500', 'IMBA4', 13, 18], ['07185765', 'CHTM7', 8, 10], ['07186000', 'WCOM7', 15, 19],
  ['07037500', 'PAZM7', 10, 16], ['06934000', 'RIFM7', 18, 20], ['07060500', 'CLRA4', 16, 19],
];

async function backfillDb() {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE public.gauge_stations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), usgs_site_id text UNIQUE,
      nws_lid text, nwps_flood_stage_ft numeric);
    CREATE TABLE public.river_gauges (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), gauge_station_id uuid REFERENCES public.gauge_stations(id),
      flood_stage_ft numeric, action_stage_ft numeric, level_dangerous numeric, threshold_source text);
  `);
  return db;
}

/** Production as it stood on 2026-11-17, plus one staged gauge that must not move. */
async function seed(db: PGlite, only?: string[]) {
  for (const [usgs] of BACKFILL.filter(([site]) => !only || only.includes(site))) {
    const lid = usgs === '07037500' ? 'PAZM7' : usgs === '06934000' ? 'RIFM7' : usgs === '07060500' ? 'CLRA4' : null;
    const stationStage = usgs === '06934000' ? 20 : usgs === '07060500' ? 19 : null;
    await db.query(`WITH s AS (INSERT INTO public.gauge_stations (usgs_site_id, nws_lid, nwps_flood_stage_ft) VALUES ($1, $2, $3) RETURNING id)
      INSERT INTO public.river_gauges (gauge_station_id, level_dangerous, threshold_source) SELECT id, 3000, 'editorial' FROM s`, [usgs, lid, stationStage]);
  }
  await db.exec(`WITH s AS (INSERT INTO public.gauge_stations (usgs_site_id, nws_lid) VALUES ('07067000', 'VNBM7') RETURNING id)
    INSERT INTO public.river_gauges (gauge_station_id, flood_stage_ft, action_stage_ft, threshold_source) SELECT id, 20, 10, 'editorial' FROM s`);
}

const snapshot = async (db: PGlite) =>
  (await db.query(`SELECT gs.usgs_site_id, gs.nws_lid, gs.nwps_flood_stage_ft::float8 AS station,
      rg.flood_stage_ft::float8 AS flood, rg.action_stage_ft::float8 AS action, rg.level_dangerous::float8 AS dangerous, rg.threshold_source
    FROM public.gauge_stations gs JOIN public.river_gauges rg ON rg.gauge_station_id = gs.id ORDER BY 1`)).rows;

const backfillSql = () => {
  const file = readdirSync(MIGRATIONS).find((f) => f.endsWith('_backfill_nws_flood_stages_on_linked_gauges.sql'));
  assert.ok(file);
  return readFileSync(join(MIGRATIONS, file), 'utf8');
};

test('the backfill stages twelve gauges, leaves everything else alone, and is idempotent', async () => {
  const db = await backfillDb();
  try {
    await db.exec(backfillSql()); // unseeded: nothing to do, no error
    assert.deepEqual(await snapshot(db), []);

    await seed(db);
    await db.exec(backfillSql());
    const after = await snapshot(db);
    for (const [usgs, lid, action, flood] of BACKFILL) {
      const row = after.find((r) => (r as { usgs_site_id: string }).usgs_site_id === usgs);
      assert.deepEqual(row, {
        usgs_site_id: usgs, nws_lid: lid, flood, action, dangerous: 3000, threshold_source: 'editorial',
        station: usgs === '06934000' ? 20 : usgs === '07060500' ? 19 : null,
      });
      // Display and logic now agree on every one of them.
      assert.equal(linkFloodStageFt({ flood_stage_ft: flood, gauge_stations: { nwps_flood_stage_ft: (row as { station: number | null }).station } }), flood);
    }
    assert.deepEqual(after.find((r) => (r as { usgs_site_id: string }).usgs_site_id === '07067000'),
      { usgs_site_id: '07067000', nws_lid: 'VNBM7', station: null, flood: 20, action: 10, dangerous: null, threshold_source: 'editorial' });

    await db.exec(backfillSql());
    assert.deepEqual(await snapshot(db), after);
  } finally {
    await db.close();
  }
});

test('the backfill refuses a conflicting value, and changes nothing when it does', async () => {
  const conflicts: Array<[string, string, RegExp]> = [
    ['a different lid', `UPDATE public.gauge_stations SET nws_lid = 'XXXM7' WHERE usgs_site_id = '07052250'`, /07052250 already carries lid XXXM7/],
    ['a different pairing stage', `UPDATE public.river_gauges SET flood_stage_ft = 12 WHERE gauge_station_id = (SELECT id FROM public.gauge_stations WHERE usgs_site_id = '07186000')`, /07186000 pairing already carries flood stage 12/],
    ['a different station stage', `UPDATE public.gauge_stations SET nwps_flood_stage_ft = 21 WHERE usgs_site_id = '07060500'`, /07060500 station flood stage is 21/],
  ];
  for (const [label, damage, message] of conflicts) {
    const db = await backfillDb();
    try {
      await seed(db);
      await db.exec(damage);
      const before = await snapshot(db);
      await assert.rejects(db.exec(backfillSql()), message, label);
      assert.deepEqual(await snapshot(db), before, `${label}: nothing written`);
    } finally {
      await db.close();
    }
  }
});

test('the backfill stages whichever stations exist, so a database built from migrations alone still builds', async () => {
  // Migrations create only Calico Rock (20260825011543); the other eleven come
  // from imports. The first version required all twelve or none and failed
  // that rebuild with "found 1 of 12 stations".
  const rebuilt = await backfillDb();
  try {
    await seed(rebuilt, ['07060500']);
    await rebuilt.exec(backfillSql());
    assert.deepEqual(
      (await snapshot(rebuilt)).find((r) => (r as { usgs_site_id: string }).usgs_site_id === '07060500'),
      { usgs_site_id: '07060500', nws_lid: 'CLRA4', station: 19, flood: 19, action: 16, dangerous: 3000, threshold_source: 'editorial' },
    );
  } finally {
    await rebuilt.close();
  }

  // A station present but not yet linked gets its NWS id and no error.
  const unlinked = await backfillDb();
  try {
    await seed(unlinked, ['07018500', '07252000']);
    await unlinked.exec(`DELETE FROM public.river_gauges WHERE gauge_station_id = (SELECT id FROM public.gauge_stations WHERE usgs_site_id = '07252000')`);
    await unlinked.exec(backfillSql());
    const lids = (await unlinked.query(`SELECT usgs_site_id, nws_lid FROM public.gauge_stations WHERE usgs_site_id IN ('07018500', '07252000') ORDER BY 1`)).rows;
    assert.deepEqual(lids, [{ usgs_site_id: '07018500', nws_lid: 'BYRM7' }, { usgs_site_id: '07252000', nws_lid: 'MLBA4' }]);
    const staged = (await snapshot(unlinked)).filter((r) => (r as { flood: number | null }).flood === 16);
    assert.equal(staged.length, 1);
  } finally {
    await unlinked.close();
  }
});
