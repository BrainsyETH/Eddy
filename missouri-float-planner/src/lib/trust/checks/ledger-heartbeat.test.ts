import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveHeartbeatFindings } from './ledger-heartbeat';
import type { CheckHeartbeat } from '../heartbeat';

const NOW = new Date('2026-08-05T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

test('a check running on schedule produces no finding', () => {
  const beats: CheckHeartbeat[] = [
    { checkId: 'validate_river_data', cadence: 'hourly', lastStartedAt: hoursAgo(1) },
  ];
  assert.deepEqual(deriveHeartbeatFindings(beats, NOW, 10), []);
});

test('a check that fell behind while the tick kept running is a finding', () => {
  // The gap this check closes: the whole-ledger watchdog stays green because
  // the OTHER checks keep the heartbeat alive, so one wedged check was visible
  // only to somebody already looking at the console.
  const beats: CheckHeartbeat[] = [
    { checkId: 'validate_river_data', cadence: 'hourly', lastStartedAt: hoursAgo(1) },
    { checkId: 'river_geometry', cadence: 'daily', lastStartedAt: hoursAgo(200) },
  ];
  const findings = deriveHeartbeatFindings(beats, NOW, 10);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].entityKey, 'river_geometry');
  assert.equal(findings[0].ruleKey, 'check_not_running');
});

test('the finding says silence is not evidence of health', () => {
  const beats: CheckHeartbeat[] = [
    { checkId: 'x', cadence: 'hourly', lastStartedAt: hoursAgo(50) },
  ];
  assert.match(deriveHeartbeatFindings(beats, NOW, 10)[0].detail, /not evidence of health/);
});

test('a never-run check is reported only once the scheduler had chances', () => {
  const beats: CheckHeartbeat[] = [{ checkId: 'new', cadence: 'daily', lastStartedAt: null }];
  assert.deepEqual(deriveHeartbeatFindings(beats, NOW, 1), []);
  assert.equal(deriveHeartbeatFindings(beats, NOW, 2).length, 1);
});
