import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

// Two migrations of 2026-11-19 that change what the Read prompt is handed
// about low water. Both rewrite by exact text, so a row somebody has edited
// since, or a river that was never on the list, keeps what it has.
const folder = join(__dirname, '..', 'supabase', 'migrations');
const sql = (suffix: string) => readFileSync(join(folder, readdirSync(folder).find(name => name.endsWith(suffix))!), 'utf8');
const stockLines = sql('_low_water_notes_drop_the_stock_lines.sql');
const northFork = sql('_north_fork_too_low_is_a_drought.sql');

const STOCK = 'Scraping on gravel bars, dragging over shallow spots, and picking your line through riffles. Floatable, and lighter craft handle it better than rafts.';
const PLAIN = 'Scraping on gravel bars, dragging over shallow spots, and picking your line through riffles. Floatable.';
const SEVEN = ['courtois', 'current', 'eleven-point', 'huzzah', 'jacks-fork', 'meramec', 'niangua'];
const BLACK = 'upper-lesterville: Low water means boats drag on most riffles, but the reach stays floatable; lighter craft handle it better than rafts.';
const MULBERRY = 'Below about 1.5 ft at Turner Bend the Mulberry turns scrapy and the run becomes a walk. 1.5-1.7 ft is the beginner band; the whitewater reaches need more.';
const NORTH_FORK_NOTE = 'north-fork-main: below ~285 cfs the riffles get scrapy';
const NORTH_FORK_SUMMARY = "At the Tecumseh gauge (primary), 628–1,000 cfs is the ideal float range. Around 475 cfs it's low, and below ~285 cfs you'll drag. Above 1,000 cfs the North Fork runs high and cold, and 2,200 cfs and up is dangerous. Spring-fed baseflow from Rainbow and Blue Springs keeps it floatable most of the year, but it can jump quickly after heavy rain.";

async function database(notes: [slug: string, note: string | null][], floor: number | null = 285) {
  const db = new PGlite();
  await db.exec(`
    create table public.rivers (id serial primary key, slug text unique not null, float_summary text);
    create table public.river_characteristics (river_id integer primary key references public.rivers(id), low_water_meaning text, river_note text);
    create table public.gauge_stations (id serial primary key, usgs_site_id text unique not null);
    create table public.river_gauges (id serial primary key, river_id integer references public.rivers(id), gauge_station_id integer references public.gauge_stations(id),
      threshold_unit text, level_too_low numeric(10,2), level_low numeric(10,2), level_optimal_min numeric(10,2), level_optimal_max numeric(10,2),
      level_high numeric(10,2), level_dangerous numeric(10,2), alt_level_too_low numeric(10,2), alt_level_low numeric(10,2),
      threshold_source text, last_condition_code text, threshold_updated_at timestamptz);`);
  for (const [slug, note] of notes) {
    const { rows: [river] } = await db.query<{ id: number }>('insert into public.rivers (slug, float_summary) values ($1, $2) returning id',
      [slug, slug === 'north-fork-white' ? NORTH_FORK_SUMMARY : `${slug} summary`]);
    await db.query('insert into public.river_characteristics (river_id, low_water_meaning, river_note) values ($1, $2, $3)', [river.id, note, `${slug} note`]);
    if (slug === 'north-fork-white' && floor != null) {
      const { rows: [station] } = await db.query<{ id: number }>("insert into public.gauge_stations (usgs_site_id) values ('07057500') returning id");
      await db.query(`insert into public.river_gauges (river_id, gauge_station_id, threshold_unit, level_too_low, level_low, level_optimal_min,
        level_optimal_max, level_high, level_dangerous, alt_level_too_low, alt_level_low, threshold_source, last_condition_code, threshold_updated_at)
        values ($1, $2, 'cfs', $3, 475, 628, 1000, 1000, 2200, 2.19, 2.54, 'editorial', 'too_low', '2026-07-21T01:13:33Z')`, [river.id, station.id, floor]);
    }
  }
  return db;
}
const notes = async (db: PGlite) => Object.fromEntries((await db.query<{ slug: string; low_water_meaning: string | null; river_note: string }>(
  'select r.slug, rc.low_water_meaning, rc.river_note from public.river_characteristics rc join public.rivers r on r.id = rc.river_id')).rows
  .map(row => [row.slug, [row.low_water_meaning, row.river_note]]));
