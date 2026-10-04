import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import {
  classifyPoints,
  dossierColumns,
  dossierExpectationsOf,
  endpointIntentOf,
  REVIEW_STATE_COLUMNS,
  rolesOf,
  type DbPoint,
  type DossierExpectation,
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
  new Map<string, DossierExpectation>(
    slugs.map((s) => [s, { expectedMile: null, isFloatEndpoint: true }]),
  );

const IMPORTER_SOURCE = readFileSync(
  resolve(process.cwd(), 'scripts/ingestion/import-dossier-access-points.ts'),
  'utf8',
);
const ATOMIC_MIGRATION = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260914194000_apply_access_point_dossiers_atomically.sql',
  ),
  'utf8',
);

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

test('an existing-row patch preserves every optional field the dossier omits', () => {
  const cols = dossierColumns(
    { name: 'Bass Ford', kind: 'access', expected_mile: 3, lat: 37.9, lon: -91.2 },
    true,
  );
  assert.deepEqual(Object.keys(cols).sort(), ['location_orig', 'name', 'type']);
});

test('an explicit null still clears a dossier-owned field', () => {
  const cols = dossierColumns(
    {
      name: 'Bass Ford', kind: 'access', expected_mile: 3, lat: 37.9, lon: -91.2,
      description: null,
    },
    true,
  );
  assert.ok(Object.prototype.hasOwnProperty.call(cols, 'description'));
  assert.equal(cols.description, null);
});

test('roles can describe a campground that also has a boat ramp', () => {
  const row = {
    name: 'Two Things',
    kind: 'campground' as const,
    roles: ['campground', 'boat_ramp'] as const,
    expected_mile: 3,
    lat: 37.9,
    lon: -91.2,
  };
  assert.deepEqual(rolesOf({ ...row, roles: [...row.roles] }), ['campground', 'boat_ramp']);
  assert.equal(endpointIntentOf({ ...row, roles: [...row.roles] }), true);
  assert.equal(endpointIntentOf({ ...row, roles: [...row.roles], is_float_endpoint: false }), false);
});

test('all roles validate even when endpoint eligibility is explicit', () => {
  assert.throws(
    () =>
      dossierExpectationsOf([
        {
          name: 'Broken Roles',
          kind: 'campground',
          roles: ['not-a-role' as never],
          is_float_endpoint: false,
          expected_mile: 3,
          lat: 37.9,
          lon: -91.2,
        },
      ]),
    /invalid role/,
  );
});

test('duplicate dossier slugs fail before a write plan can be built', () => {
  assert.throws(
    () => dossierExpectationsOf([
      { name: 'Bass Ford', kind: 'access', expected_mile: 3, lat: 37.9, lon: -91.2 },
      { name: 'Bass-Ford', kind: 'access', expected_mile: 3, lat: 37.9, lon: -91.2 },
    ]),
    /duplicate dossier slug/,
  );
});

