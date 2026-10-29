// src/lib/push/device-claim.test.ts
// Moving a push token off another account after a reinstall, without letting
// someone who merely knows a token take it.
//
// The case: A registers, the app is deleted without signing out, it is
// reinstalled (the iOS push token survives; the ledger with A's row id does
// not) and B signs in. B has no row id, so the route answered 409 forever.
// Now the server pushes a code to the token, which only that iPhone can read,
// and B sends it back.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  DEVICE_CLAIM_DATA_KEY,
  DEVICE_CLAIM_TTL_MS,
  deviceClaimKey,
  deviceClaimLimitKey,
  deviceClaimMessage,
  mintDeviceClaim,
  verifyDeviceClaim,
} from './device-claim';
import {
  DEVICE_CLAIM_DATA_KEY as APP_DATA_KEY,
  DEVICE_CLAIM_TTL_MS as APP_TTL_MS,
  createDeviceClaimInbox,
  deviceClaimCode,
  deviceClaimState,
} from '../../../../eddy-ios/src/lib/deviceClaim';
import { heldDeviceId, EMPTY_PUSH_LEDGER } from '../../../../eddy-ios/src/lib/pushLedger';

const key = deviceClaimKey({ DEVICE_CLAIM_SECRET: 'test-secret' })!;
const TOKEN = 'ExponentPushToken[reinstalled]';
const A_ROW = '11111111-2222-4333-8444-555555555555';
const binding = { userId: 'user-b', expoPushToken: TOKEN, holderId: A_ROW };
const NOW = 1_800_000_000_000;

test('a reinstall has no row id, so only a pushed code can prove the device', () => {
  // The ledger is gone with the app; heldDeviceId has nothing to offer.
  assert.equal(heldDeviceId(EMPTY_PUSH_LEDGER, TOKEN), null);
  const code = mintDeviceClaim(key, binding, NOW);
  assert.equal(verifyDeviceClaim(key, code, binding, NOW + 60_000), true);
});

test('a code proves exactly one account, token and holding row', () => {
  const code = mintDeviceClaim(key, binding, NOW);
  // Someone who knows the token gets their own code pushed to the victim's
  // phone; they never see it, and the victim's code is not theirs to use.
  assert.equal(verifyDeviceClaim(key, code, { ...binding, userId: 'attacker' }, NOW), false, 'another account');
  assert.equal(verifyDeviceClaim(key, code, { ...binding, expoPushToken: 'ExponentPushToken[other]' }, NOW), false, 'another token');
  // Once the token is re-keyed the holding row changes, so the code is spent.
  assert.equal(verifyDeviceClaim(key, code, { ...binding, holderId: '99999999-2222-4333-8444-555555555555' }, NOW), false, 'another holder');
  assert.equal(verifyDeviceClaim(deviceClaimKey({ DEVICE_CLAIM_SECRET: 'other' })!, code, binding, NOW), false, 'another key');
});

test('a code expires, and a forged or malformed one never verifies', () => {
  const code = mintDeviceClaim(key, binding, NOW);
  assert.equal(verifyDeviceClaim(key, code, binding, NOW + DEVICE_CLAIM_TTL_MS), true, 'the last moment');
  assert.equal(verifyDeviceClaim(key, code, binding, NOW + DEVICE_CLAIM_TTL_MS + 1), false, 'expired');
  const [expires, mac] = code.split('.');
  // A later expiry with the same MAC, or one further out than any code minted.
  assert.equal(verifyDeviceClaim(key, `${Number(expires) + 1}.${mac}`, binding, NOW), false);
  const farFuture = NOW + 10 * DEVICE_CLAIM_TTL_MS;
  assert.equal(verifyDeviceClaim(key, `${farFuture}.${mac}`, binding, NOW), false);
  const flipped = mac[0] === 'A' ? `B${mac.slice(1)}` : `A${mac.slice(1)}`;
  assert.equal(verifyDeviceClaim(key, `${expires}.${flipped}`, binding, NOW), false, 'tampered');
  for (const bad of [undefined, null, 7, '', 'x', `${expires}`, `${expires}.short`, `${code}x`, 'a'.repeat(300)]) {
    assert.equal(verifyDeviceClaim(key, bad, binding, NOW), false, String(bad));
  }
});

