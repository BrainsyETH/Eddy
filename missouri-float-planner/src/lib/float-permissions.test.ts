// missouri-float-planner/src/lib/float-permissions.test.ts
//
// Covers eddy-ios/src/lib/floatPermissions.ts: what each location permission
// state lets a float do, and that the screen never promises more.

import assert from 'node:assert/strict';
import test from 'node:test';
import { trackingMode, trackingNotice } from '../../../eddy-ios/src/lib/floatPermissions';

test('each permission state maps to what tracking can actually do', () => {
  const precise = { status: 'granted', ios: { accuracy: 'full' as const } };
  assert.equal(trackingMode(null, null), 'unknown');
  assert.equal(trackingMode({ status: 'denied' }, null), 'none');
  assert.equal(trackingMode({ status: 'undetermined' }, null), 'none');
  assert.equal(trackingMode(precise, { status: 'granted' }), 'locked');
  // While Using, and Allow Once (a session grant), cannot track while locked.
  assert.equal(trackingMode(precise, { status: 'denied' }), 'screen-on');
  assert.equal(trackingMode(precise, null), 'screen-on');
  // Approximate location cannot place anyone on a river, Always or not.
  assert.equal(trackingMode({ status: 'granted', ios: { accuracy: 'reduced' } }, { status: 'granted' }), 'approximate');
});

test('only full locked-screen tracking goes without a notice', () => {
  assert.equal(trackingNotice('locked'), null);
  assert.match(trackingNotice('screen-on')!.text, /pauses while your screen is locked/);
  assert.equal(trackingNotice('approximate')!.action, 'settings');
});

test('the prompt is offered only while iOS will still show it', () => {
  assert.equal(trackingNotice('none', true)!.action, 'request');
  assert.equal(trackingNotice('none', false)!.action, 'settings');
});
