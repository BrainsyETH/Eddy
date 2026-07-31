import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  acceptTerms,
  hasAcceptedTerms,
  ONBOARDING_KEY,
  ONBOARDING_VERSION,
  type OnboardingStorage,
} from '../../../eddy-ios/src/lib/onboarding';

function memoryStorage(): OnboardingStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) { values.set(key, value); },
  };
}

test('onboarding is blocked until the current agreement is accepted', async () => {
  const storage = memoryStorage();
  assert.equal(await hasAcceptedTerms(storage), false);
  await acceptTerms(storage);
  assert.equal(await hasAcceptedTerms(storage), true);
});

test('the acceptance key is versioned for future material changes', () => {
  assert.match(ONBOARDING_KEY, new RegExp(`v${ONBOARDING_VERSION}$`));
});

test('storage read failures fail closed', async () => {
  const storage: OnboardingStorage = {
    async getItem() { throw new Error('unavailable'); },
    async setItem() {},
  };
  assert.equal(await hasAcceptedTerms(storage), false);
});

test('an acceptance write failure cannot trap the current session', () => {
  const gate = readFileSync('../eddy-ios/src/components/OnboardingGate.tsx', 'utf8');
  assert.match(gate, /catch \(error\)[\s\S]*report\(error,[\s\S]*setAccepted\(true\)/);
});

// The regression these two cover is a HANG, not a thrown error, so neither
// would have failed loudly without being asserted. Resolving the storage handle
// used to be a default parameter — evaluated before the function body, and so
// outside the try that exists to protect it. A missing native module therefore
// rejected instead of returning false, OnboardingGate never left its null
// state, and the app sat on a blank screen the exact colour of the splash.

test('a storage handle that cannot be constructed fails closed, not rejected', async () => {
  const exploding = new Proxy({} as OnboardingStorage, {
    get() { throw new Error('native module unavailable'); },
  });
  assert.equal(await hasAcceptedTerms(exploding), false);
});

test('the gate never awaits an uncaught promise before its first render', () => {
  const gate = readFileSync('../eddy-ios/src/components/OnboardingGate.tsx', 'utf8');
  // hasAcceptedTerms() decides whether children mount at all; an unhandled
  // rejection there is indistinguishable from a stuck splash.
  assert.match(gate, /hasAcceptedTerms\(\)[\s\S]{0,200}\.catch\(/);
});