const ladder = async (db: PGlite) => (await db.query<Record<string, string | null>>(
  `select level_too_low::float8 as too_low, level_low::float8 as low, level_optimal_min::float8 as optimal_min, alt_level_too_low::float8 as alt_too_low,
     last_condition_code, (threshold_updated_at > '2026-11-01') as restamped from public.river_gauges`)).rows[0];

// ── the stock lines ─────────────────────────────────────────────────────────

test('the lighter-craft clause and the Mulberry level numbers are removed, and nothing else on the row', async () => {
  const db = await database([...SEVEN.map((slug): [string, string] => [slug, STOCK]), ['black', BLACK], ['mulberry', MULBERRY]]);
  await db.exec(stockLines);
  const after = await notes(db);
  for (const slug of SEVEN) assert.deepEqual(after[slug], [PLAIN, `${slug} note`], slug);
  assert.equal(after.black[0], 'upper-lesterville: Low water means boats drag on most riffles, but the reach stays floatable.');
  assert.equal(after.mulberry[0], 'In low water the Mulberry turns scrapy and the run becomes a walk. The whitewater reaches upstream need more water than the lower river.');
  for (const [note] of Object.values(after)) assert.doesNotMatch(note ?? '', /lighter craft|rafts|\d ft|\bband\b/);
  // Applying it twice changes nothing and does not fail.
  await db.exec(stockLines);
  assert.deepEqual(await notes(db), after);
});

test('a river off the list, and a listed river whose note was rewritten, keep what they have', async () => {
  const curated = 'Low water here means walking the canoe through the Narrows; lighter craft handle it better than rafts.';
  const db = await database([['current', STOCK], ['meramec', curated], ['gasconade', curated], ['white', null], ['north-fork-white', NORTH_FORK_NOTE]]);
  await db.exec(stockLines);
  const after = await notes(db);
  assert.equal(after.current[0], PLAIN);
  assert.equal(after.meramec[0], curated);
  assert.equal(after.gasconade[0], curated);
  assert.equal(after.white[0], null);
  // The North Fork's note moves with its ladder, in the other migration.
  assert.equal(after['north-fork-white'][0], NORTH_FORK_NOTE);
});

// ── the North Fork's floor ──────────────────────────────────────────────────

test('the North Fork floor moves to 200 cfs and the prose that quoted 285 moves with it', async () => {
  const db = await database([['north-fork-white', NORTH_FORK_NOTE], ['current', STOCK]]);
  await db.exec(northFork);
  assert.deepEqual(await ladder(db), { too_low: 200, low: 475, optimal_min: 628, alt_too_low: 1.95, last_condition_code: null, restamped: true });
  const after = await notes(db);
  assert.equal(after['north-fork-white'][0], 'north-fork-main: Low water means scrapy riffles, but the river below Rainbow Spring stays floatable.');
  assert.equal(after.current[0], STOCK);
  const { rows: [river] } = await db.query<{ float_summary: string }>("select float_summary from public.rivers where slug = 'north-fork-white'");
  assert.match(river.float_summary, /Below 475 cfs it's low and the riffles get scrapy, and below ~200 cfs it's too low to float\./);
  assert.doesNotMatch(river.float_summary, /285/);
  // The rungs above the floor are where they were.
  assert.match(river.float_summary, /628–1,000 cfs is the ideal float range.*2,200 cfs and up is dangerous/);

  // Applying it twice changes nothing: the restamp only happens on the move.
  await db.query("update public.river_gauges set threshold_updated_at = '2026-11-20T00:00:00Z', last_condition_code = 'low'");
  await db.exec(northFork);
  const again = await db.query<{ stamp: string; code: string }>("select threshold_updated_at::text as stamp, last_condition_code as code from public.river_gauges");
  assert.match(again.rows[0].stamp, /^2026-11-20 00:00:00/);
  assert.equal(again.rows[0].code, 'low');
});

test('a ladder somebody has since changed is not overwritten, and the migration says so', async () => {
  const db = await database([['north-fork-white', NORTH_FORK_NOTE]], 300);
  await assert.rejects(db.exec(northFork), /expected 1 ladder at 200\/475\/628-1000\/1000\/2200, found 0/);
});

test('a database without the river has nothing to do', async () => {
  const db = await database([['white', null]]);
  await db.exec(northFork);
  await db.exec(stockLines);
  assert.deepEqual(await notes(db), { white: [null, 'white note'] });
});
