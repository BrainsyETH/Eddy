import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyExisting, indexEmitted, type ExistingFindingRow } from './ledger';
import type { RawFinding } from './types';

const NOW = new Date('2026-08-04T12:00:00Z');

function row(overrides: Partial<ExistingFindingRow> = {}): ExistingFindingRow {
  return {
    id: 'id-1',
    fingerprint: 'fp-1',
    status: 'open',
    occurrences: 1,
    snoozed_until: null,
    ...overrides,
  };
}

test('open findings are resolvable', () => {
  const { openFingerprints, snoozedFingerprints } = classifyExisting([row()], NOW);
  assert.deepEqual(openFingerprints, ['fp-1']);
  assert.deepEqual(snoozedFingerprints, []);
});

test('resolved findings are in neither set', () => {
  // They are neither candidates for resolution nor shielded from it; if the
  // problem returns, reconcile.ts raises it fresh and the row is re-opened with
  // its original first_seen_at.
  const { openFingerprints, snoozedFingerprints } = classifyExisting(
    [row({ status: 'resolved' })],
    NOW,
  );
  assert.deepEqual(openFingerprints, []);
  assert.deepEqual(snoozedFingerprints, []);
});

test('a live snooze shields a finding from resolution', () => {
  const { openFingerprints, snoozedFingerprints } = classifyExisting(
    [row({ status: 'snoozed', snoozed_until: '2026-08-05T12:00:00Z' })],
    NOW,
  );
  assert.deepEqual(openFingerprints, []);
  assert.deepEqual(snoozedFingerprints, ['fp-1']);
});

// ── the expiry case this function exists for ─────────────────────

test('an expired snooze is treated as open again', () => {
  // The regression: a row still marked 'snoozed' whose deadline has passed
  // would otherwise be shielded from resolution forever — the ledger would
  // never close it even after a fix, and never re-surface it either. Nothing
  // sweeps these rows on a timer, so the read path has to do it.
  const { openFingerprints, snoozedFingerprints } = classifyExisting(
    [row({ status: 'snoozed', snoozed_until: '2026-08-04T11:59:00Z' })],
    NOW,
  );
  assert.deepEqual(openFingerprints, ['fp-1']);
  assert.deepEqual(snoozedFingerprints, []);
});

test('a snooze with no deadline is treated as open, not as forever', () => {
  // status='snoozed' with a null deadline is a malformed row — most likely a
  // failed write. Reading it as an indefinite shield would hide a finding with
  // no way to notice; reading it as open surfaces it and the operator can
  // snooze it again properly.
  const { openFingerprints, snoozedFingerprints } = classifyExisting(
    [row({ status: 'snoozed', snoozed_until: null })],
    NOW,
  );
  assert.deepEqual(openFingerprints, ['fp-1']);
  assert.deepEqual(snoozedFingerprints, []);
});

test('a mixed set partitions correctly', () => {
  const { openFingerprints, snoozedFingerprints } = classifyExisting(
    [
      row({ fingerprint: 'a', status: 'open' }),
      row({ fingerprint: 'b', status: 'snoozed', snoozed_until: '2026-09-01T00:00:00Z' }),
      row({ fingerprint: 'c', status: 'resolved' }),
      row({ fingerprint: 'd', status: 'snoozed', snoozed_until: '2026-01-01T00:00:00Z' }),
    ],
    NOW,
  );
  assert.deepEqual(openFingerprints.sort(), ['a', 'd']);
  assert.deepEqual(snoozedFingerprints, ['b']);
});

// ── Fingerprint collisions must not be absorbed ───────────────────────────
//
// The fingerprint excludes title, detail and evidence, so two findings collide
// exactly when a check emits the same rule twice for one entity. The map that
// indexes them used to be built with a bare .set(), which discarded all but the
// last — a check reporting fewer problems than it found, with nothing saying
// so. That is the same shape as the bug this whole pass started from:
// validate_river_data's access_point_offline rule could not fire for four
// migrations, and "zero findings" looked identical to "cannot produce
// findings".

function finding(over: Partial<RawFinding> = {}): RawFinding {
  return {
    entityType: 'river',
    entityKey: 'niangua',
    ruleKey: 'mileage_segment_implausible',
    title: 'niangua: mileage_segment_implausible',
    detail: 'Williams Ford Access to Moon Valley quotes 10.10 mi against 1.55 mi of line',
    ...over,
  };
}

test('two findings on one entity and rule are reported as a collision, not merged', () => {
  const { byFingerprint, collisions } = indexEmitted('validate_river_data', [
    finding({ detail: 'Williams Ford Access to Moon Valley' }),
    finding({ detail: 'Lead Mine Access to Herrick Ford' }),
  ]);

  assert.equal(byFingerprint.size, 1, 'they genuinely do share one fingerprint');
  assert.equal(collisions.length, 1, 'and that must be surfaced rather than absorbed');
  assert.match(collisions[0], /river:niangua\/mileage_segment_implausible/);
});

test('the first finding is kept, so a collision never also loses the original', () => {
  const { byFingerprint } = indexEmitted('validate_river_data', [
    finding({ title: 'first' }),
    finding({ title: 'second' }),
  ]);
  assert.deepEqual([...byFingerprint.values()].map((f) => f.title), ['first']);
});

test('the same rule on different entities does not collide', () => {
  const { byFingerprint, collisions } = indexEmitted('validate_river_data', [
    finding({ entityKey: 'niangua' }),
    finding({ entityKey: 'huzzah' }),
  ]);
  assert.equal(byFingerprint.size, 2);
  assert.deepEqual(collisions, []);
});

test('different rules on one entity do not collide', () => {
  const { byFingerprint, collisions } = indexEmitted('validate_river_data', [
    finding({ ruleKey: 'mileage_segment_implausible' }),
    finding({ ruleKey: 'mileage_order_mismatch' }),
  ]);
  assert.equal(byFingerprint.size, 2);
  assert.deepEqual(collisions, []);
});
