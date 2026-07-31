import assert from 'node:assert/strict';
import test from 'node:test';
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
