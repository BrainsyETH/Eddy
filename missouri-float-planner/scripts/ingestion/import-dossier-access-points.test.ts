import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyPoints,
  dossierColumns,
  REVIEW_STATE_COLUMNS,
  type DbPoint,
} from './import-dossier-access-points';

// Both rules below exist because the importer broke them against production
// data, so each case names the damage rather than describing the code.
//
// The audit that found them: docs/river-access-data-audit-2026-09-14.md.

function point(over: Partial<DbPoint> = {}): DbPoint {
  return {
    id: 'ap-1',
    name: 'Somewhere Access',
    slug: 'somewhere-access',
    type: 'access',
    river_mile_downstream: 10,
    snap_distance_m: 20,
    approved: false,
    is_float_endpoint: true,
    managing_agency: 'MDC',
    ...over,
  };
}

const dossier = (...slugs: string[]) =>
  new Map<string, number | null | undefined>(slugs.map((s) => [s, null]));

// ── --write must not withdraw a published page ────────────────────────────

test('the dossier never writes a column that records human review', () => {
  const columns = Object.keys(
    dossierColumns({ name: 'Bass Ford', kind: 'access', expected_mile: 3, lat: 37.9, lon: -91.2 }),
  );
  for (const guarded of REVIEW_STATE_COLUMNS) {
    assert.ok(
      !columns.includes(guarded),
      `dossierColumns() writes ${guarded}. On an existing row that is not an ` +
        `overwrite: approved is the column RLS publishes on, so re-running ` +
        `--write would unpublish every already-approved point on the river.`,
    );
  }
});

test('the dossier still owns the description of a place', () => {
  const cols = dossierColumns({
    name: 'Bass Ford',
    kind: 'boat_ramp',
    expected_mile: 3,
    lat: 37.9,
    lon: -91.2,
    ownership: 'Roubidoux County',
    managing_agency: 'City',
    description: 'Concrete ramp below the low-water bridge.',
  });
  assert.equal(cols.name, 'Bass Ford');
  assert.equal(cols.type, 'boat_ramp');
  assert.equal(cols.managing_agency, 'Municipal', 'City is a synonym inside the 00034 enum');
  assert.equal(cols.ownership, 'Roubidoux County', 'ownership keeps the true operator as free text');
  assert.deepEqual(cols.location_orig, { type: 'Point', coordinates: [-91.2, 37.9] });
});

test('an agency outside the 00034 enum nulls the column rather than failing the insert', () => {
  // The Buffalo precedent (00158): AGFC is the real operator and is not in the
  // enum, so managing_agency goes null and `ownership` carries the truth.
  const cols = dossierColumns({
    name: 'Buffalo City',
    kind: 'boat_ramp',
    expected_mile: null,
    lat: 36.1,
    lon: -92.5,
    ownership: 'AGFC',
  });
  assert.equal(cols.managing_agency, null);
  assert.equal(cols.ownership, 'AGFC');
});

// ── --approve must not publish somebody else's row ────────────────────────

test('approval is confined to the rows this dossier carries coordinates for', () => {
  const rows = [
    point({ id: 'mine', slug: 'bass-ford', river_mile_downstream: 1 }),
    point({ id: 'theirs', slug: 'unrelated-access', river_mile_downstream: 2 }),
  ];

  const { validated, lines } = classifyPoints(rows, dossier('bass-ford'));

  assert.deepEqual(validated, ['mine'], 'only the dossier row may be approved');
  assert.equal(lines.length, 2, 'but the whole river is still printed for context');
});

test('a row outside the dossier still supplies ordering context to its neighbours', () => {
  // The out-of-order row is the SECOND one and is not in the dossier. The third
  // row is, and only looks correctly ordered if the walk kept carrying prevMile
  // across the row it skipped.
  const rows = [
    point({ id: 'a', slug: 'a', river_mile_downstream: 1 }),
    point({ id: 'b', slug: 'not-in-dossier', river_mile_downstream: 40 }),
    point({ id: 'c', slug: 'c', river_mile_downstream: 3 }),
  ];

  const { validated, problems } = classifyPoints(rows, dossier('a', 'c'));

  assert.deepEqual(validated, ['a']);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /ORDER\?/);
});

// ── the Montauk rule, kept ────────────────────────────────────────────────

test('distance from the channel blocks a launch and not a park', () => {
  const far = { snap_distance_m: 2236, slug: 'montauk', river_mile_downstream: 0.1 };

  const asPark = classifyPoints([point({ ...far, is_float_endpoint: false })], dossier('montauk'));
  assert.deepEqual(asPark.validated, ['ap-1'], 'a park 2.2 km out is correctly pinned, not broken');

  const asLaunch = classifyPoints([point({ ...far, is_float_endpoint: true })], dossier('montauk'));
  assert.deepEqual(asLaunch.validated, []);
  assert.match(asLaunch.problems[0], /FAR\(2236m\)/);
});

test('a point with no river mile is never approved', () => {
  const { validated, problems } = classifyPoints(
    [point({ slug: 'no-mile', river_mile_downstream: null })],
    dossier('no-mile'),
  );
  assert.deepEqual(validated, []);
  assert.match(problems[0], /NO-MILE/);
});
