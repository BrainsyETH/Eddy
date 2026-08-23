import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeGaugeHistory } from './history-normalize';

const READINGS = [
  { timestamp: '2026-08-20T00:00:00Z', gaugeHeightFt: 3.1, dischargeCfs: 900, qualifiers: ['P'] },
  { timestamp: '2026-08-21T00:00:00Z', gaugeHeightFt: 3.4, dischargeCfs: 1100, qualifiers: [] },
];

test('a payload with no readings array is not a payload', () => {
  assert.equal(normalizeGaugeHistory(null), null);
  assert.equal(normalizeGaugeHistory(undefined), null);
  assert.equal(normalizeGaugeHistory({} as never), null);
});

test('a pre-Release-3 payload is derived into shape, not defaulted to null', () => {
  // The rule: derive where a derivation exists. observedThrough is knowable
  // from the readings, the coverage window IS the series' span, and the
  // seasonal range is knowable from `typical` — an old payload stays honest.
  const normalized = normalizeGaugeHistory({
    siteId: '07067000',
    siteName: 'Current River at Van Buren',
    readings: READINGS,
    typical: [{ date: '2026-08-20', p25Cfs: 500, p50Cfs: 800, p75Cfs: 1300, yearsOfRecord: 105 }],
  });
  assert.ok(normalized);
  assert.equal(normalized.observedThrough, '2026-08-21T00:00:00Z');
  assert.deepEqual(normalized.coverageWindow, {
    from: '2026-08-20T00:00:00Z',
    to: '2026-08-21T00:00:00Z',
  });
  // Old servers clamped the request BEFORE serving, so the served window was
  // the honored one — an old payload is complete, not suspect.
  assert.equal(normalized.coverageComplete, true);
  assert.equal(normalized.resolution, 'instant');
  assert.equal(normalized.statistic, 'instantaneous');
  assert.deepEqual(normalized.seasonalRange, [
    { date: '2026-08-20', unit: 'cfs', p25: 500, p50: 800, p75: 1300, yearsOfRecord: 105 },
  ]);
});

test('server-sent fields win over every derivation', () => {
  const normalized = normalizeGaugeHistory({
    siteId: 'x',
    siteName: 'x',
    readings: READINGS,
    resolution: 'daily',
    statistic: 'daily_mean',
    coverageComplete: false,
    truncationReason: 'The source holds less history than the requested window',
    coverageWindow: { from: '2026-01-01T00:00:00Z', to: '2026-08-21T00:00:00Z' },
  });
  assert.ok(normalized);
  assert.equal(normalized.resolution, 'daily');
  assert.equal(normalized.statistic, 'daily_mean');
  assert.equal(normalized.coverageComplete, false);
  assert.equal(normalized.coverageWindow?.from, '2026-01-01T00:00:00Z');
  assert.match(normalized.truncationReason ?? '', /less history/);
});

test('a forecast-only payload normalizes with an empty observed series', () => {
  // readings: [] is a served response now — the endpoint stopped 404ing
  // forecast-only stations — and the normalizer must not turn it into null.
  const normalized = normalizeGaugeHistory({
    siteId: 'BDPM7',
    siteName: 'Big Piney',
    readings: [],
    forecast: [{ timestamp: '2026-08-24T00:00:00Z', gaugeHeightFt: 12, dischargeCfs: null }],
  });
  assert.ok(normalized);
  assert.equal(normalized.readings.length, 0);
  assert.equal(normalized.observedThrough, null);
  assert.equal(normalized.coverageWindow, null);
  assert.equal(normalized.forecast.length, 1);
});

// ── the guard ────────────────────────────────────────────────────

test('both platforms run THIS normalizer at their fetch boundary', () => {
  // The regression this prevents: the web hook normalized while the phone
  // passed raw JSON through, so every added field was a chance for the two
  // to disagree about the same payload. Release 3 added seven at once.
  const repoRoot = join(__dirname, '..', '..');
  const web = readFileSync(
    join(repoRoot, 'missouri-float-planner/src/hooks/useGaugeHistory.ts'),
    'utf-8',
  );
  const app = readFileSync(join(repoRoot, 'eddy-ios/src/api/client.ts'), 'utf-8');
  assert.match(web, /normalizeGaugeHistory/, 'web hook no longer runs the shared normalizer');
  assert.match(app, /normalizeGaugeHistory/, 'iOS client no longer runs the shared normalizer');
});
