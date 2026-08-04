import assert from 'node:assert/strict';
import test from 'node:test';
import { assessHeartbeat, isLedgerSilent, OVERDUE_MULTIPLIER } from './heartbeat';

const NOW = new Date('2026-08-05T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

// ── the hole this fills ──────────────────────────────────────────

test('a check that stopped running is reported overdue', () => {
  // The regression this guards: every reconcile.ts refusal protects against a
  // check LYING. None protects against the ledger going SILENT — no rows
  // written, no finding changed, and a console that looks calm because nothing
  // is disagreeing with it.
  const v = assessHeartbeat(
    { checkId: 'validate_river_data', cadence: 'hourly', lastStartedAt: hoursAgo(9) },
    NOW,
  );
  assert.equal(v.overdue, true);
  assert.equal(v.hoursLate, 6.5);
});

test('a daily check is judged against 24h, not 1h', () => {
  const v = assessHeartbeat(
    { checkId: 'river_geometry', cadence: 'daily', lastStartedAt: hoursAgo(20) },
    NOW,
  );
  assert.equal(v.overdue, false);
});

test('ordinary lateness is tolerated', () => {
  // Cron times wander, runs take a minute, a deploy mid-tick skips a pass. None
  // of that is a fault, and a watchdog that fires on it gets ignored — which
  // costs more than the thing it was watching for.
  const v = assessHeartbeat(
    { checkId: 'validate_river_data', cadence: 'hourly', lastStartedAt: hoursAgo(2) },
    NOW,
  );
  assert.equal(v.overdue, false);
  assert.equal(OVERDUE_MULTIPLIER, 2.5);
});

test('the boundary is exclusive', () => {
  const at = assessHeartbeat(
    { checkId: 'x', cadence: 'hourly', lastStartedAt: hoursAgo(2.5) },
    NOW,
  );
  const past = assessHeartbeat(
    { checkId: 'x', cadence: 'hourly', lastStartedAt: hoursAgo(2.6) },
    NOW,
  );
  assert.equal(at.overdue, false);
  assert.equal(past.overdue, true);
});

// ── the case that would make it noise ────────────────────────────

test('a check that has never run is not overdue', () => {
  // Almost always a check that shipped minutes ago and has not reached its
  // first tick. Reporting it as a dead heartbeat would fire on every deploy
  // that adds a check — schema_invariants did exactly that today.
  const v = assessHeartbeat({ checkId: 'brand_new', cadence: 'daily', lastStartedAt: null }, NOW);
  assert.equal(v.overdue, false);
  assert.equal(v.hoursLate, null);
  assert.match(v.detail, /never run/);
});

// ── the independent half ─────────────────────────────────────────

test('a silent ledger is detected from the most recent run of any check', () => {
  // From outside the ledger this is the only question worth asking: one wedged
  // check is a finding, a dead scheduler is an outage.
  assert.deepEqual(isLedgerSilent(hoursAgo(5), NOW), { silent: true, hoursSinceLastRun: 5 });
  assert.deepEqual(isLedgerSilent(hoursAgo(1), NOW), { silent: false, hoursSinceLastRun: 1 });
});

test('an empty ledger is not silent', () => {
  // Nothing has ever run because nothing has been deployed yet. Firing here
  // would page on a fresh database.
  assert.deepEqual(isLedgerSilent(null, NOW), { silent: false, hoursSinceLastRun: null });
});

test('the silence tolerance is adjustable for a caller on a different clock', () => {
  assert.equal(isLedgerSilent(hoursAgo(5), NOW, 8).silent, false);
});

test('detail lines name the check, so a log line is readable alone', () => {
  const v = assessHeartbeat(
    { checkId: 'schema_invariants', cadence: 'daily', lastStartedAt: hoursAgo(100) },
    NOW,
  );
  assert.match(v.detail, /schema_invariants/);
  assert.match(v.detail, /daily/);
});
