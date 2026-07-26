// src/lib/chunked-store.test.ts
// Covers the Expo app's Keychain chunking. The app has no test runner, so its
// pure logic is tested here — the same arrangement as geo-tiles.test.ts and
// offline-plan.test.ts.
//
// This matters more than most: what it guards is the Supabase session, and the
// session is what ties a person to their purchase. A torn write here does not
// look like a bug — it looks like a subscriber who mysteriously lost their
// subscription after an update.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chunkKey,
  createChunkedStore,
  manifestCount,
  type ChunkedStoreBackend,
} from '../../../eddy-ios/src/lib/chunked-store';

/** In-memory stand-in for the Keychain, with a window into the raw keys. */
function memoryBackend(): ChunkedStoreBackend & { raw: Map<string, string> } {
  const raw = new Map<string, string>();
  return {
    raw,
    async getItem(key) {
      return raw.has(key) ? (raw.get(key) as string) : null;
    },
    async setItem(key, value) {
      raw.set(key, value);
    },
    async removeItem(key) {
      raw.delete(key);
    },
  };
}

const KEY = 'sb-eddy-auth-token';
const CHUNK = 16;

test('a small value round-trips as a single item', async () => {
  const backend = memoryBackend();
  const store = createChunkedStore(backend, CHUNK);

  await store.setItem(KEY, 'small');

  assert.equal(await store.getItem(KEY), 'small');
  // No manifest, no chunks: the common case must stay a single read.
  assert.equal(backend.raw.size, 1);
  assert.equal(manifestCount(backend.raw.get(KEY) as string), null);
});

test('a large value round-trips through chunks', async () => {
  const backend = memoryBackend();
  const store = createChunkedStore(backend, CHUNK);
  const value = 'x'.repeat(CHUNK * 4 + 7);

  await store.setItem(KEY, value);

  assert.equal(await store.getItem(KEY), value);
  assert.equal(manifestCount(backend.raw.get(KEY) as string), 5);
});

test('a value at exactly the chunk size is not split', async () => {
  const backend = memoryBackend();
  const store = createChunkedStore(backend, CHUNK);
  const value = 'y'.repeat(CHUNK);

  await store.setItem(KEY, value);

  assert.equal(await store.getItem(KEY), value);
  assert.equal(backend.raw.size, 1);
});

test('overwriting with a shorter value leaves no tail behind', async () => {
  // The bug this prevents: five chunks written, then three — without clearing,
  // chunks 3 and 4 survive. They are only reachable if the manifest says so,
  // but a manifest that later grew again would splice the STALE tail of an old
  // session onto the head of a new one, producing valid-looking garbage.
  const backend = memoryBackend();
  const store = createChunkedStore(backend, CHUNK);

  await store.setItem(KEY, 'a'.repeat(CHUNK * 5));
  await store.setItem(KEY, 'b'.repeat(CHUNK * 2));

  assert.equal(await store.getItem(KEY), 'b'.repeat(CHUNK * 2));

  const leftovers = [...backend.raw.keys()].filter(
    (k) => k.startsWith(`${KEY}.`) && Number(k.slice(KEY.length + 1)) >= 2,
  );
  assert.deepEqual(leftovers, [], 'stale chunks from the longer value must be gone');
});

test('a missing chunk reads as no session rather than partial data', async () => {
  // Returning what survived would hand supabase-js a truncated JSON string and
  // throw on a cold start. Returning null makes it sign in again.
  const backend = memoryBackend();
  const store = createChunkedStore(backend, CHUNK);

  await store.setItem(KEY, 'z'.repeat(CHUNK * 3));
  backend.raw.delete(chunkKey(KEY, 1));

  assert.equal(await store.getItem(KEY), null);
});

test('removing a chunked value removes its chunks too', async () => {
  const backend = memoryBackend();
  const store = createChunkedStore(backend, CHUNK);

  await store.setItem(KEY, 'q'.repeat(CHUNK * 3));
  await store.removeItem(KEY);

  assert.equal(await store.getItem(KEY), null);
  assert.equal(backend.raw.size, 0, 'no orphaned chunks may remain in the Keychain');
});

test('a backend that throws degrades to no session instead of crashing', async () => {
  const store = createChunkedStore({
    async getItem() {
      throw new Error('keychain unavailable');
    },
    async setItem() {
      throw new Error('keychain unavailable');
    },
    async removeItem() {
      throw new Error('keychain unavailable');
    },
  });

  assert.equal(await store.getItem(KEY), null);
  // Must not reject: this runs on the app's startup path.
  await store.setItem(KEY, 'anything');
  await store.removeItem(KEY);
});

test('a corrupt manifest is treated as a whole value, not a chunk count', async () => {
  assert.equal(manifestCount('__eddy_chunks__:abc'), null);
  assert.equal(manifestCount('__eddy_chunks__:0'), null);
  assert.equal(manifestCount('__eddy_chunks__:-2'), null);
  assert.equal(manifestCount('{"access_token":"..."}'), null);
});
