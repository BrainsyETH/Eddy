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
//   • `mappableService` was DEFEATED, because `geocode_precision` never
//     arrived and absent reads as trusted. A row marked `centroid` — a town,
//     never a place — would have been drawn as a pin, which is the single
//     failure that file exists to prevent.
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
  // open one. Without `geocode_precision`, mappableService cannot tell a town
  // centroid from a real location — and absent reads as trusted, so the failure
  // is a pin in the wrong place rather than a missing one.
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
  // No `s` flag — the build targets ES2017, and `[^)]*` already spans newlines.
  const call = source.match(/\.select\(([^)]*)\)/);
  assert.ok(call, 'the route must have a .select()');
  assert.equal(call[1].trim(), 'SELECT_COLUMNS');
});
