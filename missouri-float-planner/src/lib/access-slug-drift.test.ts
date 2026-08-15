import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ACCESS_SLUG_ABSENT_EXCEPTIONS,
  ACCESS_SLUG_RENAMES,
  checkSeedAgainstRenames,
  compareAccessSlugs,
  normalizeAccessName,
  parseSeedAccessPoints,
} from './access-slugs';

// The seed's access slugs, and the rename list three artifacts agree on.
//
// ── Why the real file, and not a fixture ─────────────────────────────────────
// The check this backs exists because a copy of the slugs drifted from the
// database without anyone noticing. A parser that quietly stopped matching the
// file would turn `db:check-access-slugs` into a green no-op — the same failure
// wearing a tick — so the parser is run against the actual seed and its
// unparsed count is asserted to be zero.
const SEED_PATH = join(process.cwd(), 'supabase', 'seed', 'access_points.sql');
const SEED = readFileSync(SEED_PATH, 'utf8');

test('the seed parses completely', () => {
  const { rows, unparsed } = parseSeedAccessPoints(SEED);
  assert.equal(
    unparsed,
    0,
    'an INSERT INTO access_points block no longer matches the expected shape. ' +
      'Fix the parser — an unparsed block is a row the drift check cannot see.',
  );
  assert.ok(rows.length > 70, `only ${rows.length} access points parsed out of the seed`);
  for (const row of rows) {
    assert.match(row.slug, /^[a-z0-9-]+$/, `${row.slug} is not a slug`);
    assert.ok(row.river.length > 0, `${row.slug} has no river`);
    assert.ok(row.name.length > 0, `${row.slug} has no name`);
  }
});

// The half of the contract that needs no credentials. `db:check-access-slugs`
// runs under `make check-db`, which is outside `make check` because it needs a
// linked project — so without this, a seed reintroducing a legacy slug reaches
// main and waits for whoever next runs a credentialled check.
test('the seed uses canonical slugs, and the rename list is not stale', () => {
  const { rows } = parseSeedAccessPoints(SEED);
  assert.deepEqual(
    checkSeedAgainstRenames(rows),
    [],
    'the seed contradicts ACCESS_SLUG_RENAMES',
  );
});

test('every unresolved row on file is still in the seed', () => {
  const { rows } = parseSeedAccessPoints(SEED);
  const slugs = new Set(rows.map((r) => `${r.river} ${r.slug}`));
  for (const e of ACCESS_SLUG_ABSENT_EXCEPTIONS) {
    assert.ok(
      slugs.has(`${e.river} ${e.seedSlug}`),
      `${e.river}/${e.seedSlug} is excepted but no longer in the seed — drop the exception`,
    );
  }
});

test('the rename list is internally coherent', () => {
  const seen = new Set<string>();
  for (const r of ACCESS_SLUG_RENAMES) {
    const key = `${r.river} ${r.legacy}`;
    assert.ok(!seen.has(key), `${key} is mapped twice`);
    seen.add(key);
    assert.notEqual(r.legacy, r.canonical, `${key} maps to itself`);
    assert.match(r.legacy, /^[a-z0-9-]+$/);
    assert.match(r.canonical, /^[a-z0-9-]+$/);
  }
  // A canonical slug that is also somebody's legacy slug would mean the list
  // has to be applied in an order, and it is applied as a set.
  const legacies = new Set(ACCESS_SLUG_RENAMES.map((r) => `${r.river} ${r.legacy}`));
  for (const r of ACCESS_SLUG_RENAMES) {
    assert.ok(
      !legacies.has(`${r.river} ${r.canonical}`),
      `${r.canonical} is both a canonical target and a legacy source — the list would be order-dependent`,
    );
  }
});

