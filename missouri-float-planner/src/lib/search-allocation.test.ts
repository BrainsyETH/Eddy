import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allocateByKind,
  escapeLike,
  type SearchResult,
  type SearchResultKind,
} from '@/app/api/search/route';

// ── /api/search must not let one kind starve another ───────────────────
//
// Regression suite for a live bug. The route used to concatenate rivers, then
// access points, then gauges, and `.slice(0, limit)` the lot. The phone's Search
// tab asks for limit=25, so any query matching 25 rivers and access points
// returned ZERO gauges — verified against production, where `?q=river&limit=25`
// returned 19 rivers, 6 access points and no gauges, while the identical query
// at limit=100 returned 14 gauges. The Gauges scope therefore read "0" for
// exactly the common words people search with.

function rows(kind: SearchResultKind, n: number): SearchResult[] {
  return Array.from({ length: n }, (_, i) => ({
    kind,
    id: `${kind}-${i}`,
    name: `${kind} ${i}`,
    subtitle: null,
    riverId: null,
    riverName: null,
    riverSlug: null,
    riverMile: null,
    coordinates: null,
  }));
}

function counts(results: SearchResult[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of results) out[r.kind] = (out[r.kind] ?? 0) + 1;
  return out;
}

test('a kind listed last still comes back when the earlier ones could fill the page', () => {
  // The exact production shape: plenty of all three, budget for a fraction.
  const out = allocateByKind(
    [
      { kind: 'river', results: rows('river', 19) },
      { kind: 'access_point', results: rows('access_point', 17) },
      { kind: 'gauge', results: rows('gauge', 14) },
    ],
    25,
  );

  assert.equal(out.length, 25);
  const c = counts(out);
  assert.ok(c.gauge > 0, 'gauges must survive a full page of rivers and access points');
  assert.ok(c.river > 0);
  assert.ok(c.access_point > 0);
});

test('unclaimed budget goes to the kinds that can use it', () => {
  // Only rivers match. Nothing should be held back for the empty kinds.
  const out = allocateByKind(
    [
      { kind: 'river', results: rows('river', 40) },
      { kind: 'access_point', results: [] },
      { kind: 'gauge', results: [] },
    ],
    25,
  );
  assert.equal(out.length, 25);
  assert.equal(counts(out).river, 25);
});

test('a single-kind request gets the whole limit', () => {
  // This is what the scoped Search tab sends, and the reason `kinds` exists.
  const out = allocateByKind([{ kind: 'gauge', results: rows('gauge', 40) }], 25);
  assert.equal(out.length, 25);
  assert.equal(counts(out).gauge, 25);
});

test('fewer results than the limit are all returned', () => {
  const out = allocateByKind(
    [
      { kind: 'river', results: rows('river', 2) },
      { kind: 'gauge', results: rows('gauge', 3) },
    ],
    25,
  );
  assert.equal(out.length, 5);
});

test('kind order is preserved, and so is order within a kind', () => {
  const out = allocateByKind(
    [
      { kind: 'river', results: rows('river', 2) },
      { kind: 'gauge', results: rows('gauge', 2) },
    ],
    10,
  );
  assert.deepEqual(
    out.map((r) => r.id),
    ['river-0', 'river-1', 'gauge-0', 'gauge-1'],
  );
});

test('a limit smaller than the number of kinds still returns something from the first', () => {
  // floor(2/3) is 0; a share of zero would return an empty page for a query
  // that matched plenty.
  const out = allocateByKind(
    [
      { kind: 'river', results: rows('river', 5) },
      { kind: 'access_point', results: rows('access_point', 5) },
      { kind: 'gauge', results: rows('gauge', 5) },
    ],
    2,
  );
  assert.ok(out.length > 0);
});

test('no kinds at all is an empty page rather than a throw', () => {
  assert.deepEqual(allocateByKind([], 25), []);
});

// ── The access-point branch builds a PostgREST or() string by hand ──────
//
// `or=(name.ilike.*foo*,river_id.in.(uuid,uuid))` is parsed by PostgREST
// itself, not by the driver, so every character with meaning in that grammar
// has to be gone before the query reaches it. A comma splits one filter into
// two; a paren closes the `in` list early; `*` and `%` are wildcards.

