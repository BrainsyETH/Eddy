// An uncertain clip publish must block the next attempt.
//
// The clip duplicate guard used to match only publishing/published. The
// reaper turns a stuck publishing row into `unknown`, so once it ran the
// guard stopped matching and the next clip run posted the same Reel again.

import assert from 'node:assert/strict';
import test from 'node:test';
import { FakeOutboxDb } from '../alerts/fake-outbox-db';
import { publishClip, type ClipRow } from './clip-poster';
import type { PlatformAdapter, PublishParams, PublishResult } from './types';
import type { ResolvedModel } from '@/lib/ai/resolve-models';

delete process.env.ANTHROPIC_API_KEY; // template caption, no network

const CLIP: ClipRow = {
  id: 'clip-1',
  clip_url: 'https://cdn.example/clip-1.mp4',
  river_slug: null,
  source_creator: null,
  brand_check_status: 'approved',
  brand_check_result: null,
  used_in_posts: [],
};

function instagram(results: PublishResult[]) {
  const calls: PublishParams[] = [];
  const adapter = {
    platform: 'instagram',
    async publishPost(params: PublishParams) {
      calls.push(params);
      await params.onProviderAttempt?.('container-1');
      return results.shift() ?? { success: true, platformPostId: 'ig-1' };
    },
    async validateCredentials() {
      return true;
    },
  } as unknown as PlatformAdapter;
  return { adapter, calls };
}

const options = (adapter: PlatformAdapter) => ({
  adapterFor: () => adapter,
  captionModel: { id: 'test-model' } as unknown as ResolvedModel,
});

test('an ambiguous clip publish is recorded unknown, and the next attempt does not post again', async () => {
  const db = new FakeOutboxDb();
  const { adapter, calls } = instagram([{ success: false, ambiguous: true, error: 'Instagram publish: no response' }]);

  await publishClip(db, CLIP, ['instagram'], options(adapter));
  assert.equal(db.rows('social_posts')[0].status, 'unknown', 'Not `failed`: it may be live');
  assert.equal(db.rows('social_posts')[0].provider_attempt_id, 'container-1');

  const second = await publishClip(db, CLIP, ['instagram'], options(adapter));
  assert.equal(calls.length, 1, 'The platform was not called a second time');
  assert.match(second.results[0].error ?? '', /Already unknown/);
});

test('a stuck publishing row reaped to unknown still blocks a repost', async () => {
  const db = new FakeOutboxDb().seed('social_posts', [
    { id: 'old', platform: 'instagram', video_url: CLIP.clip_url, status: 'unknown' },
  ]);
  const { adapter, calls } = instagram([]);
  await publishClip(db, CLIP, ['instagram'], options(adapter));
  assert.equal(calls.length, 0);
});

test('a definitive failure is still retryable', async () => {
  const db = new FakeOutboxDb();
  const { adapter, calls } = instagram([{ success: false, error: 'Invalid video format' }]);
  await publishClip(db, CLIP, ['instagram'], options(adapter));
  assert.equal(db.rows('social_posts')[0].status, 'failed');
  await publishClip(db, CLIP, ['instagram'], options(adapter));
  assert.equal(calls.length, 2, 'A failed row does not block the retry');
});
