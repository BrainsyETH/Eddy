// missouri-float-planner/src/lib/float-track-deletion.test.ts
//
// Covers eddy-ios/src/lib/floatTrackDeletion.ts: deleting a float's raw GPS
// track with its recap is never silent and never final. The intent is on
// disk before anything is deleted; a failure stays queued and is retried.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PENDING_TRACK_DELETIONS_KEY,
  createTrackDeletions,
} from '../../../eddy-ios/src/lib/floatTrackDeletion';

function disk() {
  const data = new Map<string, string>();
  const store = {
    data,
    failWrites: false,
    async getItem(key: string) {
      return data.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      if (store.failWrites) throw new Error('disk full');
      data.set(key, value);
    },
  };
  return store;
}

function nativeTracks(ids: string[]) {
  const tracks = new Set(ids);
  const native = {
    tracks,
    fail: false,
    async remove(id: string) {
      if (native.fail) throw new Error('EACCES');
      tracks.delete(id);
    },
  };
  return native;
}

test('a deleted track is gone and nothing is left pending', async () => {
  const storage = disk();
  const native = nativeTracks(['a', 'b']);
  const deletions = createTrackDeletions(storage, native.remove);
  assert.equal(await deletions.request('a'), 'deleted');
  assert.deepEqual([...native.tracks], ['b']);
  assert.deepEqual(await deletions.pending(), []);
});

test('a track that cannot be deleted yet is reported and queued, then deleted on retry', async () => {
  const storage = disk();
  const native = nativeTracks(['a']);
  const deletions = createTrackDeletions(storage, native.remove);
  native.fail = true;
  assert.equal(await deletions.request('a'), 'queued', 'the caller hears it, rather than success');
  assert.deepEqual(JSON.parse(storage.data.get(PENDING_TRACK_DELETIONS_KEY)!), ['a'], 'the intent is on disk');

  // A relaunch: a new queue reads the same disk and retries.
  native.fail = false;
  const relaunched = createTrackDeletions(storage, native.remove);
  await relaunched.retryPending();
  assert.equal(native.tracks.size, 0);
  assert.deepEqual(await relaunched.pending(), []);
});

test('if the intent cannot be saved, nothing is deleted and the caller is told', async () => {
  const storage = disk();
  const native = nativeTracks(['a']);
  const deletions = createTrackDeletions(storage, native.remove);
  storage.failWrites = true;
  await assert.rejects(deletions.request('a'), /disk full/);
  assert.deepEqual([...native.tracks], ['a'], 'the recap stays too, so Delete can be tried again');
});

test('retrying keeps whatever still fails, and a corrupt list is not fatal', async () => {
  const storage = disk();
  const native = nativeTracks(['a', 'b']);
  const deletions = createTrackDeletions(storage, native.remove);
  native.fail = true;
  await deletions.request('a');
  await deletions.request('b');
  await deletions.retryPending();
  assert.deepEqual((await deletions.pending()).sort(), ['a', 'b']);

  storage.data.set(PENDING_TRACK_DELETIONS_KEY, '{not json');
  await deletions.retryPending();
  assert.deepEqual(await deletions.pending(), []);
});
