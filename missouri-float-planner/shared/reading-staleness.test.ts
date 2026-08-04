import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { STALE_READING_HOURS, STALE_READING_MS, isReadingStale } from './reading-staleness';

test('the presentable-freshness line is six hours', () => {
  // Six rather than two because a two-hour line cried wolf: NWIS distribution
  // lags normally, so a healthy gauge would have spent part of most days marked
  // stale. Changing this changes what the website, the social pipeline and the
  // phone all consider current, at the same moment — which is the point.
  assert.equal(STALE_READING_HOURS, 6);
  assert.equal(STALE_READING_MS, 6 * 60 * 60 * 1000);
});

test('a reading that never reported is stale, not fresh', () => {
  // Absence is not freshness. A null age reaching a `> threshold` comparison
  // would be false and paint a confident chip over a gauge that has never
  // reported at all.
  assert.equal(isReadingStale(null), true);
  assert.equal(isReadingStale(undefined), true);
});

test('the boundary is exclusive', () => {
  assert.equal(isReadingStale(5.9), false);
  assert.equal(isReadingStale(6), false);
  assert.equal(isReadingStale(6.1), true);
});

// ── the guard ────────────────────────────────────────────────────

test('nothing redefines STALE_READING_HOURS outside this module', () => {
  // The regression this prevents: the number had three independent definitions
  // — src/app/api/plan/route.ts, src/lib/social/live-conditions.ts and
  // eddy-ios/src/lib/offline-cache.ts — so the phone could paint a condition as
  // current that the website had already captioned as stale, and no single edit
  // could fix it. A file-level assertion is the only kind that catches a fourth
  // copy being added, because a fourth copy type-checks perfectly.
  const repoRoot = join(__dirname, '..', '..');
  const files = [
    'missouri-float-planner/src/app/api/plan/route.ts',
    'missouri-float-planner/src/lib/social/live-conditions.ts',
    'eddy-ios/src/lib/offline-cache.ts',
  ];

  for (const relative of files) {
    const source = readFileSync(join(repoRoot, relative), 'utf-8');
    assert.equal(
      /(?:const|let|var)\s+STALE_READING_HOURS\s*=/.test(source),
      false,
      `${relative} declares its own STALE_READING_HOURS — import it from @eddy/conditions/reading-staleness instead`,
    );
    assert.equal(
      source.includes('STALE_READING_HOURS'),
      true,
      `${relative} no longer references STALE_READING_HOURS — update this guard if that is deliberate`,
    );
  }
});