test('--write hands one finished plan to the atomic database function', () => {
  const writeBlock = IMPORTER_SOURCE.slice(
    IMPORTER_SOURCE.indexOf('if (write) {'),
    IMPORTER_SOURCE.indexOf('// Read back current DB state'),
  );
  assert.match(writeBlock, /\.rpc\('apply_access_point_dossier'/);
  assert.doesNotMatch(writeBlock, /\.from\('access_points'\)\.(?:insert|update|upsert)/);
  assert.match(ATOMIC_MIGRATION, /CREATE OR REPLACE FUNCTION public\.apply_access_point_dossier/);
  assert.match(ATOMIC_MIGRATION, /set_access_point_miles_from_geometry\(p_river_id, FALSE\)/);
  assert.match(ATOMIC_MIGRATION, /REVOKE EXECUTE[\s\S]+FROM PUBLIC, anon, authenticated/);
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

  const asPark = classifyPoints(
    [point({ ...far, is_float_endpoint: false })],
    new Map([['montauk', { expectedMile: null, isFloatEndpoint: false }]]),
  );
  assert.deepEqual(asPark.validated, ['ap-1'], 'a park 2.2 km out is correctly pinned, not broken');

  const asLaunch = classifyPoints([point({ ...far, is_float_endpoint: true })], dossier('montauk'));
  assert.deepEqual(asLaunch.validated, []);
  assert.match(asLaunch.problems[0], /FAR\(2236m\)/);
});

test('approval refuses a dossier launch whose stored review state still says non-launch', () => {
  const { validated, problems } = classifyPoints(
    [point({ slug: 'legacy-ramp', is_float_endpoint: false })],
    dossier('legacy-ramp'),
  );
  assert.deepEqual(validated, []);
  assert.match(problems[0], /ENDPOINT-REVIEW/);
});

test('a point with no river mile is never approved', () => {
  const { validated, problems } = classifyPoints(
    [point({ slug: 'no-mile', river_mile_downstream: null })],
    dossier('no-mile'),
  );
  assert.deepEqual(validated, []);
  assert.match(problems[0], /NO-MILE/);
});


test('private access handoffs and fees are written only when supplied', () => {
  const base = { name: 'Private beach', kind: 'gravel_bar' as const, expected_mile: 1, lat: 36, lon: -94 };
  const fields = { directions_override: 'Operator check-in address', parking_info: 'Check in first',
    road_access: 'Main entrance', fee_required: true, fee_notes: 'Private access pass' };
  const withFields = dossierColumns({ ...base, ...fields }, true);
  for (const [key, value] of Object.entries(fields)) assert.equal(withFields[key], value);
  const withoutFields = dossierColumns(base, true);
  for (const key of Object.keys(fields)) assert.equal(Object.hasOwn(withoutFields, key), false);
  assert.equal(Object.hasOwn(withFields, 'approved'), false);
  assert.equal(Object.hasOwn(withFields, 'is_float_endpoint'), false);
});

test('atomic access imports retain private terms without changing review state', async () => {
  const db = new PGlite();
  const river = '00000000-0000-0000-0000-000000000001';
  try {
    // Geometry is doubled here; the RPC's transaction and presence-aware fields
    // execute in PostgreSQL. Actual Elk projections were checked in PostGIS.
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA extensions;
      CREATE TABLE rivers(id uuid PRIMARY KEY);
      CREATE TABLE access_points(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), river_id uuid, slug text UNIQUE,
        name text, type text, is_public boolean, ownership text, managing_agency text,
        official_site_url text, facilities text, description text, location_orig text,
        approved boolean, is_float_endpoint boolean, types text[], updated_at timestamptz,
        directions_override text, parking_info text, road_access text,
        fee_required boolean DEFAULT false, fee_notes text
      );
      CREATE FUNCTION extensions.st_geomfromgeojson(text) RETURNS text LANGUAGE sql AS 'SELECT $1';
      CREATE FUNCTION extensions.st_setsrid(text, integer) RETURNS text LANGUAGE sql AS 'SELECT $1';
      CREATE FUNCTION set_access_point_miles_from_geometry(uuid, boolean) RETURNS integer
        LANGUAGE sql AS 'SELECT 0';
      INSERT INTO rivers VALUES ('${river}');
    `);
    await db.exec(readFileSync('supabase/migrations/20261004044150_preserve_access_dossier_handoff_fields.sql', 'utf8'));
    const run = (plan: unknown[]) => db.query('SELECT apply_access_point_dossier($1, $2)', [river, JSON.stringify(plan)]);
    const source = { name: 'Private beach', kind: 'gravel_bar' as const, expected_mile: 1,
      lat: 36, lon: -94, is_public: false, directions_override: 'Check-in address',
      parking_info: 'Guest lot', road_access: 'Camp entrance', fee_required: true, fee_notes: 'Access pass' };
    const payload = { ...dossierColumns(source), is_float_endpoint: false, types: ['gravel_bar'] };
    await run([{ action: 'insert', slug: 'private-beach', payload }]);
    let row = (await db.query<Record<string, unknown>>('SELECT * FROM access_points')).rows[0];
    for (const key of ['directions_override', 'parking_info', 'road_access', 'fee_required', 'fee_notes'] as const) {
      assert.equal(row[key], source[key]);
    }
    assert.equal(row.approved, false);
    assert.equal(row.is_float_endpoint, false);
    const id = row.id;
    await db.exec('UPDATE access_points SET approved = true, is_float_endpoint = true');
    await run([{ action: 'update', id, slug: 'private-beach', payload: { name: 'Reviewed beach' } }]);
    row = (await db.query<Record<string, unknown>>('SELECT * FROM access_points')).rows[0];
    assert.equal(row.fee_required, true);
    assert.equal(row.parking_info, 'Guest lot');
    assert.equal(row.approved, true);
    assert.equal(row.is_float_endpoint, true);
    assert.deepEqual(row.types, ['gravel_bar']);
    await run([{ action: 'update', id, slug: 'private-beach', payload: { fee_required: false, parking_info: null } }]);
    row = (await db.query<Record<string, unknown>>('SELECT * FROM access_points')).rows[0];
    assert.equal(row.fee_required, false);
    assert.equal(row.parking_info, null);
    await assert.rejects(run([
      { action: 'update', id, slug: 'private-beach', payload: { name: 'Should roll back' } },
      { action: 'update', id, slug: 'private-beach', payload: { is_float_endpoint: false } },
    ]), /carries review state/);
    assert.equal((await db.query<{ name: string }>('SELECT name FROM access_points')).rows[0].name, 'Reviewed beach');
    await assert.rejects(run([{ action: 'update', id, slug: 'private-beach', payload: { approved: false } }]), /unsupported payload key/);
    const grants = await db.query<{ service: boolean; anonymous: boolean; signed_in: boolean }>(`
      SELECT has_function_privilege('service_role', 'apply_access_point_dossier(uuid,jsonb)', 'EXECUTE') AS service,
        has_function_privilege('anon', 'apply_access_point_dossier(uuid,jsonb)', 'EXECUTE') AS anonymous,
        has_function_privilege('authenticated', 'apply_access_point_dossier(uuid,jsonb)', 'EXECUTE') AS signed_in
    `);
    assert.deepEqual(grants.rows[0], { service: true, anonymous: false, signed_in: false });
  } finally { await db.close(); }
});
