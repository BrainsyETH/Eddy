// missouri-float-planner/src/lib/float-permissions.test.ts
//
// Covers eddy-ios/src/lib/floatPermissions.ts and floatTrackerStatus.ts: what
// each location permission state lets a float do, what the stream is actually
// doing, and that the screen never promises more than either.

import assert from 'node:assert/strict';
import test from 'node:test';
import { startLocationState, trackingMode } from '../../../eddy-ios/src/lib/floatPermissions';
import { createTrackerStatusStore, trackingLine, type TrackerState } from '../../../eddy-ios/src/lib/floatTrackerStatus';

const running = (status: TrackerState['status'], backgroundFailed = false): TrackerState => ({ status, backgroundFailed });

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

test('locked-phone tracking is promised only while the background stream runs', () => {
  assert.match(trackingLine('locked', running('background'))!.text, /carries on with your phone locked/);
  assert.equal(trackingLine('locked', running('background'))!.action, 'info');
  // The bug: "Always" granted, the background start failed, tracking fell
  // back to the foreground, and the screen still said it carried on locked.
  const fellBack = trackingLine('locked', running('foreground', true))!;
  assert.doesNotMatch(fellBack.text, /carries on/);
  assert.match(fellBack.text, /pauses while your phone is locked/);
  assert.equal(fellBack.action, 'retry');
  for (const status of ['starting', 'foreground', 'failed', 'blocked', 'idle'] as const) {
    assert.doesNotMatch(trackingLine('locked', running(status))?.text ?? '', /carries on/, status);
  }
});

test('While Using says tracking pauses when locked, and points to Settings', () => {
  const line = trackingLine('screen-on', running('foreground'))!;
  assert.match(line.text, /pauses while your phone is locked/);
  assert.equal(line.action, 'settings');
});

test('a failed start offers a retry; a permission problem wins over the stream', () => {
  assert.equal(trackingLine('locked', running('failed'))!.action, 'retry');
  assert.equal(trackingLine('screen-on', running('failed'))!.action, 'retry');
  assert.equal(trackingLine('approximate', running('foreground'))!.action, 'settings');
  assert.equal(trackingLine('none', running('blocked'), true)!.action, 'request');
  assert.equal(trackingLine('none', running('blocked'), false)!.action, 'settings');
  assert.equal(trackingLine('locked', running('idle')), null);
  assert.equal(trackingLine('unknown', running('idle')), null);
});

test('the tracker status store notifies on change only, and Retry reaches the registered tracker', () => {
  const store = createTrackerStatusStore();
  let heard = 0;
  store.subscribe(() => (heard += 1));
  store.set(running('starting'));
  store.set(running('starting'));
  store.set(running('foreground', true));
  assert.equal(heard, 2);
  let retried = 0;
  store.retry();
  store.onRetry(() => (retried += 1));
  store.retry();
  store.onRetry(null);
  store.retry();
  assert.equal(retried, 1);
});

test('start setup distinguishes first prompt, Settings, precision, and disabled services', () => {
  assert.equal(startLocationState(null, true), 'checking');
  assert.equal(startLocationState({ status: 'undetermined', canAskAgain: true }, true), 'request');
  assert.equal(startLocationState({ status: 'denied', canAskAgain: true }, true), 'request');
  assert.equal(startLocationState({ status: 'denied', canAskAgain: false }, true), 'settings');
  assert.equal(startLocationState({ status: 'granted', ios: { accuracy: 'reduced' } }, true), 'precise');
  assert.equal(startLocationState({ status: 'granted', ios: { accuracy: 'full' } }, true), 'ready');
  assert.equal(startLocationState({ status: 'granted' }, false), 'services');
  assert.equal(startLocationState({ status: 'denied', canAskAgain: false }, false), 'services');
});
