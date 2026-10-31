// missouri-float-planner/src/lib/float-activity-visibility.test.ts
//
// Covers eddy-ios/src/lib/floatActivityVisibility.ts: "Hide Lock Screen card"
// is remembered for that float only, survives a relaunch, and a choice made
// before the stored one is read is not undone by it.

import assert from 'node:assert/strict';
import test from 'node:test';
import { HIDDEN_ACTIVITY_KEY, createFloatActivityVisibility, floatActivityControlState, type VisibilityStorage } from '../../../eddy-ios/src/lib/floatActivityVisibility';

function disk(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const storage: VisibilityStorage & { data: Map<string, string>; fail: boolean } = {
    data,
    fail: false,
    async getItem(key) { if (storage.fail) throw new Error('read'); return data.get(key) ?? null; },
    async setItem(key, value) { if (storage.fail) throw new Error('write'); data.set(key, value); },
    async removeItem(key) { if (storage.fail) throw new Error('write'); data.delete(key); },
  };
  return storage;
}

test('hiding applies to that float only and is stored', async () => {
  const storage = disk();
  const visibility = createFloatActivityVisibility(storage);
  let changes = 0;
  visibility.subscribe(() => changes++);
  await visibility.setHidden('float-1', true);
  assert.equal(visibility.isHidden('float-1'), true);
  assert.equal(visibility.isHidden('float-2'), false);
  assert.equal(visibility.isHidden(null), false);
  assert.equal(storage.data.get(HIDDEN_ACTIVITY_KEY), 'float-1');
  assert.equal(changes, 1);
  // Showing another float's card does not unhide this one.
  await visibility.setHidden('float-2', false);
  assert.equal(visibility.isHidden('float-1'), true);
  await visibility.setHidden('float-1', false);
  assert.equal(visibility.isHidden('float-1'), false);
  assert.equal(storage.data.has(HIDDEN_ACTIVITY_KEY), false);
});

test('a relaunch keeps the card hidden; ending the float forgets it', async () => {
  const storage = disk({ [HIDDEN_ACTIVITY_KEY]: 'float-1' });
  const visibility = createFloatActivityVisibility(storage);
  assert.equal(visibility.isHidden('float-1'), false, 'unknown until read');
  await visibility.ensureLoaded();
  assert.equal(visibility.isHidden('float-1'), true);
  await visibility.clear();
  assert.equal(visibility.hiddenSession(), null);
  assert.equal(storage.data.has(HIDDEN_ACTIVITY_KEY), false);
});

test('a choice made before the stored one is read wins', async () => {
  const storage = disk({ [HIDDEN_ACTIVITY_KEY]: 'float-old' });
  const visibility = createFloatActivityVisibility(storage);
  const loading = visibility.ensureLoaded();
  await visibility.setHidden('float-1', true);
  await loading;
  assert.equal(visibility.hiddenSession(), 'float-1');
});

test('storage failures never throw; memory still answers', async () => {
  const storage = disk();
  storage.fail = true;
  const warnings: string[] = [];
  const visibility = createFloatActivityVisibility(storage, (message) => warnings.push(message));
  await visibility.ensureLoaded();
  await visibility.setHidden('float-1', true);
  assert.equal(visibility.isHidden('float-1'), true);
  assert.equal(warnings.length, 2);
});


test('Lock Screen switch reflects the actual card and explicit visibility choice', () => {
  assert.equal(floatActivityControlState('active', false).on, true);
  assert.equal(floatActivityControlState('active', true).on, false);
  for (const availability of ['idle', 'dismissed', 'expired', 'disabled', 'error', 'unavailable'] as const) {
    assert.equal(floatActivityControlState(availability, false).on, false, availability);
  }
  assert.equal(floatActivityControlState('unavailable', false).visible, false);
  assert.equal(floatActivityControlState('idle', false).visible, true);
});

test('Lock Screen problems retain an explanation and disabled iOS settings get an action', () => {
  assert.equal(floatActivityControlState('disabled', false).settings, true);
  assert.match(floatActivityControlState('disabled', false).note!, /iOS Settings/);
  assert.match(floatActivityControlState('error', false).note!, /Tracking continues/);
  assert.match(floatActivityControlState('expired', false).note!, /eight hours/);
  assert.equal(floatActivityControlState('expired', true).note, null, 'a deliberately hidden card is not an expiry prompt');
  assert.equal(floatActivityControlState('active', false).settings, false);
});
