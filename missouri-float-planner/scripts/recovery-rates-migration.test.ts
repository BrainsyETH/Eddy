import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

// The eight hand-set recovery rates are cleared by text, so a river whose note
// was rewritten since, or one that was never on the list, keeps what it has.
const folder = join(__dirname, '..', 'supabase', 'migrations');
const migration = readFileSync(join(folder, readdirSync(folder).find(name => name.endsWith('_remove_unsourced_recovery_rates.sql'))!), 'utf8');
const LEGACY: [string, string][] = [
  ['big-piney', '0.3-0.6 ft/day (lower volume, steady spring base)'], ['courtois', '1-2 ft/day (similar to Huzzah)'],
  ['current', '0.2-0.4 ft/day (slow, large spring base flow)'], ['eleven-point', '0.3-0.6 ft/day (Greer Spring stabilizes)'],
  ['huzzah', '1-2 ft/day (small watershed drains fast)'], ['jacks-fork', '1-3 ft/day (drops as fast as it rises)'],
  ['meramec', '0.5-2 ft/day (floatable above Hwy 8 ~36h after rain stops)'], ['niangua', '0.3-0.5 ft/day (Bennett Spring stabilizes)'],
];

async function database(rows: [slug: string, note: string | null][]) {
  const db = new PGlite();
  await db.exec(`
    create table public.rivers (id serial primary key, slug text unique not null);
    create table public.river_characteristics (river_id integer primary key references public.rivers(id),
      rain_lag_hours numeric(4,1), rain_lag_note text, drop_rate_note text, river_note text);`);
  for (const [slug, note] of rows) {
    const { rows: [river] } = await db.query<{ id: number }>('insert into public.rivers (slug) values ($1) returning id', [slug]);
    await db.query('insert into public.river_characteristics (river_id, drop_rate_note, river_note) values ($1, $2, $3)', [river.id, note, `${slug} note`]);
  }
  return db;
}
const state = async (db: PGlite) => Object.fromEntries((await db.query<{ slug: string; drop_rate_note: string | null; river_note: string }>(
  'select r.slug, rc.drop_rate_note, rc.river_note from public.river_characteristics rc join public.rivers r on r.id = rc.river_id')).rows
  .map(row => [row.slug, [row.drop_rate_note, row.river_note]]));

test('the eight recorded recovery rates are cleared and nothing else on the row is touched', async () => {
  const db = await database(LEGACY);
  await db.exec(migration);
  const after = await state(db);
  for (const [slug] of LEGACY) assert.deepEqual(after[slug], [null, `${slug} note`], slug);
  // Applying it twice changes nothing and does not fail.
  await db.exec(migration);
  assert.deepEqual(await state(db), after);
});

test('a river off the list, and a listed river whose note was rewritten, keep what they have', async () => {
  const db = await database([
    ...LEGACY.filter(([slug]) => slug !== 'meramec'),
    ['meramec', 'Floatable above Highway 8 about a day and a half after rain stops (owner, 2027).'],
    ['buffalo', 'Measured: falls a foot a day below St. Joe.'],
    ['white', null],
  ]);
  await db.exec(migration);
  const after = await state(db);
  assert.equal(after.meramec[0], 'Floatable above Highway 8 about a day and a half after rain stops (owner, 2027).');
  assert.equal(after.buffalo[0], 'Measured: falls a foot a day below St. Joe.');
  assert.equal(after.white[0], null);
  assert.equal(after.current[0], null);
});

test('a database without these rivers has nothing to do', async () => {
  const db = await database([['white', null]]);
  await db.exec(migration);
  assert.deepEqual(await state(db), { white: [null, 'white note'] });
});
