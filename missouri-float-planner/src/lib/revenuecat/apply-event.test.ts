import assert from 'node:assert/strict';
import test from 'node:test';
import { FakeOutboxDb } from '../alerts/fake-outbox-db';
import { applyToEntitlement, revokeTransferredSource } from './apply-event';
import type { RevenueCatEvent } from './events';

const USER = '00000000-0000-4000-8000-000000000001';
const ENT = 'premium';

const event = (id: string, type: string): RevenueCatEvent => ({ id, type, app_user_id: USER } as RevenueCatEvent);
const RENEWAL_AT = '2026-11-01T12:00:05.000Z';
const CANCEL_AT = '2026-11-01T12:00:00.000Z'; // older

function apply(db: FakeOutboxDb, id: string, type: string, eventAt: string, expiresAt: string) {
  return applyToEntitlement(db, {
    userId: USER,
    entitlementId: ENT,
    patch: { expires_at: expiresAt } as never,
    event: event(id, type),
    eventAt,
  });
}

const row = (db: FakeOutboxDb) => db.rows('entitlements')[0];

test('overlapping deliveries cannot apply an older event over a newer one', async () => {
  // Both reads see the same row before either writes — the race the old
  // read-compare-upsert lost whenever the newer event wrote first.
  const db = new FakeOutboxDb().seed('entitlements', [
    { user_id: USER, entitlement_id: ENT, expires_at: '2026-11-15T00:00:00.000Z', last_event_id: 'e0', last_event_at: '2026-10-01T00:00:00.000Z' },
  ]);
  const [renewal, cancel] = await Promise.all([
    apply(db, 'renew', 'RENEWAL', RENEWAL_AT, '2026-12-15T00:00:00.000Z'),
    apply(db, 'cancel', 'EXPIRATION', CANCEL_AT, '2026-11-01T12:00:00.000Z'),
  ]);
  assert.equal(renewal.status, 'applied');
  assert.equal(cancel.status, 'stale');
  assert.equal(row(db).last_event_id, 'renew');
  assert.equal(row(db).expires_at, '2026-12-15T00:00:00.000Z', 'Premium was not revoked by the older event');
});

test('two first deliveries racing an insert still end on the newer event', async () => {
  const db = new FakeOutboxDb();
  const results = await Promise.all([
    apply(db, 'renew', 'RENEWAL', RENEWAL_AT, '2026-12-15T00:00:00.000Z'),
    apply(db, 'cancel', 'EXPIRATION', CANCEL_AT, '2026-11-01T12:00:00.000Z'),
  ]);
  assert.deepEqual(results.map((r) => r.status), ['applied', 'stale']);
  assert.equal(db.rows('entitlements').length, 1);
  assert.equal(row(db).last_event_id, 'renew');
});

test('a redelivered event is a duplicate', async () => {
  const db = new FakeOutboxDb();
  await apply(db, 'renew', 'RENEWAL', RENEWAL_AT, '2026-12-15T00:00:00.000Z');
  assert.equal((await apply(db, 'renew', 'RENEWAL', RENEWAL_AT, '2026-12-15T00:00:00.000Z')).status, 'duplicate');
});

test('a late transfer does not revoke a source row that has seen a newer event', async () => {
  const db = new FakeOutboxDb().seed('entitlements', [
    { user_id: USER, entitlement_id: ENT, expires_at: '2026-12-15T00:00:00.000Z', last_event_id: 'rebuy', last_event_at: RENEWAL_AT },
  ]);
  await revokeTransferredSource(db, { userId: USER, entitlementId: ENT, event: event('xfer', 'TRANSFER'), eventAt: CANCEL_AT });
  assert.equal(row(db).last_event_id, 'rebuy');
  assert.equal(row(db).expires_at, '2026-12-15T00:00:00.000Z');

  await revokeTransferredSource(db, { userId: USER, entitlementId: ENT, event: event('xfer2', 'TRANSFER'), eventAt: '2026-11-02T00:00:00.000Z' });
  assert.equal(row(db).last_event_id, 'xfer2', 'A transfer newer than the row does revoke it');
});
