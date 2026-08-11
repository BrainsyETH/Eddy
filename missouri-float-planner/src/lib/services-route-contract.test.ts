import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROUTE = join(process.cwd(), 'src/app/api/services/route.ts');
const source = readFileSync(ROUTE, 'utf8');

// ── WHY A SOURCE-LEVEL TEST, AND WHY THIS ROUTE ───────────────────────────
//
// GET /api/services is the only thing the map screen fetches services from, and
// it spent a release quietly filtering them: `.eq('status','active')` and two
// `.not(latitude, is, null)` clauses, selecting neither `status` nor
// `geocode_precision`. 28 of 156 rows arrived. That broke three guards at once
// and NONE of them failed loudly:
//
//   • `serviceEligible` became a no-op, because `status` never arrived — so the
//     client's policy (draw `unverified`, drop closed) was silently replaced by
//     a stricter server one, and the map and the planner saw different
//     populations of one table.
//   • Provenance never arrived, because `geocode_precision` was not selected —
//     so no client could tell a corroborated coordinate from a legacy one.
//   • The layers sheet's coverage note could never render, because the rows it
//     counts had been filtered out upstream.
//
// The unit tests all passed. `db:check-services` passed too, because it reads
// the DATABASE and the app reads the API. This test sits in that gap: it is the
// only place that asserts the route hands the client what the client's own
// rules need to work. Same technique as api-cache-headers.test.ts, for the same
// reason — a contract no runtime test in this suite can reach.

/**
 * The columns the route actually asks Postgres for.
 *
 * ── PARSED, NOT GREPPED ───────────────────────────────────────────────────
 *
 * The first version of this test searched the WHOLE FILE for `status` and
 * `geocode_precision`, which is close to no test at all: both words appear in
 * the header comment, in the ServiceRow interface, and in the response mapping.
 * Deleting either from the select would have left all three, and the test would
 * have passed while the app went back to being unable to judge a single row.
 *
 * TypeScript cannot cover for it either — the route casts through
 * `unknown as ServiceRow[]`, because `src/types/database.ts` predates the
 * `geocode_precision` column, so a shorter select is not a type error.
 *
 * So: find the literal, split it, and assert on the members.
 */
function selectedColumns(): string[] {
  const literal = source.match(/const SELECT_COLUMNS\s*=\s*\n?\s*'([^']+)'/);
  assert.ok(literal, 'SELECT_COLUMNS must be a single-quoted string literal');
  return literal[1].split(',').map((c) => c.trim());
}

test('the select asks for the two columns the client policies read', () => {
  // Without `status`, serviceEligible cannot tell a closed business from an
  // open one. Without `geocode_precision`, the client loses coordinate
  // provenance — which column carries `exact` vs `approximate` vs legacy.
  const columns = selectedColumns();
  assert.ok(columns.includes('status'), `status missing from: ${columns.join(', ')}`);
  assert.ok(
    columns.includes('geocode_precision'),
    `geocode_precision missing from: ${columns.join(', ')}`,
  );
});

