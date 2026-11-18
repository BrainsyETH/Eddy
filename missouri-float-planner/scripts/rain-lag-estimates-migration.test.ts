import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync(join(__dirname, '..', 'supabase', 'migrations', '20261118230000_remove_unsourced_rain_lag_estimates.sql'), 'utf8');
const LEGACY: [string, number][] = [['big-piney', 6], ['courtois', 3], ['current', 8], ['eleven-point', 8], ['huzzah', 3], ['jacks-fork', 4], ['meramec', 6], ['niangua', 10]];

async function database(rows: [slug: string, hours: number | null, note: string | null][]) {
  const db = new PGlite();
  await db.exec(`
    create table public.rivers (id serial primary key, slug text unique not null);
    create table public.river_characteristics (river_id integer primary key references public.rivers(id),
      rain_lag_hours numeric(4,1), rain_lag_note text, drop_rate_note text);`);
  for (const [slug, hours, note] of rows) {
    const { rows: [river] } = await db.query<{ id: number }>('insert into public.rivers (slug) values ($1) returning id', [slug]);
    await db.query('insert into public.river_characteristics values ($1, $2, $3, $4)', [river.id, hours, note, `${slug} recovery`]);
  }
  return db;
}
const state = async (db: PGlite) => Object.fromEntries((await db.query<{ slug: string; rain_lag_hours: string | null; rain_lag_note: string | null; drop_rate_note: string }>(
  `select r.slug, rc.rain_lag_hours, rc.rain_lag_note, rc.drop_rate_note from public.river_characteristics rc join public.rivers r on r.id = rc.river_id`)).rows
  .map(row => [row.slug, [row.rain_lag_hours === null ? null : Number(row.rain_lag_hours), row.rain_lag_note, row.drop_rate_note]]));

test('the eight documented estimates are cleared, hours and note, and the recovery note is kept', async () => {
  const db = await database(LEGACY.map(([slug, hours]) => [slug, hours, `${slug} responds in about ${hours} hours`]));
  await db.exec(migration);
  const after = await state(db);
  for (const [slug] of LEGACY) assert.deepEqual(after[slug], [null, null, `${slug} recovery`], slug);
  // Applying it twice changes nothing and does not fail.
  await db.exec(migration);
  assert.deepEqual(await state(db), after);
});

test('a river off the list, and a listed river whose hours were changed since, are left alone', async () => {
  const db = await database([
    ...LEGACY.filter(([slug]) => slug !== 'meramec').map(([slug, hours]): [string, number, string] => [slug, hours, 'old']),
    ['meramec', 9, 'measured at Steelville'],
    ['buffalo', 12, 'from a later study'],
    ['gasconade', null, 'a note with no hours'],
  ]);
  await db.exec(migration);
  const after = await state(db);
  assert.deepEqual(after.meramec, [9, 'measured at Steelville', 'meramec recovery']);
  assert.deepEqual(after.buffalo, [12, 'from a later study', 'buffalo recovery']);
  assert.deepEqual(after.gasconade, [null, 'a note with no hours', 'gasconade recovery']);
  assert.deepEqual(after.current, [null, null, 'current recovery']);
});

test('a database without these rivers has nothing to do', async () => {
  const db = await database([['white', null, null]]);
  await db.exec(migration);
  assert.deepEqual(await state(db), { white: [null, null, 'white recovery'] });
});
