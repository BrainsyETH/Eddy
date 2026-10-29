// missouri-float-planner/src/lib/float-permissions.test.ts
//
// Covers eddy-ios/src/lib/floatPermissions.ts (whether a float can start)
// and floatTrackerStatus.ts (what River Mode says about tracking, from the
// native recorder's own diagnostics), and that the screen never promises more
// than the recorder reports.

import assert from 'node:assert/strict';
import test from 'node:test';
import { preciseLocationAction, startLocationState } from '../../../eddy-ios/src/lib/floatPermissions';
import { IDLE_TRACKER, type TrackerState } from '../../../eddy-ios/src/lib/floatRecording';
import { createTrackerStatusStore, trackingLine } from '../../../eddy-ios/src/lib/floatTrackerStatus';

const tracker = (status: TrackerState['status'], extra: Partial<TrackerState> = {}): TrackerState => ({
  ...IDLE_TRACKER,
  status,
  ...extra,
});

test('locked-phone tracking is promised only while the recorder reports recording with nothing blocking it', () => {
  const ok = trackingLine(tracker('recording'))!;
  assert.match(ok.text, /carries on with your phone locked/);
  assert.equal(ok.action, 'info');
  for (const status of ['starting', 'failed', 'unavailable'] as const) {
    assert.doesNotMatch(trackingLine(tracker(status))?.text ?? '', /carries on/, status);
  }
  for (const blocked of [{ servicesOff: true }, { denied: true }, { preciseOff: true }, { notInUse: true }]) {
    assert.doesNotMatch(trackingLine(tracker('recording', blocked))!.text, /carries on/, JSON.stringify(blocked));
  }
});

test('the most fundamental block is the one shown, with the action that fixes it', () => {
  const everything = tracker('recording', { servicesOff: true, denied: true, preciseOff: true, notInUse: true });
  assert.match(trackingLine(everything)!.text, /Location Services are off/);
  assert.equal(trackingLine(everything)!.action, 'settings');
  assert.equal(trackingLine(tracker('recording', { denied: true }), true)!.action, 'request');
  assert.equal(trackingLine(tracker('recording', { denied: true }), false)!.action, 'settings');
  assert.match(trackingLine(tracker('recording', { preciseOff: true }))!.text, /Precise Location is off/);
  assert.equal(trackingLine(tracker('recording', { notInUse: true }))!.action, 'retry');
});

test('a failed recorder offers a retry; no float says nothing; a build without the recorder says so', () => {
  assert.equal(trackingLine(tracker('failed'))!.action, 'retry');
  assert.equal(trackingLine(IDLE_TRACKER), null);
  assert.match(trackingLine(tracker('unavailable'))!.text, /isn’t available in this version/);
  assert.equal(trackingLine(tracker('starting'))!.action, 'info');
});

test('the tracker status store notifies on change only, and Retry reaches the registered handler', () => {
  const store = createTrackerStatusStore();
  let heard = 0;
  store.subscribe(() => (heard += 1));
  store.set(tracker('starting'));
  store.set(tracker('starting'));
  store.set(tracker('recording', { preciseOff: true }));
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

test('Precise Location off is asked for in Eddy first; Settings only once that is declined or unavailable', () => {
  assert.equal(preciseLocationAction(false, true), 'ask');
  assert.equal(preciseLocationAction(true, true), 'settings');
  assert.equal(preciseLocationAction(false, false), 'settings', 'a build without the native prompt');
});
