import assert from 'node:assert/strict';
import test from 'node:test';
import {
  baselineShapeProblem,
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
    longitude: -92.5,
    services_offered: ['canoe_rental', 'shuttle'],
    last_verified_at: '2026-08-01T00:00:00Z',
    verified_source: 'https://good.example',
    ...over,
  };
}

function baselineOf(rows: QualityRow[], riverMembers: Record<string, string[]> = {}): Baseline {
  return buildBaseline(rows, riverMembers, '2026-08-23');
}

test('a clean row is in no debt class at all', () => {
  const debt = measureDebt([row()]);
  for (const cls of DEBT_CLASSES) assert.deepEqual(debt[cls.key], [], cls.key);
});

test('each class catches the defect it names', () => {
  const cases: Array<[string, Partial<QualityRow>]> = [
    ['campground_without_camping', { type: 'campground', services_offered: ['showers'] }],
    ['no_contact', { phone: null, phone_toll_free: null, website: null }],
    ['no_coordinates', { latitude: null, longitude: null }],
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
  const before = [row({ slug: 'a', latitude: null, longitude: null }), row({ slug: 'b' })];
  const after = [row({ slug: 'a' }), row({ slug: 'b', latitude: null, longitude: null })];
  const result = compareToBaseline(measureDebt(after), {}, baselineOf(before));

  assert.equal(measureDebt(before).no_coordinates.length, measureDebt(after).no_coordinates.length);
  assert.deepEqual(result.regressions[0].slugs, ['b']);
  assert.deepEqual(result.improvements[0].slugs, ['a']);
});

test('paying debt down is reported and does not fail', () => {
  const before = [row({ slug: 'legacy', latitude: null, longitude: null })];
  const after = [row({ slug: 'legacy' })];
  const result = compareToBaseline(measureDebt(after), {}, baselineOf(before));
  assert.deepEqual(result.regressions, []);
  assert.deepEqual(result.improvements[0].slugs, ['legacy']);
});

// ── River membership ─────────────────────────────────────────────────────
// Recorded by slug, not by count, for the same reason the debt classes are.

test('a river losing a service fails even when every row is clean', () => {
  // An --overwrite run that unlinks more than it meant to passes every class
  // above, because the rows it detached are still perfectly good rows.
  const rows = [row()];
  const result = compareToBaseline(
    measureDebt(rows),
    { niangua: ['a', 'b'] },
    baselineOf(rows, { niangua: ['a', 'b', 'c'] }),
  );
  assert.deepEqual(result.riverDrops, [{ river: 'niangua', lost: ['c'] }]);
});

test('two services swapping rivers is two departures, not no change', () => {
  // This is the case a count-based floor cannot see: both totals stay at one.
  const rows = [row()];
  const before = { niangua: ['bass'], courtois: ['ozark'] };
  const after = { niangua: ['ozark'], courtois: ['bass'] };
  const result = compareToBaseline(measureDebt(rows), after, baselineOf(rows, before));

  assert.equal(Object.values(before).flat().length, Object.values(after).flat().length);
  assert.deepEqual(result.riverDrops, [
    { river: 'niangua', lost: ['bass'] },
    { river: 'courtois', lost: ['ozark'] },
  ]);
});

test('a river gaining services passes — that is what a corridor pass does', () => {
  const rows = [row()];
  const result = compareToBaseline(
    measureDebt(rows),
    { niangua: ['a', 'b', 'c'] },
    baselineOf(rows, { niangua: ['a'] }),
  );
  assert.deepEqual(result.riverDrops, []);
});

test('a river missing from the baseline is surfaced rather than ignored', () => {
  const rows = [row()];
  const result = compareToBaseline(
    measureDebt(rows),
    { niangua: ['a'], courtois: ['b'] },
    baselineOf(rows, { niangua: ['a'] }),
  );
  assert.deepEqual(result.unknownRivers, ['courtois']);
});

test('the baseline records the date and every class, so a diff is readable', () => {
  const baseline = baselineOf([row({ slug: 'legacy', latitude: null, longitude: null })], { niangua: ['a'] });
  assert.equal(baseline.generatedAt, '2026-08-23');
  assert.deepEqual(baseline.riverMembers, { niangua: ['a'] });
  for (const cls of DEBT_CLASSES) assert.ok(cls.key in baseline.classes, cls.key);
  assert.deepEqual(baseline.classes.no_coordinates, ['legacy']);
});

// ── Severity ──────────────────────────────────────────────────────────────
// Three NPS-authorized Buffalo concessioners with confirmed phones, websites
// and offerings were held out of the directory because no geocoder would
// resolve a PO box suite or a road intersection. A row you can call is useful
// before it can be drawn, so a missing pin must not fail the way a false claim
// about somewhere to sleep does.

test('a defect that makes the product wrong is an error', () => {
  for (const key of ['campground_without_camping', 'no_contact', 'placeholder_source', 'never_verified']) {
    const cls = DEBT_CLASSES.find((c) => c.key === key);
    assert.equal(cls?.severity, 'error', key);
  }
});

test('a defect that only makes the product thinner is a warning', () => {
  for (const key of ['no_coordinates', 'thin_description']) {
    const cls = DEBT_CLASSES.find((c) => c.key === key);
    assert.equal(cls?.severity, 'warn', key);
  }
});

test('a new row with no coordinates is reported, and does not fail the check', () => {
  const before = [row({ slug: 'known' })];
  const after = [...before, row({ slug: 'crocketts-canoe-rental', latitude: null, longitude: null })];
  const result = compareToBaseline(measureDebt(after), {}, baselineOf(before));

  const reported = result.regressions.find((r) => r.classKey === 'no_coordinates');
  assert.deepEqual(reported?.slugs, ['crocketts-canoe-rental'], 'it must still be surfaced');
  assert.equal(reported?.severity, 'warn', 'but it must not block the corridor');
  assert.equal(result.regressions.filter((r) => r.severity === 'error').length, 0);
});

test('a new row that answers nothing still fails, pin or no pin', () => {
  const before = [row({ slug: 'known' })];
  const after = [...before, row({ slug: 'unreachable', phone: null, phone_toll_free: null, website: null })];
  const result = compareToBaseline(measureDebt(after), {}, baselineOf(before));
  assert.equal(result.regressions.find((r) => r.classKey === 'no_contact')?.severity, 'error');
});

// ── A coordinate is a pair ────────────────────────────────────────────────
// no_coordinates used to test latitude alone, so a row carrying a latitude and
// no longitude passed the ratchet while being undrawable.

test('a row missing either half counts as having no coordinates', () => {
  for (const half of [{ latitude: null }, { longitude: null }]) {
    const debt = measureDebt([row({ slug: 'half', ...half })]);
    assert.deepEqual(debt.no_coordinates, ['half'], JSON.stringify(half));
  }
});

test('exactly one half is an error, because it is a contradiction not a gap', () => {
  const cls = DEBT_CLASSES.find((c) => c.key === 'half_a_coordinate');
  assert.equal(cls?.severity, 'error');
  assert.deepEqual(measureDebt([row({ slug: 'lat-only', longitude: null })]).half_a_coordinate, ['lat-only']);
  assert.deepEqual(measureDebt([row({ slug: 'lon-only', latitude: null })]).half_a_coordinate, ['lon-only']);
});

test('having neither half is a gap, not a contradiction', () => {
  const debt = measureDebt([row({ slug: 'neither', latitude: null, longitude: null })]);
  assert.deepEqual(debt.no_coordinates, ['neither']);
  assert.deepEqual(debt.half_a_coordinate, [], 'a row with no coordinate at all is not incoherent');
});

test('a baseline written before river membership says so, rather than throwing', () => {
  // Reading a riverFloors-era file used to throw "Cannot convert undefined or
  // null to object" from inside a loop, which tells the reader nothing.
  const stale = { generatedAt: '2026-08-23', note: '', classes: {}, riverFloors: { niangua: 4 } };
  assert.match(String(baselineShapeProblem(stale as unknown as Baseline)), /predates river membership/);
  assert.equal(baselineShapeProblem(baselineOf([row()], { niangua: ['a'] })), null);
});

test('a baseline that is not a baseline at all is named as such', () => {
  assert.match(String(baselineShapeProblem(undefined as unknown as Baseline)), /missing or not an object/);
  assert.match(String(baselineShapeProblem({ generatedAt: '', note: '' } as unknown as Baseline)), /no `classes`/);
});

// ── Verification ages ─────────────────────────────────────────────────────
// A row verified once and never again is a claim about the past wearing the
// badge of the present. This branch found a shut motel, an outfitter closed
// until March 2027, and three dead domains — all on rows that read as current.

const NOW = new Date('2026-08-24T00:00:00Z');
function verifiedDaysAgo(days: number, over: Partial<QualityRow> = {}): QualityRow {
  const d = new Date(NOW.getTime() - days * 86_400_000);
  return row({ slug: `aged-${days}`, last_verified_at: d.toISOString(), ...over });
}

test('a freshly verified row is in no ageing class', () => {
  const debt = measureDebt([verifiedDaysAgo(30)], NOW);
  assert.deepEqual(debt.verification_ageing, []);
  assert.deepEqual(debt.verification_expired, []);
});

test('past six months it warns; past a year it fails', () => {
  const warn = measureDebt([verifiedDaysAgo(200)], NOW);
  assert.deepEqual(warn.verification_ageing, ['aged-200']);
  assert.deepEqual(warn.verification_expired, [], 'not yet expired');

  const expired = measureDebt([verifiedDaysAgo(400)], NOW);
  assert.deepEqual(expired.verification_expired, ['aged-400']);
  assert.deepEqual(expired.verification_ageing, [], 'expired rows are not also merely ageing');
});

test('the two ageing classes carry the severities they claim', () => {
  assert.equal(DEBT_CLASSES.find((c) => c.key === 'verification_ageing')?.severity, 'warn');
  assert.equal(DEBT_CLASSES.find((c) => c.key === 'verification_expired')?.severity, 'error');
});

test('a never-verified row ages into no class, because it is already counted', () => {
  // never_verified owns that row; double-reporting it would inflate the debt.
  const debt = measureDebt([row({ slug: 'x', last_verified_at: null })], NOW);
  assert.deepEqual(debt.never_verified, ['x']);
  assert.deepEqual(debt.verification_ageing, []);
  assert.deepEqual(debt.verification_expired, []);
});

test('a temporary closure gets a shorter fuse than an open business', () => {
  // 150 days is fine for an open row and stale for one claiming to be shut:
  // "temporarily" is the part that expires.
  const open = measureDebt([verifiedDaysAgo(150)], NOW);
  assert.deepEqual(open.closure_ageing, []);
  assert.deepEqual(open.verification_ageing, [], '150 days has not reached the open-row warning yet');

  for (const status of ['seasonal', 'temporarily_closed']) {
    const shut = measureDebt([verifiedDaysAgo(150, { status })], NOW);
    assert.deepEqual(shut.closure_ageing, ['aged-150'], status);
  }
});

test('an unconfirmed closure is an error, not a warning', () => {
  assert.equal(DEBT_CLASSES.find((c) => c.key === 'closure_ageing')?.severity, 'error');
  const never = measureDebt([row({ slug: 'shut', status: 'seasonal', last_verified_at: null })], NOW);
  assert.deepEqual(never.closure_ageing, ['shut'], 'a closure never verified at all counts too');
});

test('a permanently closed row is still excluded from every class', () => {
  const gone = row({ slug: 'gone', status: 'permanently_closed', last_verified_at: null });
  assert.deepEqual(measureDebt([gone], NOW).closure_ageing, []);
  assert.deepEqual(measureDebt([gone], NOW).never_verified, []);
});
