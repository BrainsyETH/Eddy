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

test('the route selects the two columns the client policies read', () => {
  // Without `status`, serviceEligible cannot tell a closed business from an
  // open one. Without `geocode_precision`, mappableService cannot tell a town
  // centroid from a real location.
  assert.match(source, /\bstatus\b/, 'status must be selected');
  assert.match(source, /\bgeocode_precision\b/, 'geocode_precision must be selected');
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
  // No `s` flag — the build targets ES2017, and `[^)]*` already spans newlines.
  const select = source.match(/\.select\(([^)]*)\)/);
  assert.ok(select, 'the route must have a .select()');
  assert.doesNotMatch(select[1], /\+/, 'the select argument must not be concatenated');
});
