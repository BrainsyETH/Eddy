import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyExisting, type ExistingFindingRow } from './ledger';

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
