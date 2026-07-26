// src/lib/notification-copy.test.ts
// The sentence Profile shows under "Alerts are on/off".
//
// Tested here because the Expo app has no test runner. What is actually being
// checked is a PRECEDENCE order: several reasons alerts might not arrive can be
// true at once, and naming the wrong one sends someone to fix something that
// was never the problem. Telling a simulator user to check iOS Settings, or a
// signed-out user that their device "has not registered yet", is the failure
// mode — and it is invisible unless the combinations are enumerated.

import assert from 'node:assert/strict';
import test from 'node:test';
import { notificationDetail } from '../../../eddy-ios/src/lib/notificationCopy';

const base = { permission: 'granted' as const, registered: true, signedIn: true };

test('the working state says what will happen', () => {
  assert.match(notificationDetail(base), /will get a push/i);
});

test('an unsupported device outranks every other reason', () => {
  // A simulator can never receive push, whatever else is true. Blaming iOS
  // Settings or a missing sign-in would send someone to fix the wrong thing.
  const detail = notificationDetail({
    permission: 'unsupported',
    registered: false,
    signedIn: false,
  });
  assert.match(detail, /real device/i);
  assert.doesNotMatch(detail, /settings/i);
  assert.doesNotMatch(detail, /sign in/i);
});

test('a denied permission outranks being signed out', () => {
  // Signing in would not help: iOS will not show its dialog again.
  const detail = notificationDetail({ permission: 'denied', registered: false, signedIn: false });
  assert.match(detail, /iOS Settings/);
  assert.doesNotMatch(detail, /sign in/i);
});

test('a denied permission still points at the free feed', () => {
  // Someone who declined push has not lost the alerts themselves — the feed is
  // free and does not need an account. Saying so is the difference between a
  // dead end and a redirect.
  assert.match(
    notificationDetail({ permission: 'denied', registered: false, signedIn: true }),
    /Alerts tab/,
  );
});

test('being signed out is named before the prompt is offered', () => {
  // Order matters here specifically: the "turn on alerts" button is gated on
  // signedIn, so promising the prompt to a signed-out user describes a control
  // that is not on screen.
  const detail = notificationDetail({
    permission: 'undetermined',
    registered: false,
    signedIn: false,
  });
  assert.match(detail, /Sign in/);
});

test('an undetermined permission makes the case rather than reporting state', () => {
  // This is the one string that has to sell something: it sits next to the
  // button that spends the one-shot iOS prompt.
  const detail = notificationDetail({
    permission: 'undetermined',
    registered: false,
    signedIn: true,
  });
  assert.match(detail, /floatable|dangerous/i);
});

test('granted but unregistered says it will retry rather than blaming the user', () => {
  // Registration can fail transiently — no network on launch, a token that has
  // not been issued yet. Nothing here is the user's to fix.
  const detail = notificationDetail({ permission: 'granted', registered: false, signedIn: true });
  assert.match(detail, /retry/i);
});

test('every combination produces a non-empty sentence', () => {
  const permissions = ['granted', 'denied', 'undetermined', 'unsupported'] as const;
  for (const permission of permissions) {
    for (const registered of [true, false]) {
      for (const signedIn of [true, false]) {
        const detail = notificationDetail({ permission, registered, signedIn });
        assert.ok(
          detail.trim().length > 0,
          `empty copy for ${permission}/${registered}/${signedIn}`,
        );
        assert.ok(detail.endsWith('.'), `unpunctuated copy for ${permission}`);
      }
    }
  }
});
