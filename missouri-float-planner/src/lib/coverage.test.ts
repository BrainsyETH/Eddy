import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// A static guard, in the style of src/lib/ai/no-hardcoded-models.test.ts.
//
// The failure this catches is not a crash — it is a page that keeps rendering
// perfectly while telling everyone the wrong thing. The About page claimed 8
// curated rivers, in body copy AND in its FAQ structured data, while production
// carried 24. Nothing broke, no test went red, and the number went on being
// served to Google and quoted back in a competitive teardown as evidence that
// Eddy's coverage was a fraction of its competitors'.
//
// So the rule is: surfaces that state coverage READ it, never type it. These
// checks are narrow on purpose — they do not care how a surface obtains a
// figure, only that it is not spelling one out.

const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

/** Surfaces that make a coverage claim and must derive it. */
const COVERAGE_SURFACES = ['src/app/about/page.tsx', 'src/app/coverage/page.tsx'];

test('coverage surfaces read their figures from the coverage module', () => {
  for (const path of COVERAGE_SURFACES) {
    assert.match(
      src(path),
      /from '@\/lib\/coverage'/,
      `${path} states coverage and must import it from @/lib/coverage`,
    );
  }
});

test('no coverage surface hardcodes a river count', () => {
  // Deliberately matches the shape the stale copy took ("8 Ozark rivers",
  // "covers 12 rivers", "all 25 rivers") rather than any bare digit, so ordinary
  // numbers in prose stay legal. `{2}` on the digits would miss "8 rivers",
  // which is the exact literal that caused this.
  const HARDCODED = /\b\d{1,3}\s+(?:Ozark\s+)?(?:curated\s+)?rivers\b/i;

  for (const path of COVERAGE_SURFACES) {
    const offenders = src(path)
      .split('\n')
      .map((line, i) => [i + 1, line] as const)
      // The comment block at the top of coverage.ts-adjacent files explains the
      // bug using the very string it bans, so commented lines are exempt. A
      // literal in a comment cannot ship to a user.
      .filter(([, line]) => !/^\s*(?:\/\/|\*|\/\*)/.test(line))
      .filter(([, line]) => HARDCODED.test(line));

    assert.deepEqual(
      offenders,
      [],
      `${path} hardcodes a river count: ${offenders.map(([n, l]) => `L${n}: ${l.trim()}`).join(' | ')}`,
    );
  }
});

test('the roster is rendered from data, not an inline array of river names', () => {
  // The original bug was literally `['Meramec River', 'Current River', …]`.
  // Any file listing two or more river names as adjacent string literals is
  // reintroducing it.
  const RIVER_NAME_LITERALS = /'[A-Z][A-Za-z' ]+(?:River|Creek|Fork)'\s*,\s*\n?\s*'[A-Z]/;

  for (const path of COVERAGE_SURFACES) {
    assert.doesNotMatch(
      src(path),
      RIVER_NAME_LITERALS,
      `${path} appears to inline a river roster — render getCuratedRivers() instead`,
    );
  }
});

test('/api/coverage documents every count it returns', () => {
  // The definitions are the load-bearing half of that response: `ratedGauges`
  // and `referenceGauges` describe genuinely different promises, and a consumer
  // reading only the integers will eventually add them together. A count
  // shipped without its definition invites exactly that.
  const lib = src('src/lib/coverage.ts');
  const route = src('src/app/api/coverage/route.ts');

  // Field names as declared on the CoverageCounts interface.
  const interfaceBody = lib.match(/export interface CoverageCounts \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(interfaceBody, 'CoverageCounts interface not found in src/lib/coverage.ts');

  const fields = [...interfaceBody.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]);
  assert.ok(fields.length >= 7, `expected the full count set, found ${fields.length}`);

  const definitions = route.match(/const DEFINITIONS[\s\S]*?\n\};/)?.[0];
  assert.ok(definitions, 'DEFINITIONS block not found in the coverage route');

  for (const field of fields) {
    assert.match(
      definitions,
      new RegExp(`\\b${field}\\s*:`),
      `/api/coverage returns "${field}" with no definition beside it`,
    );
  }
});

test('coverage counts degrade to null, never to zero', () => {
  const lib = src('src/lib/coverage.ts');

  // `count ?? null` and never `count ?? 0`. Zero is a real answer ("no hazards
  // recorded") and a failed query must not be able to impersonate it.
  assert.doesNotMatch(
    lib,
    /count\s*\?\?\s*0\b/,
    'a failed count must fall back to null, not 0 — 0 is a real answer',
  );
  assert.match(lib, /count\s*\?\?\s*null/, 'countOf should return `count ?? null`');
});
