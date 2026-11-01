import assert from 'node:assert/strict';
import test from 'node:test';
import { FakeOutboxDb } from '../alerts/fake-outbox-db';
import { outcomeFields, outcomeStatus, reconcileUnknownPosts, thrownFields, writeOutcome } from './publish-outcome';

const NOW = new Date('2026-11-01T12:00:00.000Z');

test('an ambiguous failure is UNKNOWN, never failed — failed posts get auto-retried', () => {
  assert.equal(outcomeStatus({ success: false, ambiguous: true, error: 'timeout' }), 'unknown');
  assert.equal(outcomeStatus({ success: false, error: 'Invalid image' }), 'failed');
  assert.equal(outcomeStatus({ success: true }), 'published');
  assert.equal(outcomeStatus({ success: true, delivery: 'inbox' }), 'inbox');
});

test('only a real publish stamps published_at', () => {
  assert.ok(outcomeFields({ success: true }, NOW).published_at);
  assert.equal(outcomeFields({ success: true, delivery: 'inbox' }, NOW).published_at, null);
  assert.equal(outcomeFields({ success: false, ambiguous: true }, NOW).published_at, null);
});

test('a thrown publish call is recorded as unknown', () => {
  assert.equal(thrownFields(new Error('socket hang up'), NOW).status, 'unknown');
});

function db() {
  return new FakeOutboxDb(NOW.toISOString()).seed('social_posts', [
    { id: 'p1', status: 'publishing', platform: 'instagram', created_at: NOW.toISOString(), provider_attempt_id: null },
  ]);
}

test('an outcome is written only onto a row still in the expected state', async () => {
  const d = db();
  d.rows('social_posts')[0].status = 'published'; // someone else resolved it
  await writeOutcome(d, 'p1', { status: 'failed' });
  assert.equal(d.rows('social_posts')[0].status, 'published');
});

test('before the migration, a rejected `unknown` leaves the post in publishing (never retried)', async () => {
  const d = db().fail({ table: 'social_posts', mode: 'update', code: '23514', times: 1 });
  const ok = await writeOutcome(d, 'p1', { status: 'unknown', error_message: 'Outcome unknown' });
  assert.equal(ok, false);
  assert.equal(d.rows('social_posts')[0].status, 'publishing');
  assert.equal(d.rows('social_posts')[0].error_message, 'Outcome unknown');
});

test('unknown Instagram posts are settled by the container state, and nothing else is touched', async () => {
  const d = new FakeOutboxDb(NOW.toISOString()).seed('social_posts', [
    { id: 'live', status: 'unknown', platform: 'instagram', provider_attempt_id: 'c-live', created_at: NOW.toISOString() },
    { id: 'dead', status: 'unknown', platform: 'instagram', provider_attempt_id: 'c-dead', created_at: NOW.toISOString() },
    { id: 'busy', status: 'unknown', platform: 'instagram', provider_attempt_id: 'c-busy', created_at: NOW.toISOString() },
    { id: 'fb', status: 'unknown', platform: 'facebook', provider_attempt_id: null, created_at: NOW.toISOString() },
  ]);
  const states = { 'c-live': 'published', 'c-dead': 'not_published', 'c-busy': 'in_progress' } as const;
  const result = await reconcileUnknownPosts(d, async (id) => states[id as keyof typeof states], NOW);

  const status = (id: string) => d.rows('social_posts').find((r) => r.id === id)!.status;
  assert.equal(status('live'), 'published');
  assert.equal(status('dead'), 'failed', 'Never published: now retryable');
  assert.equal(status('busy'), 'unknown');
  assert.equal(status('fb'), 'unknown', 'No way to ask Facebook: left for an admin');
  assert.deepEqual(result, { checked: 3, published: 1, failed: 1 });
});
