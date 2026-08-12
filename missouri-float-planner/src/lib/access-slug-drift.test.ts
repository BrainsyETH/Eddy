// src/lib/access-slug-drift.test.ts
// The seed-vs-database slug comparison, run from the web suite.
//
// Covers src/lib/access-slugs.ts, the logic behind `npm run db:check-access-slugs`.
// The comparison is pure, so it is tested here with fixtures; the script keeps
// the file read and the SELECT. The seed parse is also run against the REAL seed file,
// because a parser that silently stops matching the file it parses would turn
// the whole check into a green no-op — the exact failure mode it was written to
// end.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  compareAccessSlugs as compareSlugs,
  normalizeAccessName as normalizeName,
  parseSeedAccessPoints as parseSeed,
} from './access-slugs';

const SEED_PATH = join(__dirname, '..', '..', 'supabase', 'seed', 'access_points.sql');

test('normalizeName ignores punctuation, case and spacing', () => {
  assert.equal(normalizeName("Mother Nature's Riverfront Retreat"), 'mothernaturesriverfrontretreat');
  assert.equal(normalizeName('Ha Ha Tonka State Park'), normalizeName('ha-ha-tonka  STATE park'));
  assert.equal(normalizeName('Highway 8 Bridge (Lower)'), 'highway8bridgelower');
});

test('a seed slug the database does not have, under a name it does, is drift', () => {
  const findings = compareSlugs(
    [{ river: 'niangua', slug: 'ha-ha-tonka', name: 'Ha Ha Tonka State Park' }],
    [{ river: 'niangua', slug: 'ha-ha-tonka-state-park', name: 'Ha Ha Tonka State Park' }],
  );
  assert.deepEqual(findings, [
    {
      kind: 'drift',
      river: 'niangua',
      seedSlug: 'ha-ha-tonka',
      name: 'Ha Ha Tonka State Park',
      dbSlug: 'ha-ha-tonka-state-park',
    },
  ]);
});

test('a matching slug is not reported, even when the names differ', () => {
  // The database is allowed to have retitled a place; the URL is what must hold.
  const findings = compareSlugs(
    [{ river: 'big-piney', slug: 'ross-bridge', name: 'Ross Bridge Access' }],
    [{ river: 'big-piney', slug: 'ross-bridge', name: 'Ross Access' }],
  );
  assert.deepEqual(findings, []);
});

test('a seed row the database has under no name at all is absent, not drift', () => {
  const findings = compareSlugs(
    [{ river: 'niangua', slug: 'riverbend-rv-park', name: 'Riverbend RV Park and Campground' }],
    [{ river: 'niangua', slug: 'whistle-bridge', name: 'Whistle Bridge' }],
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'absent');
  assert.equal(findings[0].dbSlug, undefined);
});

test('the same slug on a different river is a different place', () => {
  // `two-rivers` is a real access on both the Current and the Jacks Fork.
  const findings = compareSlugs(
    [{ river: 'jacks-fork', slug: 'two-rivers', name: 'Two Rivers' }],
    [{ river: 'current', slug: 'two-rivers', name: 'Two Rivers' }],
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'absent');
});

test('one seed row matching two same-named database rows reports both', () => {
  // Production really does carry duplicates like van-buren / van-buren-city-access,
  // and a check that silently picked one would hide half the problem.
  const findings = compareSlugs(
    [{ river: 'current', slug: 'van-buren-access', name: 'Van Buren City Access' }],
    [
      { river: 'current', slug: 'van-buren', name: 'Van Buren City Access' },
      { river: 'current', slug: 'van-buren-city-access', name: 'Van Buren City Access' },
    ],
  );
  assert.equal(findings.length, 2);
  assert.deepEqual(
    findings.map((f) => f.dbSlug).sort(),
    ['van-buren', 'van-buren-city-access'],
  );
});

test('parseSeed reads the real seed file', () => {
  const { rows, unparsed } = parseSeed(readFileSync(SEED_PATH, 'utf8'));
  assert.equal(unparsed, 0, 'every INSERT block should match the expected shape');
  assert.ok(rows.length > 70, `expected the seed to hold 70+ access points, got ${rows.length}`);

  // Slugs are URLs: lowercase, digits and hyphens, nothing else.
  for (const row of rows) {
    assert.match(row.slug, /^[a-z0-9-]+$/, `${row.river}/${row.slug} is not slug-shaped`);
    assert.ok(row.name.length > 0, `${row.river}/${row.slug} has no name`);
  }

  // (river, slug) is the seed's identity — UNIQUE(river_id, slug) in the schema.
  const seen = new Set<string>();
  for (const row of rows) {
    const key = `${row.river} ${row.slug}`;
    assert.ok(!seen.has(key), `duplicate seed row for ${key}`);
    seen.add(key);
  }

  // The apostrophe rows are the ones a naive parse gets wrong, and they are
  // exactly the rows whose slugs drifted, so pin one down.
  const mn = rows.find((r) => r.slug === 'mother-nature-s-riverfront-retreat');
  assert.ok(mn, 'the seed should carry production\'s slug for Mother Nature\'s');
  assert.equal(mn?.name, "Mother Nature's Riverfront Retreat");
});

test('the real seed no longer carries the slugs production renamed', () => {
  // The nineteen corrected in this pass. If one comes back, the seed is
  // building URLs the database does not serve.
  const retired = [
    ['eleven-point', 'mcdowell'], ['eleven-point', 'myrtle'], ['eleven-point', 'narrows'],
    ['eleven-point', 'whitten'], ['huzzah', 'butts-bridge'], ['huzzah', 'hazel-creek'],
    ['huzzah', 'highway-8-lower'], ['huzzah', 'huzzah-conservation'], ['huzzah', 'red-bluff'],
    ['jacks-fork', 'eminence'], ['meramec', 'onondaga-cave-sp'], ['meramec', 'scotia-bridge'],
    ['niangua', 'barclay-access'], ['niangua', 'big-bear-resort'], ['niangua', 'ha-ha-tonka'],
    ['niangua', 'maggard-corkery'], ['niangua', 'mother-natures-retreat'],
    ['niangua', 'mountain-creek-resort'], ['niangua', 'riverfront-campground'],
  ];
  const { rows } = parseSeed(readFileSync(SEED_PATH, 'utf8'));
  const present = new Set(rows.map((r) => `${r.river} ${r.slug}`));
  for (const [river, slug] of retired) {
    assert.ok(!present.has(`${river} ${slug}`), `${river}/${slug} is back in the seed`);
  }
});
