import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isDeviceOptedOut,
  setDeviceOptedOut,
  type PushOptOutStorage,
} from '../../../eddy-ios/src/lib/pushOptOut';
import {
  EMPTY_PUSH_LEDGER,
  REREGISTER_AFTER_MS,
  heldDeviceId,
  needsRegistration,
  readPushLedger,
  registered,
  released,
  unregistered,
  writePushLedger,
} from '../../../eddy-ios/src/lib/pushLedger';

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

// ── the registration ledger (pushLedger.ts) ─────────────────────────────────


const TOKEN = 'ExponentPushToken[abc]';
const ROW = '11111111-2222-4333-8444-555555555555';

test('an unchanged registration is not sent again within a day', () => {
  // Every foreground used to POST, against a fail-closed 30-per-15-minutes
  // limit: heavy app switching turned a healthy row into "Connecting now".
  const ledger = registered('A', TOKEN, ROW, 1_000);
  assert.equal(needsRegistration(ledger, 'A', TOKEN, 1_000 + 60_000), false);
  assert.equal(needsRegistration(ledger, 'A', TOKEN, 1_000 + REREGISTER_AFTER_MS), true, 'a day refreshes last_seen_at');
  assert.equal(needsRegistration(ledger, 'B', TOKEN, 2_000), true, 'another account');
  assert.equal(needsRegistration(ledger, 'A', 'ExponentPushToken[rotated]', 2_000), true, 'a rotated token');
  assert.equal(needsRegistration(ledger, 'A', TOKEN, 0), true, 'a clock behind the record');
  assert.equal(needsRegistration(EMPTY_PUSH_LEDGER, 'A', TOKEN, 0), true);
});

test('a sign-out whose unregister could not be sent leaves a release owed', () => {
  const ledger = registered('A', TOKEN, ROW, 1_000);
  const owed = unregistered(ledger, false);
  assert.deepEqual(owed.release, { expoPushToken: TOKEN, deviceId: ROW });
  assert.equal(owed.registration, null, 'the next account registers afresh');
  assert.deepEqual(released(owed).release, null);
});

test('a sign-out that reached the server owes nothing', () => {
  assert.deepEqual(unregistered(registered('A', TOKEN, ROW, 1_000), true), EMPTY_PUSH_LEDGER);
});

test('without the row id there is nothing a release could prove, so none is owed', () => {
  assert.equal(unregistered(registered('A', TOKEN, null, 1_000), false).release, null);
});

test('a registration that lands clears any release still owed', () => {
  // The owed release named this token's row; after a re-registration that row
  // belongs to the account that just signed in, and releasing it would
  // unregister them.
  const owed = unregistered(registered('A', TOKEN, ROW, 1_000), false);
  assert.ok(owed.release);
  assert.equal(registered('B', TOKEN, 'row-b', 2_000).release, null);
});

test('a registration carries the row id this install holds for the token, as proof', () => {
  // The server moves a token off another account only with that row's id:
  // knowing a token is not holding the device.
  const owed = unregistered(registered('A', TOKEN, ROW, 1_000), false);
  assert.equal(heldDeviceId(owed, TOKEN), ROW, 'a release still owed names the row the leaving account holds');
  assert.equal(heldDeviceId(registered('A', TOKEN, ROW, 1_000), TOKEN), ROW, 'an account switch without sign-out');
  assert.equal(heldDeviceId(registered('A', TOKEN, ROW, 1_000), 'ExponentPushToken[rotated]'), null, 'another token proves nothing');
  assert.equal(heldDeviceId(EMPTY_PUSH_LEDGER, TOKEN), null);
});

test('the ledger round-trips and an unreadable one reads as empty', async () => {
  const values = new Map<string, string>();
  const storage = {
    async getItem(key: string) { return values.get(key) ?? null; },
    async setItem(key: string, value: string) { values.set(key, value); },
  };
  const owed = unregistered(registered('A', TOKEN, ROW, 1_000), false);
  await writePushLedger(owed, storage);
  assert.deepEqual(await readPushLedger(storage), owed);
  values.set('eddy.push.ledger.v1', '{not json');
  assert.deepEqual(await readPushLedger(storage), EMPTY_PUSH_LEDGER);
  values.set('eddy.push.ledger.v1', JSON.stringify({ registration: { userId: 7 }, release: { expoPushToken: TOKEN } }));
  assert.deepEqual(await readPushLedger(storage), EMPTY_PUSH_LEDGER, 'malformed parts are dropped, not trusted');
});
