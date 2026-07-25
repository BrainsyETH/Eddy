import assert from 'node:assert/strict';
import test from 'node:test';
import { blockingQualifiers, gateReading, isFlatlined, type GateInput } from './gate';

const NOW = new Date('2026-07-25T12:00:00.000Z');
const FRESH = new Date('2026-07-25T11:45:00.000Z').toISOString();

function input(overrides: Partial<GateInput> = {}): GateInput {
  return {
    gaugeHeightFt: 3.2,
    dischargeCfs: 850,
    thresholdUnit: 'ft',
    readingAt: FRESH,
    now: NOW,
    ...overrides,
  };
}

// ── primary-unit only ────────────────────────────────────────────

test('accepts a clean reading and returns the primary-unit value', () => {
  const result = gateReading(input());
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value, 3.2);
    assert.equal(result.unit, 'ft');
    assert.equal(result.floodOverrideOnly, false);
  }
});

test('a cfs gauge is judged on discharge, not stage', () => {
  const result = gateReading(input({ thresholdUnit: 'cfs' }));
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value, 850);
});

test('rejects when the primary unit has no reading', () => {
  // The false-alert path: without this, discharge would be scored against
  // foot thresholds and manufacture a `dangerous`.
  const ft = gateReading(input({ gaugeHeightFt: null }));
  assert.deepEqual(ft, { ok: false, reason: 'no_primary_value' });

  const cfs = gateReading(input({ thresholdUnit: 'cfs', dischargeCfs: null }));
  assert.deepEqual(cfs, { ok: false, reason: 'no_primary_value' });
});

test('flood stage still passes when the primary sensor is out', () => {
  // Safety exception: a dead discharge sensor must not turn genuine flood
  // water into `unknown`.
  const result = gateReading(
    input({ thresholdUnit: 'cfs', dischargeCfs: null, gaugeHeightFt: 21.0, floodStageFt: 20.0 })
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value, null);
    assert.equal(result.floodOverrideOnly, true);
  }
});

test('a below-flood stage with a dead primary sensor is still rejected', () => {
  const result = gateReading(
    input({ thresholdUnit: 'cfs', dischargeCfs: null, gaugeHeightFt: 5.0, floodStageFt: 20.0 })
  );
  assert.deepEqual(result, { ok: false, reason: 'no_primary_value' });
});

// ── qualifiers ───────────────────────────────────────────────────

test('rejects readings flagged with suspect qualifiers', () => {
  for (const code of ['Ice', 'Eqp', 'e', 'Bkw', 'Mnt', 'Dis', '***']) {
    assert.deepEqual(
      gateReading(input({ qualifiers: [code] })),
      { ok: false, reason: 'suspect_qualifier' },
      `${code} should block`
    );
  }
});

test('provisional alone never blocks', () => {
  // Essentially every real-time USGS reading is provisional; blocking on it
  // would disable alerting entirely.
  assert.equal(gateReading(input({ qualifiers: ['P'] })).ok, true);
  assert.equal(gateReading(input({ qualifiers: ['A'] })).ok, true);
  assert.equal(gateReading(input({ qualifiers: [] })).ok, true);
  assert.equal(gateReading(input({ qualifiers: null })).ok, true);
});

test('discharge-only qualifiers do not block a stage-primary gauge', () => {
  // USGS merges qualifiers across parameters, so a zero-flow or seasonal flag
  // on the DISCHARGE series must not silence a ft gauge's stage alert.
  for (const code of ['ZFl', 'Ssn', 'Rat']) {
    assert.equal(
      gateReading(input({ thresholdUnit: 'ft', qualifiers: [code] })).ok,
      true,
      `${code} should not block a ft gauge`
    );
    assert.deepEqual(
      gateReading(input({ thresholdUnit: 'cfs', qualifiers: [code] })),
      { ok: false, reason: 'suspect_qualifier' },
      `${code} should block a cfs gauge`
    );
  }
});

test('blockingQualifiers reports only codes relevant to the primary unit', () => {
  assert.deepEqual(blockingQualifiers(['P', 'ZFl', 'Ice'], 'ft'), ['Ice']);
  assert.deepEqual(blockingQualifiers(['P', 'ZFl', 'Ice'], 'cfs'), ['ZFl', 'Ice']);
});

// ── staleness ────────────────────────────────────────────────────

test('rejects stale readings', () => {
  const old = new Date('2026-07-25T06:00:00.000Z').toISOString();
  assert.deepEqual(gateReading(input({ readingAt: old })), { ok: false, reason: 'stale' });
});

test('nws sites get a longer staleness window than usgs', () => {
  const fourHoursAgo = new Date('2026-07-25T08:00:00.000Z').toISOString();
  assert.deepEqual(
    gateReading(input({ readingAt: fourHoursAgo, provider: 'usgs' })),
    { ok: false, reason: 'stale' }
  );
  assert.equal(gateReading(input({ readingAt: fourHoursAgo, provider: 'nws' })).ok, true);
});

test('rejects timestamps implausibly in the future', () => {
  const future = new Date('2026-07-25T13:00:00.000Z').toISOString();
  assert.deepEqual(gateReading(input({ readingAt: future })), { ok: false, reason: 'future' });
});

test('tolerates small clock skew', () => {
  const slightlyAhead = new Date('2026-07-25T12:05:00.000Z').toISOString();
  assert.equal(gateReading(input({ readingAt: slightlyAhead })).ok, true);
});

test('a missing timestamp does not by itself reject', () => {
  assert.equal(gateReading(input({ readingAt: null })).ok, true);
});

// ── flatline ─────────────────────────────────────────────────────

test('rejects a stuck sensor', () => {
  assert.deepEqual(
    gateReading(input({ recentPrimaryValues: [3.2, 3.2, 3.2, 3.2, 3.2, 3.2] })),
    { ok: false, reason: 'flatline' }
  );
});

test('a moving series is not flatlined', () => {
  assert.equal(
    gateReading(input({ recentPrimaryValues: [3.2, 3.1, 3.0, 2.9, 2.8, 2.7] })).ok,
    true
  );
});

test('too few samples is not enough to call flatline', () => {
  assert.equal(isFlatlined([3.2, 3.2, 3.2]), false);
  assert.equal(isFlatlined([]), false);
  assert.equal(isFlatlined(undefined), false);
});

test('nulls are ignored when judging flatline', () => {
  assert.equal(isFlatlined([3.2, null, 3.2, null, 3.2]), false, 'only 3 real samples');
  assert.equal(isFlatlined([3.2, null, 3.2, 3.2, 3.2, 3.2, 3.2]), true);
});

// ── precedence ───────────────────────────────────────────────────

test('staleness is judged before qualifiers', () => {
  // Both bad — the reason should name the more fundamental problem.
  const old = new Date('2026-07-25T06:00:00.000Z').toISOString();
  assert.deepEqual(
    gateReading(input({ readingAt: old, qualifiers: ['Ice'] })),
    { ok: false, reason: 'stale' }
  );
});