test('the select asks for everything the response promises', () => {
  // The other half of the same gap: a column dropped from the select but left
  // in the mapping yields `undefined` for every row, silently. Derived from the
  // response mapping rather than hand-listed, so a field added later is covered
  // without anybody remembering this file.
  const columns = new Set(selectedColumns());
  const mapped = [...source.matchAll(/^\s*\w+:\s*(?:toNum\()?s\.(\w+)/gm)].map((m) => m[1]);
  assert.ok(mapped.length >= 10, `expected the response mapping to be found, got ${mapped.length}`);
  for (const column of mapped) {
    assert.ok(columns.has(column), `the response maps s.${column}, which the select never asks for`);
  }
});

test('the response carries them through to the client', () => {
  // Selecting is half of it; a field dropped in the map() below never reaches
  // the app either.
  assert.match(source, /status:\s*s\.status/, 'status must be mapped onto the response');
  assert.match(
    source,
    /geocodePrecision:\s*s\.geocode_precision/,
    'geocodePrecision must be mapped onto the response',
  );
});

test('the route does not apply its own eligibility policy', () => {
  // Eligibility lives in @eddy/types and nowhere else. A server-side status
  // filter is a SECOND policy, and the two disagreed: this dropped 11
  // `unverified` rows the app would have drawn.
  assert.doesNotMatch(
    source.replace(/\/\/.*$/gm, ''),
    /\.eq\(\s*['"]status['"]/,
    'status filtering belongs to serviceEligible, not to this route',
  );
});

test('the route does not drop rows that have no coordinates', () => {
  // The un-geocoded rows are exactly what the coverage note counts — "13 of 81
  // have a confirmed location" needs the 81. Filtering them here makes that
  // sentence unrenderable, which is what happened.
  const code = source.replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /\.not\(\s*['"]latitude['"]/, 'un-geocoded rows must still be returned');
  assert.doesNotMatch(code, /\.not\(\s*['"]longitude['"]/, 'un-geocoded rows must still be returned');
});

test('the select is one string literal, never a concatenation', () => {
  // supabase-js infers the row type by parsing this at compile time. A `+`
  // collapses it to `string` and every field degrades to GenericStringError —
  // which is a compile error rather than a silent bug, but an obscure one, and
  // the fix (splitting a long line) looks entirely innocent.
  assert.doesNotMatch(
    source,
    /const SELECT_COLUMNS[^;]*\+/,
    'SELECT_COLUMNS must not be built by concatenation',
  );
  // And the call site must pass that constant rather than an inline string, or
  // the parser above is checking something the query does not use.
  //
  // ANCHORED ON THE TABLE, not on being the first `.select()` in the file. The
  // route reads a second table now — access_point_services, for the identity
  // links — and its select is legitimately an inline literal, being two columns
  // with no shared constant. A positional match made "add a query" fail a test
  // about nearby_services, which is the wrong thing to defend.
  // No `s` flag — the build targets ES2017, and `[\s\S]` spans newlines anyway.
  const call = source.match(/\.from\('nearby_services'\)[\s\S]*?\.select\(([^)]*)\)/);
  assert.ok(call, 'the route must select from nearby_services');
  assert.equal(call[1].trim(), 'SELECT_COLUMNS');
});

test('only same_place links reach the app', () => {
  // The distinction the relationship column exists for. `located_at` says a
  // campground and an access point are one FACILITY — true of Meramec, whose two
  // rows are 2 956 m apart. The app collapses whatever arrives in accessPointId
  // into a single marker, so shipping a located_at link would delete a real
  // campground's location from the map and point a reader at a boat ramp 3 km
  // away. The filter is server-side because an older build cannot re-apply it.
  const relationship = source.match(/const IDENTITY_RELATIONSHIP\s*=\s*'([^']+)'/);
  assert.ok(relationship, 'the route must declare which relationship it trusts');
  assert.equal(relationship[1], 'same_place');
  assert.match(
    source,
    /\.eq\('relationship',\s*IDENTITY_RELATIONSHIP\)/,
    'the link query must filter on that constant, not select the whole table',
  );
});

test('an unverified same_place link never reaches the app', () => {
  // Belt and braces over a database CHECK that already makes the row
  // impossible. Worth both: the constraint is the guarantee, and this is the
  // half that survives the constraint being dropped, a restore from a backup
  // that predates it, or a fourth relationship value added without thinking it
  // through. What it guards is a marker silently deleted from the map.
  assert.match(
    source,
    /\.not\('verified_at',\s*'is',\s*null\)/,
    'the link query must require a human verification',
  );
});

test('every service carries its access point link, even when there is none', () => {
  // Absent must mean "not linked", never "not told". The field is optional on
  // the wire so an older build degrades to the proximity radius, which makes a
  // missing key indistinguishable from an unlinked row — so the route always
  // emits it, and `null` is the honest value.
  assert.match(source, /accessPointId:\s*accessPointByService\.get\(s\.id\)\s*\?\?\s*null/);
});
