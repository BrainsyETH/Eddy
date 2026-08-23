import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeTrend } from '@/lib/gauge-trend';

// ── The embed widget's trend arrow ───────────────────────────────
//
// It was wrong twice at once, and the two wrongs did not cancel: the widget
// requested `?hours=6` from a route that reads only `days` (silently getting
// the 7-day default), and then read `readings[0]` as the LATEST value — but
// the API serves oldest first, as the same file's chart code correctly noted
// three functions down. A rising river wore a falling arrow. The fix routes
// through computeTrend, the same ascending-order reader the river list uses;
// these are the fixtures that keep the direction unambiguous.

/** Oldest first, exactly as /api/gauges/[siteId]/history serves it. */
function ascendingReadings(values: number[]): { timestamp: string; gaugeHeightFt: number; dischargeCfs: null }[] {
  const start = Date.parse('2026-08-23T00:00:00Z');
  return values.map((value, index) => ({
    timestamp: new Date(start + index * 60 * 60 * 1000).toISOString(),
    gaugeHeightFt: value,
    dischargeCfs: null,
  }));
}

test('a steadily rising river reads as rising from an oldest-first payload', () => {
  // 2.0ft climbing to 3.2ft over six hours: nothing ambiguous about it. The
  // old readings[0]-as-latest arithmetic returned "falling" for exactly this.
  const trend = computeTrend(ascendingReadings([2.0, 2.2, 2.4, 2.7, 3.0, 3.2]), 'ft', 6);
  assert.ok(trend);
  assert.equal(trend.direction, 'rising');
});

test('a steadily falling river reads as falling', () => {
  const trend = computeTrend(ascendingReadings([3.2, 3.0, 2.7, 2.4, 2.2, 2.0]), 'ft', 6);
  assert.ok(trend);
  assert.equal(trend.direction, 'falling');
});

// ── the guard ────────────────────────────────────────────────────

test('the widget computes its arrow through computeTrend, over a real window', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/app/embed/widget/[slug]/page.tsx'),
    'utf-8',
  );
  assert.match(source, /computeTrend/, 'widget stopped using the shared trend reader');
  assert.doesNotMatch(
    source,
    /history\?hours=/,
    'the route reads only `days`; ?hours= silently returns the 7-day default',
  );
  assert.doesNotMatch(
    source,
    /const latest = data\.readings\[0\]/,
    'readings[0] is the OLDEST reading — treating it as latest inverts the arrow',
  );
});