test('the key is derived, never the raw secret, and missing secrets mean no claims', () => {
  assert.equal(deviceClaimKey({}), null);
  assert.ok(deviceClaimKey({ SUPABASE_SERVICE_ROLE_KEY: 'service' }), 'falls back to the server secret');
  assert.notDeepEqual(deviceClaimKey({ SUPABASE_SERVICE_ROLE_KEY: 'service' }), Buffer.from('service'));
  assert.deepEqual(
    deviceClaimKey({ DEVICE_CLAIM_SECRET: 'dedicated', SUPABASE_SERVICE_ROLE_KEY: 'service' }),
    deviceClaimKey({ DEVICE_CLAIM_SECRET: 'dedicated' }),
    'a dedicated secret wins',
  );
});

test('the push carries the code where the app looks, quietly, and no raw token keys the limiter', () => {
  const code = mintDeviceClaim(key, binding, NOW);
  const message = deviceClaimMessage(TOKEN, code);
  assert.equal(message.to, TOKEN);
  assert.equal(message.sound, null);
  assert.match(message.body ?? '', /If that wasn’t you, ignore this/);
  assert.equal(deviceClaimCode(message.data), code, 'the app reads what the server sends');
  assert.equal(DEVICE_CLAIM_DATA_KEY, APP_DATA_KEY);
  assert.equal(DEVICE_CLAIM_TTL_MS, APP_TTL_MS);
  assert.doesNotMatch(deviceClaimLimitKey(TOKEN), /ExponentPushToken/);
  assert.equal(deviceClaimLimitKey(TOKEN), deviceClaimLimitKey(TOKEN));
});

test('the app keeps a code that beats its 409, once, for the code’s lifetime', () => {
  // The server pushes before it answers, so the code can arrive first.
  const inbox = createDeviceClaimInbox();
  assert.equal(inbox.take(NOW), null);
  inbox.note('first', NOW);
  inbox.note('second', NOW + 1_000);
  assert.equal(inbox.take(NOW + 2_000), 'second', 'the newest code');
  assert.equal(inbox.take(NOW + 3_000), null, 'once: a refused code is not offered again');
  inbox.note('old', NOW);
  assert.equal(inbox.take(NOW + APP_TTL_MS), null, 'expired with the server');
  // Other notifications carry no code, and the 409 body says what was sent.
  assert.equal(deviceClaimCode({ riverSlug: 'current' }), null);
  assert.equal(deviceClaimCode(null), null);
  assert.equal(deviceClaimState({ code: 'token_held', claim: 'limited' }), 'limited');
  assert.equal(deviceClaimState(undefined), 'unknown');
});

test('the route accepts either proof, pushes a code otherwise, and the app keeps the 409', () => {
  const route = readFileSync('src/app/api/me/device-tokens/route.ts', 'utf8');
  assert.match(route, /holder\.id === previousDeviceId \|\|\s*\(key !== null && verifyDeviceClaim\(key, body\?\.claimCode, binding, Date\.now\(\)\)\)/);
  assert.match(route, /const claim = await sendDeviceClaim\(admin, key, binding\);/);
  assert.match(route, /code: 'token_held', claim \}/);
  // Rate-limited per token and fail-closed, behind the push kill switch.
  assert.match(route, /rateLimit\(deviceClaimLimitKey\(binding\.expoPushToken\), 3, 60 \* 60 \* 1000, \{\s*failClosed: true,/);
  assert.match(route, /if \(await pushDisabledReason\(admin\)\) return 'unavailable';/);

  const client = readFileSync('../eddy-ios/src/api/client.ts', 'utf8');
  assert.match(client, /err instanceof ApiError && err\.status === 409\) \{\s*return \{ ok: false, deviceId: null, held: deviceClaimState\(err\.body\) \};/);
  const push = readFileSync('../eddy-ios/src/lib/push.ts', 'utf8');
  // A code that arrived before the 409 is redeemed right away.
  assert.match(push, /if \(result\.held && !options\.claimCode\) \{\s*const code = takeDeviceClaim\(\);/);
  // And the confirmation is not shown while Eddy is open.
  assert.match(push, /shouldShowBanner: !claim,/);
  const provider = readFileSync('../eddy-ios/src/hooks/usePush.tsx', 'utf8');
  assert.match(provider, /Notifications\.addNotificationReceivedListener\(/);
  assert.match(provider, /if \(!heldRef\.current \|\| !signedIn \|\| !userId\) return;/);
});
