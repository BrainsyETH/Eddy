import assert from 'node:assert/strict';
import test from 'node:test';
import { pickEnvironment } from '../../../../eddy-ios/src/lib/app-environment';

// ── why this file exists ────────────────────────────────────────────────────
//
// The iOS app tagged every Sentry event `environment: 'unknown'` for its whole
// life. monitoring.ts read the channel from
// `Constants.expoConfig?.extra?.eas?.channel`, app.json's `extra.eas` only ever
// held `projectId`, and EAS does not put a channel there — so the fallback fired
// on every build and preview was indistinguishable from production in the
// dashboard. The field existed precisely to tell those two apart.
//
// Nobody caught it because the read was inline in a native-module call inside
// Sentry.init: unreachable from a test, and silent when wrong, because
// 'unknown' is a plausible-looking answer. Splitting the decision out is what
// makes the cases below expressible at all.

test('an EAS channel wins — this is the case that was broken', () => {
  // The whole bug in one assertion. eas.json sets `"channel": "preview"` on the
  // preview profile; expo-updates is what surfaces it.
  assert.equal(pickEnvironment({ updatesChannel: 'preview' }), 'preview');
  assert.equal(pickEnvironment({ updatesChannel: 'production' }), 'production');
});

test('the update channel outranks the legacy extra.eas.channel read', () => {
  // Order matters if both are ever populated: expo-updates reports what the
  // binary was actually built with, while `extra` reports what a config file
  // claimed at prebuild time. The build wins over the claim.
  assert.equal(
    pickEnvironment({ updatesChannel: 'production', extraChannel: 'preview' }),
    'production',
  );
});

test('the legacy read is still honoured when it is the only answer', () => {
  // Kept deliberately. Dropping a fallback while fixing the thing it backed up
  // is how a fix becomes a regression, and a future config could start setting
  // it.
  assert.equal(pickEnvironment({ extraChannel: 'preview' }), 'preview');
});

test('an empty or whitespace channel is absence, not an environment', () => {
  // `Updates.channel` is '' on a build made without one, which is the shape
  // that would otherwise sail past a truthiness check into the tag itself and
  // produce an unlabelled environment in Sentry.
  assert.equal(pickEnvironment({ updatesChannel: '', isDev: false }), 'unknown');
  assert.equal(pickEnvironment({ updatesChannel: '   ', isDev: false }), 'unknown');
  assert.equal(pickEnvironment({ updatesChannel: '', extraChannel: 'preview' }), 'preview');
});

test('a dev-server run is development, not unknown', () => {
  // A local run genuinely has no channel. Filing those as 'unknown' would bury
  // the real unknowns among hundreds of them — which is the second half of why
  // the old value was useless.
  assert.equal(pickEnvironment({ isDev: true }), 'development');
  assert.equal(pickEnvironment({ updatesChannel: null, extraChannel: null, isDev: true }), 'development');
});

test("'unknown' now means something: a release build that could not name its channel", () => {
  // It survives as the last resort rather than the default. Reaching it should
  // be worth investigating, which it never was while everything reached it.
  assert.equal(pickEnvironment({ isDev: false }), 'unknown');
  assert.equal(pickEnvironment({}), 'unknown');
});
