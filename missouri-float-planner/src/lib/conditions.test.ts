import assert from 'node:assert/strict';
import test from 'node:test';
import { computeCondition, type ConditionThresholds } from './conditions';

// A ft-primary ladder in the shape the Ozark rivers actually use.
const FT: ConditionThresholds = {
  levelTooLow: 1.0,
  levelLow: 1.5,
  levelOptimalMin: 2.0,
  levelOptimalMax: 4.0,
  levelHigh: 4.0,
  levelDangerous: 8.0,
  thresholdUnit: 'ft',
};

// A cfs-primary ladder (Gasconade/Black style).
const CFS: ConditionThresholds = {
  levelTooLow: 100,
  levelLow: 200,
  levelOptimalMin: 400,
  levelOptimalMax: 1200,
  levelHigh: 1200,
  levelDangerous: 4000,
  thresholdUnit: 'cfs',
};

// ── the ladder ───────────────────────────────────────────────────

test('classifies each band of a ft ladder', () => {
  assert.equal(computeCondition(9.0, FT).code, 'dangerous');
  assert.equal(computeCondition(5.0, FT).code, 'high');
  assert.equal(computeCondition(3.0, FT).code, 'flowing');
  assert.equal(computeCondition(1.7, FT).code, 'good');
  assert.equal(computeCondition(1.2, FT).code, 'low');
  assert.equal(computeCondition(0.5, FT).code, 'too_low');
});

test('band boundaries are inclusive where the ladder says so', () => {
  assert.equal(computeCondition(8.0, FT).code, 'dangerous', 'dangerous is >=');
  assert.equal(computeCondition(4.0, FT).code, 'flowing', 'high is strictly > highStart');
  assert.equal(computeCondition(4.01, FT).code, 'high');
  assert.equal(computeCondition(2.0, FT).code, 'flowing');
  assert.equal(computeCondition(1.5, FT).code, 'good');
  assert.equal(computeCondition(1.0, FT).code, 'low');
});

test('a missing reading is unknown, not a fabricated band', () => {
  assert.equal(computeCondition(null, FT).code, 'unknown');
});

// ── flood-stage override ─────────────────────────────────────────
// Mirrors the is_flood branch of get_river_condition (migration 00166).
// Before this existed, the website could read "Dangerous" while the alert
// engine stayed silent on the very same reading.

test('flood stage forces dangerous even below the editorial dangerous band', () => {
  const th = { ...FT, floodStageFt: 6.0 };
  // 6.5 ft is under levelDangerous (8.0) — without the override this is "high".
  assert.equal(computeCondition(6.5, th).code, 'dangerous');
  assert.equal(computeCondition(6.5, FT).code, 'high', 'control: no flood stage set');
});

test('flood stage is inclusive at the threshold', () => {
  const th = { ...FT, floodStageFt: 6.0 };
  assert.equal(computeCondition(6.0, th).code, 'dangerous');
  assert.equal(computeCondition(5.99, th).code, 'high');
});

test('flood stage applies to cfs-primary gauges via the stage reading', () => {
  // The NWS publishes flood stage in FEET only, so it must work even when the
  // gauge is classified in cfs.
  const th = { ...CFS, floodStageFt: 15.0 };
  assert.equal(computeCondition(16.0, th, 500).code, 'dangerous');
  assert.equal(computeCondition(10.0, th, 500).code, 'flowing', 'below flood stage: normal ladder');
});

test('flood stage wins even when the primary unit has no reading', () => {
  // The safety property: a cfs gauge whose discharge sensor died but whose
  // stage is above flood must NOT degrade to `unknown`. The RPC checks
  // is_flood before its null guard; so must we.
  const th = { ...CFS, floodStageFt: 15.0 };
  assert.equal(computeCondition(16.0, th, null, { strictUnit: true }).code, 'dangerous');
  assert.equal(computeCondition(16.0, th, null).code, 'dangerous');
});

test('no flood stage configured leaves the ladder untouched', () => {
  assert.equal(computeCondition(9.0, { ...FT, floodStageFt: null }).code, 'dangerous');
  assert.equal(computeCondition(3.0, { ...FT, floodStageFt: null }).code, 'flowing');
});

// ── strictUnit: the false-alert fix ──────────────────────────────

test('strictUnit rejects the cross-unit fallback for a ft gauge', () => {
  // THE BUG: an ft-threshold gauge that loses its stage sensor used to compare
  // DISCHARGE against FEET thresholds — 1200 cfs vs levelDangerous 8.0 ft —
  // manufacturing a `dangerous` that got posted publicly.
  assert.equal(computeCondition(null, FT, 1200).code, 'dangerous', 'legacy lenient behavior');
  assert.equal(computeCondition(null, FT, 1200, { strictUnit: true }).code, 'unknown');
});

test('strictUnit rejects the mirror case for a cfs gauge', () => {
  // A cfs gauge with only a stage reading: 2.1 ft falls below even the 100 cfs
  // too_low floor, so a perfectly healthy river publicly reads "Too Low".
  assert.equal(computeCondition(2.1, CFS, null).code, 'too_low', 'legacy lenient behavior');
  assert.equal(computeCondition(2.1, CFS, null, { strictUnit: true }).code, 'unknown');
});

test('strictUnit is a no-op when the primary unit has a value', () => {
  for (const value of [0.5, 1.2, 1.7, 3.0, 5.0, 9.0]) {
    assert.equal(
      computeCondition(value, FT, 999, { strictUnit: true }).code,
      computeCondition(value, FT, 999).code,
      `ft ${value} should classify identically`
    );
  }
  for (const value of [50, 150, 300, 800, 2000, 5000]) {
    assert.equal(
      computeCondition(null, CFS, value, { strictUnit: true }).code,
      computeCondition(null, CFS, value).code,
      `cfs ${value} should classify identically`
    );
  }
});

// ── back-compat lock for the ~24 existing importers ──────────────

test('default options reproduce the legacy behavior exactly', () => {
  // Guards every display call site that does NOT pass options: the lenient
  // fallback must survive until the SQL side is migrated in lockstep.
  assert.equal(computeCondition(null, FT, 1200).code, 'dangerous');
  assert.equal(computeCondition(null, CFS, null).code, 'unknown');
  assert.equal(computeCondition(3.0, FT).code, 'flowing');
});

// ── partial ladders ──────────────────────────────────────────────

test('a partial ladder with only optimal_min uses it as the good floor', () => {
  const partial: ConditionThresholds = {
    levelTooLow: null,
    levelLow: null,
    levelOptimalMin: 400,
    levelOptimalMax: null,
    levelHigh: null,
    levelDangerous: null,
    thresholdUnit: 'cfs',
  };
  assert.equal(computeCondition(null, partial, 500).code, 'good');
  assert.equal(computeCondition(null, partial, 300).code, 'too_low');
});
