import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearsBillingIssue,
  entitlementIds,
  transferredUuids,
  uuidCandidates,
  willRenewFor,
} from './events';

const A = '8c52d724-b5f7-4a8d-9c9e-11c6153d1b9f';
const B = '68751aa2-433c-44e5-a9e7-67136db7347b';

test('identity candidates use UUID aliases and remove duplicates', () => {
  assert.deepEqual(uuidCandidates({
    id: 'event', type: 'RENEWAL', event_timestamp_ms: 1,
    app_user_id: 'not-a-uuid', original_app_user_id: A, aliases: [A, B],
  }), [A, B]);
});

test('transfer ids reject RevenueCat anonymous identifiers', () => {
  assert.deepEqual(transferredUuids(['$RCAnonymousID:x', A]), [A]);
});

test('event state helpers preserve lifecycle semantics', () => {
  assert.equal(willRenewFor('RENEWAL'), true);
  assert.equal(willRenewFor('CANCELLATION'), false);
  assert.equal(willRenewFor('BILLING_ISSUE'), null);
  assert.equal(clearsBillingIssue('SUBSCRIPTION_EXTENDED'), true);
  assert.deepEqual(entitlementIds({ id: 'e', type: 'RENEWAL', event_timestamp_ms: 1 }), ['eddy_plus']);
});
