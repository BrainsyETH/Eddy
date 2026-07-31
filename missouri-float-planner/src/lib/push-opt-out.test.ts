import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isDeviceOptedOut,
  setDeviceOptedOut,
  type PushOptOutStorage,
} from '../../../eddy-ios/src/lib/pushOptOut';

function memoryStorage(): PushOptOutStorage {
  const values = new Map<string, string>();
  return {
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) { values.set(key, value); },
    async removeItem(key) { values.delete(key); },
  };
}

test('a device opt-out survives refreshes until explicitly cleared', async () => {
  const storage = memoryStorage();
  await setDeviceOptedOut(true, storage);
  assert.equal(await isDeviceOptedOut(storage), true);
  await setDeviceOptedOut(false, storage);
  assert.equal(await isDeviceOptedOut(storage), false);
});

test('storage write failures are observable so the UI cannot claim persistence', async () => {
  const storage: PushOptOutStorage = {
    async getItem() { throw new Error('unavailable'); },
    async setItem() { throw new Error('unavailable'); },
    async removeItem() { throw new Error('unavailable'); },
  };
  assert.equal(await isDeviceOptedOut(storage), false);
  await assert.rejects(setDeviceOptedOut(true, storage), /unavailable/);
});
