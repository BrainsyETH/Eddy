import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { STRETCH_READS_ENABLED, withoutPausedStretches } from './stretch-reads';
import { getUpdateTargets } from '../../data/river-sections';

test('stretch Reads are paused', () => {
  // Nothing on the website or in the app shows a stretch Read. Flipping this
  // back on should be a decision somebody makes, not a default that drifts.
  assert.equal(STRETCH_READS_ENABLED, false);
});

test('paused, only whole-river targets are generated', () => {
  const all = getUpdateTargets();
  assert.ok(all.some((t) => t.sectionSlug != null), 'the legacy list should include stretches to filter');

  const paused = withoutPausedStretches(all, false);
  assert.ok(paused.length > 0);
  assert.ok(paused.every((t) => t.sectionSlug == null));
  // One per river, and no river lost: the river Read is what people see.
  assert.deepEqual(
    paused.map((t) => t.riverSlug).sort(),
    [...new Set(all.map((t) => t.riverSlug))].sort(),
  );
});

test('enabled, every target is kept', () => {
  const all = getUpdateTargets();
  assert.deepEqual(withoutPausedStretches(all, true), all);
});

test('every way update-targets returns a list goes through the pause', () => {
  // The loader has a database path and two fallbacks to the legacy list. A
  // fallback that skipped the filter would bring stretch Reads back on exactly
  // the day the database query failed.
  const source = readFileSync('src/lib/eddy/update-targets.ts', 'utf8');
  const fn = source.slice(source.indexOf('export async function getUpdateTargetsFromDb'));
  const returns = [...fn.matchAll(/^\s+return (.+);$/gm)].map((m) => m[1]);
  assert.equal(returns.length, 4);
  // The cache holds an already-filtered list; the other three filter on the way out.
  assert.deepEqual(returns.filter((r) => !r.startsWith('withoutPausedStretches(')), ['cached.targets']);
  assert.match(fn, /cached = \{ targets: withoutPausedStretches\(targets\)/);
});
