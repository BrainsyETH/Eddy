import assert from 'node:assert/strict';
import test from 'node:test';
import { compareVersions, isUpgradeRequired } from '../../../packages/eddy-types/index';

// The version gate is the one lever that can lock a user out of the app
// entirely, so its edge cases matter more than its happy path.

test('orders versions numerically, not lexically', () => {
  assert.ok(compareVersions('1.0.0', '1.0.1') < 0);
  assert.ok(compareVersions('1.1.0', '1.0.9') > 0);
  assert.equal(compareVersions('2.3.4', '2.3.4'), 0);
  // The classic string-comparison bug: "10" sorts before "9" as text.
  assert.ok(compareVersions('1.10.0', '1.9.0') > 0);
  assert.ok(compareVersions('0.2.0', '0.10.0') < 0);
});

test('treats missing segments as zero', () => {
  assert.equal(compareVersions('1.2', '1.2.0'), 0);
  assert.equal(compareVersions('1', '1.0.0'), 0);
  assert.ok(compareVersions('1.2', '1.2.1') < 0);
});

test('malformed segments degrade to zero rather than NaN', () => {
  // NaN comparisons are always false, which would make a garbage version
  // read as "not below the floor" and slip past the gate.
  assert.equal(compareVersions('1.x.0', '1.0.0'), 0);
  assert.ok(compareVersions('abc', '0.0.1') < 0);
  assert.equal(compareVersions('', '0.0.0'), 0);
});

test('an outdated build is required to upgrade', () => {
  assert.equal(isUpgradeRequired('1.0.0', '1.2.0'), true);
  assert.equal(isUpgradeRequired('0.9.9', '1.0.0'), true);
});

test('a current or newer build is not', () => {
  assert.equal(isUpgradeRequired('1.2.0', '1.2.0'), false);
  assert.equal(isUpgradeRequired('2.0.0', '1.2.0'), false);
});

test('the gate fails OPEN when either version is unknown', () => {
  // Locking someone out because config was unreadable is far worse than
  // briefly letting an old build through. Matches /api/app-config, which
  // serves permissive defaults rather than an error.
  assert.equal(isUpgradeRequired(null, '1.2.0'), false);
  assert.equal(isUpgradeRequired('1.0.0', null), false);
  assert.equal(isUpgradeRequired(undefined, undefined), false);
  assert.equal(isUpgradeRequired('', '1.2.0'), false);
});

test('the default floor of 0.0.0 never locks anyone out', () => {
  // What the migration seeds, so a fresh install must always pass.
  for (const v of ['0.0.1', '0.1.0', '1.0.0', '99.0.0']) {
    assert.equal(isUpgradeRequired(v, '0.0.0'), false, `${v} should be allowed`);
  }
});
