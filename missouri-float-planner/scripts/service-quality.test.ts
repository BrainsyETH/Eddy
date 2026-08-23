import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildBaseline,
  compareToBaseline,
  DEBT_CLASSES,
  measureDebt,
  scorable,
  type Baseline,
  type QualityRow,
} from './service-quality';

// The point of the ratchet is that it can be PASSED on the day it ships and
// still catch the next defect. Each case below is one of the two halves of
// that: existing debt is carried, new debt fails.

function row(over: Partial<QualityRow> = {}): QualityRow {
  return {
    slug: 'good-outfitter',
    name: 'Good Outfitter',
    type: 'outfitter',
    status: 'active',
    phone: '(417) 555-0100',
    phone_toll_free: null,
    website: 'https://good.example',
    description: 'A long enough description to be useful to a reader.',
    latitude: 37.5,
    services_offered: ['canoe_rental', 'shuttle'],
    last_verified_at: '2026-08-01T00:00:00Z',
    verified_source: 'https://good.example',
    ...over,
  };
}

function baselineOf(rows: QualityRow[], riverFloors: Record<string, number> = {}): Baseline {
  return buildBaseline(rows, riverFloors, '2026-08-23');
}

test('a clean row is in no debt class at all', () => {
  const debt = measureDebt([row()]);
  for (const cls of DEBT_CLASSES) assert.deepEqual(debt[cls.key], [], cls.key);
});

test('each class catches the defect it names', () => {
  const cases: Array<[string, Partial<QualityRow>]> = [
    ['campground_without_camping', { type: 'campground', services_offered: ['showers'] }],
    ['no_contact', { phone: null, phone_toll_free: null, website: null }],
    ['no_coordinates', { latitude: null }],
    ['never_verified', { last_verified_at: null }],
    ['placeholder_source', { verified_source: 'csv_import' }],
    ['thin_description', { description: 'short' }],
  ];
  for (const [key, over] of cases) {
    const debt = measureDebt([row({ slug: 'x', ...over })]);
    assert.deepEqual(debt[key], ['x'], `${key} should have caught ${JSON.stringify(over)}`);
  }
});

test('a campground counts as covered by either kind of camping', () => {
  for (const offering of ['camping_primitive', 'camping_rv']) {
    const debt = measureDebt([row({ type: 'campground', services_offered: [offering] })]);
    assert.deepEqual(debt.campground_without_camping, [], offering);
  }
});

test('a permanently closed business is a recorded fact, not a data gap', () => {
  const closed = row({ slug: 'gone', status: 'permanently_closed', phone: null, website: null, phone_toll_free: null });
  assert.deepEqual(scorable([closed]), []);
  assert.deepEqual(measureDebt([closed]).no_contact, []);
});

// ── The ratchet itself ────────────────────────────────────────────────────

test('known debt passes on the day the baseline is recorded', () => {
  const rows = [row({ slug: 'legacy', phone: null, phone_toll_free: null, website: null })];
  const result = compareToBaseline(measureDebt(rows), {}, baselineOf(rows));
  assert.deepEqual(result.regressions, []);
});

test('a new row with the same defect fails', () => {
  const before = [row({ slug: 'legacy', phone: null, phone_toll_free: null, website: null })];
  const after = [...before, row({ slug: 'fresh', phone: null, phone_toll_free: null, website: null })];
  const result = compareToBaseline(measureDebt(after), {}, baselineOf(before));
  assert.equal(result.regressions.length, 1);
  assert.equal(result.regressions[0].classKey, 'no_contact');
  assert.deepEqual(result.regressions[0].slugs, ['fresh']);
});

test('fixing one row while breaking another is a regression, not a wash', () => {
  // This is why the baseline records slugs and not counts: the total is
  // unchanged, and a count-based ratchet would report nothing.
  const before = [row({ slug: 'a', latitude: null }), row({ slug: 'b' })];
  const after = [row({ slug: 'a' }), row({ slug: 'b', latitude: null })];
  const result = compareToBaseline(measureDebt(after), {}, baselineOf(before));

  assert.equal(measureDebt(before).no_coordinates.length, measureDebt(after).no_coordinates.length);
  assert.deepEqual(result.regressions[0].slugs, ['b']);
  assert.deepEqual(result.improvements[0].slugs, ['a']);
});

test('paying debt down is reported and does not fail', () => {
  const before = [row({ slug: 'legacy', latitude: null })];
  const after = [row({ slug: 'legacy' })];
  const result = compareToBaseline(measureDebt(after), {}, baselineOf(before));
  assert.deepEqual(result.regressions, []);
  assert.deepEqual(result.improvements[0].slugs, ['legacy']);
});

// ── River floors ──────────────────────────────────────────────────────────

test('a river losing services fails even when every row is clean', () => {
  // An --overwrite run that unlinks more than it meant to passes every class
  // above, because the rows it detached are still perfectly good rows.
  const rows = [row()];
  const result = compareToBaseline(
    measureDebt(rows), { niangua: 3 }, baselineOf(rows, { niangua: 7 }),
  );
  assert.deepEqual(result.riverDrops, [{ river: 'niangua', floor: 7, now: 3 }]);
});

test('a river gaining services passes — that is what a corridor pass does', () => {
  const rows = [row()];
  const result = compareToBaseline(
    measureDebt(rows), { niangua: 12 }, baselineOf(rows, { niangua: 0 }),
  );
  assert.deepEqual(result.riverDrops, []);
});

test('a river missing from the baseline is surfaced rather than ignored', () => {
  const rows = [row()];
  const result = compareToBaseline(
    measureDebt(rows), { niangua: 4, courtois: 2 }, baselineOf(rows, { niangua: 4 }),
  );
  assert.deepEqual(result.unknownRivers, ['courtois']);
});

test('the baseline records the date and every class, so a diff is readable', () => {
  const baseline = baselineOf([row({ slug: 'legacy', latitude: null })], { niangua: 4 });
  assert.equal(baseline.generatedAt, '2026-08-23');
  assert.deepEqual(baseline.riverFloors, { niangua: 4 });
  for (const cls of DEBT_CLASSES) assert.ok(cls.key in baseline.classes, cls.key);
  assert.deepEqual(baseline.classes.no_coordinates, ['legacy']);
});