test('escapeLike strips every character that means something to PostgREST', () => {
  assert.equal(escapeLike('Cedar, Grove'), 'Cedar Grove', 'comma splits an or() filter');
  assert.equal(escapeLike('Akers (Ferry)'), 'Akers Ferry', 'parens close an in() list');
  assert.equal(escapeLike('a*b'), 'ab', 'star is the or() wildcard');
  assert.equal(escapeLike('a%b_c'), 'abc', 'percent and underscore are SQL wildcards');
  assert.equal(escapeLike('back\\slash'), 'backslash', 'backslash escapes the wildcards');
});

test('escapeLike leaves an ordinary place name alone', () => {
  // Over-escaping is its own bug: these are real access point names.
  assert.equal(escapeLike("Anna M. Adams"), 'Anna M. Adams');
  assert.equal(escapeLike('Big Piney'), 'Big Piney');
  assert.equal(escapeLike("Devil's Elbow"), "Devil's Elbow");
});

// Gauge caption attribution moved to shared/station-caption.test.ts when the
// rule stopped being a private function of this route — the iOS app held a
// second copy of it, and the two had drifted.

// ── Paging must not lose rows ──────────────────────────────────────────────
//
// Two separate defects lived here, both silent. Together they meant a person
// scrolling the Today tab was shown a list with holes in it and no way to tell.

import { pageOf, parseOffsets } from '@/app/api/search/route';

test('the probe row dropped is the last one fetched, not the worst one shown', () => {
  // The source hands back limit+1 rows in ITS order (here: a, b, c, d). The
  // page keeps the first three; `d` is the probe and is what page two starts
  // at. The presentation order — reversed here to stand in for the relevance
  // sort — must not change WHICH rows survive.
  const fetched = ['a', 'b', 'c', 'd'];
  const page = pageOf(fetched, 3, (rows) => [...rows].reverse());

  assert.deepEqual(page, ['c', 'b', 'a'], 'presented in the display order');
  assert.ok(!page.includes('d'), 'the probe row is the one held back');

  // The bug: presenting first and slicing second kept the reverse-sorted
  // ['d','c','b'] — dropping `a`, which page two (starting at index 3) never
  // returns. `a` would have been gone from every page of that search, and `d`
  // would have shipped twice.
  const buggy = [...fetched].reverse().slice(0, 3);
  assert.ok(!buggy.includes('a'), 'documents what the old order did');
  assert.ok(buggy.includes('d'), 'and the duplicate it shipped');
});

test('a page and its successor meet exactly, with nothing between them', () => {
  // The property the fix exists to hold, over a source of 10 rows paged 3 at a
  // time: every row appears exactly once across the pages.
  const source = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9'];
  const limit = 3;
  const seen: string[] = [];
  for (let offset = 0; offset < source.length; offset += limit) {
    // What the route does: fetch limit+1 from the offset, then page it.
    const fetched = source.slice(offset, offset + limit + 1);
    seen.push(...pageOf(fetched, limit, (rows) => [...rows].sort()));
  }
  assert.deepEqual([...seen].sort(), [...source].sort(), 'every row, exactly once');
});

test('per-kind offsets are read, and an absent kind keeps the flat offset', () => {
  // The Today tab pages three kinds at once and they advance at their own
  // rates, so each states its own position. A scoped caller sends no `offsets`
  // at all and must keep behaving exactly as it did.
  assert.deepEqual(parseOffsets('river:12,gauge:20', 0), { river: 12, gauge: 20 });
  assert.deepEqual(parseOffsets(null, 50), {}, 'absent means "use the flat offset"');

  const partial = parseOffsets('gauge:20', 7);
  assert.equal(partial.gauge, 20);
  assert.equal(partial.river, undefined, 'unnamed kinds fall through to the flat offset');
});

test('a malformed offsets parameter degrades to a first page, never an error', () => {
  assert.deepEqual(parseOffsets('nonsense', 0), {});
  assert.deepEqual(parseOffsets('river:notanumber', 0), { river: 0 });
  assert.deepEqual(parseOffsets('river:-5', 0), { river: 0 }, 'negatives cannot walk backwards');
});
