// src/lib/notification-copy.test.ts
// The sentence Eddy Settings shows under Notifications.
//
// Tested here because the Expo app has no test runner. What is actually being
// checked is a PRECEDENCE order: several reasons alerts might not arrive can be
// true at once, and naming the wrong one sends someone to fix something that
// was never the problem. Telling a simulator user to check iOS Settings is the
// failure mode — and it is invisible unless the combinations are enumerated.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  notificationControlKind,
  notificationDetail,
} from '../../../eddy-ios/src/lib/notificationCopy';

const base = { permission: 'granted' as const, registered: true };

test('the working state says what will happen', () => {
  assert.match(notificationDetail(base), /will get a push/i);
});

test('an unsupported device outranks every other reason', () => {
  // A simulator can never receive push, whatever else is true. Blaming iOS
  // Settings or a missing sign-in would send someone to fix the wrong thing.
  const detail = notificationDetail({
    permission: 'unsupported',
    registered: false,
  });
  assert.match(detail, /real device/i);
  assert.doesNotMatch(detail, /settings/i);
});

test('a denied permission still points at the free feed', () => {
  // Someone who declined push has not lost the alerts themselves — the feed is
  // free and does not need an account. Saying so is the difference between a
  // dead end and a redirect.
  assert.match(
    notificationDetail({ permission: 'denied', registered: false }),
    /Alerts tab/,
  );
});

test('an undetermined permission makes the case rather than reporting state', () => {
  // This is the one string that has to sell something: it sits next to the
  // button that spends the one-shot iOS prompt.
  const detail = notificationDetail({
    permission: 'undetermined',
    registered: false,
  });
  assert.match(detail, /floatable|dangerous/i);
});

test('granted but unregistered says it will retry rather than blaming the user', () => {
  // Registration can fail transiently — no network on launch, a token that has
  // not been issued yet. Nothing here is the user's to fix.
  const detail = notificationDetail({ permission: 'granted', registered: false });
  assert.match(detail, /retry/i);
});

test('an explicit device opt-out outranks transient registration state', () => {
  const detail = notificationDetail({
    permission: 'granted',
    registered: false,
    optedOut: true,
  });
  assert.match(detail, /stopped on this device/i);
  assert.doesNotMatch(detail, /retry/i);
});

test('every combination produces a non-empty sentence', () => {
  const permissions = ['granted', 'denied', 'undetermined', 'unsupported'] as const;
  for (const permission of permissions) {
    for (const registered of [true, false]) {
      for (const optedOut of [true, false]) {
        const detail = notificationDetail({ permission, registered, optedOut });
        assert.ok(
          detail.trim().length > 0,
          `empty copy for ${permission}/${registered}/${optedOut}`,
        );
        assert.ok(detail.endsWith('.'), `unpunctuated copy for ${permission}`);
      }
    }
  }
});

test('Settings offers a switch only when push can change on this device', () => {
  assert.equal(notificationControlKind(true, 'granted'), 'switch');
  assert.equal(notificationControlKind(true, 'undetermined'), 'switch');
  assert.equal(notificationControlKind(true, 'denied'), 'settings-link');
  assert.equal(notificationControlKind(true, 'unsupported'), 'status');
  assert.equal(notificationControlKind(false, 'granted'), 'status');
  assert.equal(notificationControlKind(false, 'denied'), 'status');
});

test('a reinstall that left alerts on another account says how it finishes, not "will retry"', () => {
  // Retrying cannot recover a missing proof, so the old sentence was a promise
  // nothing kept. The held state names the account problem and the one action.
  const held = { permission: 'granted' as const, registered: false };
  for (const state of ['sent', 'unknown', 'limited', 'unavailable'] as const) {
    const detail = notificationDetail({ ...held, held: state });
    assert.match(detail, /still linked to the Eddy account it used before/);
    assert.doesNotMatch(detail, /next launch/);
    assert.match(detail, /Eddy Settings/);
  }
  assert.match(notificationDetail({ ...held, held: 'sent' }), /finishes as soon as it arrives/);
  assert.match(notificationDetail({ ...held, held: 'limited' }), /in an hour/);
  // Higher blockers still win, and an ordinary failure keeps its sentence.
  assert.match(notificationDetail({ ...held, held: 'sent', optedOut: true }), /stopped on this device/);
  assert.match(notificationDetail(held), /Connecting now/);
});
