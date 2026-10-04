import assert from 'node:assert/strict';
import test from 'node:test';
import { canOfferReadPremium, premiumReadUserId } from '../../../eddy-ios/src/lib/readPremiumAccess';

const free = {
  sessionReady: true,
  userId: 'free-user',
  loaded: true,
  error: null,
  profileId: 'free-user',
  isActive: false,
};

test('read previews use only the current account’s verified Premium entitlement', () => {
  const member = { ...free, isActive: true };
  assert.equal(premiumReadUserId(member), 'free-user');
  for (const state of [free, { ...member, sessionReady: false }, { ...member, loaded: false },
    { ...member, error: 'Offline' }, { ...member, userId: 'new-user' },
    { ...member, userId: null }, { ...member, profileId: null }]) {
    assert.equal(premiumReadUserId(state), null);
  }
});

test('confirmed free and anonymous accounts can open Premium', () => {
  assert.equal(canOfferReadPremium(free), true);
  assert.equal(canOfferReadPremium({ ...free, userId: 'anonymous-user', profileId: 'anonymous-user' }), true);
});

test('settled signed-out state can open Premium, but a stale profile cannot', () => {
  assert.equal(canOfferReadPremium({ ...free, userId: null, profileId: null }), true);
  assert.equal(canOfferReadPremium({ ...free, userId: null }), false);
});

test('session and account loading do not flash a Premium offer', () => {
  assert.equal(canOfferReadPremium({ ...free, sessionReady: false }), false);
  assert.equal(canOfferReadPremium({ ...free, loaded: false }), false);
});

test('active Premium members do not receive a purchase offer', () => {
  assert.equal(canOfferReadPremium({ ...free, isActive: true }), false);
});

test('an account error does not mean a member needs to purchase', () => {
  assert.equal(canOfferReadPremium({ ...free, error: 'Offline' }), false);
  assert.equal(canOfferReadPremium({ ...free, isActive: true, error: 'Offline' }), false);
});

test('account switching waits for the new profile before offering Premium', () => {
  assert.equal(canOfferReadPremium({ ...free, userId: 'new-user' }), false);
  assert.equal(canOfferReadPremium({ ...free, profileId: null }), false);
  assert.equal(canOfferReadPremium({ ...free, userId: 'new-user', profileId: 'new-user' }), true);
});