// The migration cannot import the TypeScript list, so it repeats it. A repeated
// list is a list that can drift, which is the entire subject of this file — so
// the SQL is read back as text and compared against the source of truth.
test('the migration renames exactly what the rename list says', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase', 'migrations', '20260815000000_reconcile_access_point_slugs.sql'),
    'utf8',
  );
  const values = /INSERT INTO access_slug_renames \(river, legacy, canonical\) VALUES([\s\S]*?);/.exec(
    sql,
  );
  assert.ok(values, 'the migration no longer declares its renames as a VALUES list');

  const inSql = [...values[1].matchAll(/\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g)].map(
    (m) => `${m[1]} ${m[2]} ${m[3]}`,
  );
  const inTs = ACCESS_SLUG_RENAMES.map((r) => `${r.river} ${r.legacy} ${r.canonical}`);
  assert.deepEqual(
    [...inSql].sort(),
    [...inTs].sort(),
    'the migration and ACCESS_SLUG_RENAMES disagree. They are two copies of one ' +
      'contract and the database is what settles it — update both.',
  );
});

test('a matching slug is never reported, even when the name has changed', () => {
  const findings = compareAccessSlugs(
    [{ river: 'current', slug: 'akers-ferry', name: 'Akers Ferry' }],
    [{ river: 'current', slug: 'akers-ferry', name: 'Akers Ferry Access' }],
  );
  assert.deepEqual(findings, []);
});

test('the river is part of the key', () => {
  // `two-rivers` is a real access on both the Current and the Jacks Fork, and
  // UNIQUE(river_id, slug) says so. A comparison keyed on slug alone would call
  // one of them a match for the other.
  const findings = compareAccessSlugs(
    [{ river: 'jacks-fork', slug: 'two-rivers', name: 'Two Rivers' }],
    [{ river: 'current', slug: 'two-rivers', name: 'Two Rivers' }],
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'absent');
});

test('a place the database knows under another slug is drift', () => {
  const findings = compareAccessSlugs(
    [{ river: 'niangua', slug: 'ha-ha-tonka', name: 'Ha Ha Tonka State Park' }],
    [{ river: 'niangua', slug: 'ha-ha-tonka-state-park', name: 'Ha Ha Tonka State Park' }],
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'drift');
  assert.equal(findings[0].dbSlug, 'ha-ha-tonka-state-park');
});

test('every database row of that name is reported, not just the first', () => {
  // Production carries genuine duplicates like van-buren / van-buren-city-access.
  // Reporting one would hide half the problem from whoever has to resolve it.
  const findings = compareAccessSlugs(
    [{ river: 'current', slug: 'van-buren', name: 'Van Buren' }],
    [
      { river: 'current', slug: 'van-buren-city-access', name: 'Van Buren' },
      { river: 'current', slug: 'van-buren-access', name: 'Van Buren' },
    ],
  );
  assert.equal(findings.length, 2);
  assert.deepEqual(
    findings.map((f) => f.dbSlug).sort(),
    ['van-buren-access', 'van-buren-city-access'],
  );
});

test('an absent row is excepted only if it is on the list', () => {
  const onList = ACCESS_SLUG_ABSENT_EXCEPTIONS[0];
  const findings = compareAccessSlugs(
    [
      { river: onList.river, slug: onList.seedSlug, name: 'Something Production Lacks' },
      { river: 'current', slug: 'brand-new-landing', name: 'Brand New Landing' },
    ],
    [],
  );
  const excepted = findings.find((f) => f.seedSlug === onList.seedSlug);
  const fresh = findings.find((f) => f.seedSlug === 'brand-new-landing');
  assert.equal(excepted?.excepted, true);
  assert.equal(
    fresh?.excepted,
    false,
    'a seed row production has never heard of must fail the check rather than ' +
      'join the unresolved pile silently',
  );
});

test('punctuation and case cannot hide a name match', () => {
  assert.equal(
    normalizeAccessName("Mother Nature's  Riverfront Retreat"),
    normalizeAccessName('mother natures riverfront retreat'),
  );
});
