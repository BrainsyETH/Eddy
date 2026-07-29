import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CACHE_VERSION,
  INDEX_KEY,
  META_KEY,
  envelope,
  isRiverKey,
  isStaleVersionKey,
  parseEnvelope,
  riverKey,
  slugFromRiverKey,
} from '../../../eddy-ios/src/lib/offline-cache';

const NOW = '2026-07-29T12:00:00.000Z';

// ── the envelope ─────────────────────────────────────────────────

test('an envelope written by an older schema reads as absent', () => {
  // A cache written before a field existed, handed to a screen that reads it,
  // renders undefined. A version mismatch has to be a MISS, not a partial hit —
  // the data is one request away, so repair is cheaper than migration.
  const stale = JSON.stringify({ ...envelope([1], NOW), v: CACHE_VERSION - 1 });
  assert.equal(parseEnvelope(stale, 'array'), null);
});

test('a truncated or non-JSON value reads as absent rather than throwing', () => {
  // A JSON.parse throw inside a mount effect takes the whole river screen down
  // — the screen this cache exists to keep alive.
  assert.equal(parseEnvelope('{"v":1,"payl', 'array'), null);
  assert.equal(parseEnvelope('not json at all', 'array'), null);
  assert.equal(parseEnvelope(null, 'array'), null);
  assert.equal(parseEnvelope(undefined, 'array'), null);
  assert.equal(parseEnvelope('', 'array'), null);
});

test('an envelope with no usable fetchedAt is rejected', () => {
  // An undated entry cannot be aged, and a reading that cannot be aged is the
  // one thing this cache must never present as current.
  assert.equal(parseEnvelope(JSON.stringify({ v: CACHE_VERSION, payload: [] }), 'array'), null);
  assert.equal(
    parseEnvelope(JSON.stringify({ v: CACHE_VERSION, fetchedAt: 'soon', payload: [] }), 'array'),
    null,
  );
});

test('a payload of the wrong container shape is rejected', () => {
  // The case that reaches a .map() on a river screen: accessPoints arriving as
  // null, or an object where a list belongs.
  assert.equal(parseEnvelope(JSON.stringify(envelope(null, NOW)), 'array'), null);
  assert.equal(parseEnvelope(JSON.stringify(envelope({ a: 1 }, NOW)), 'array'), null);
  assert.equal(parseEnvelope(JSON.stringify(envelope([1, 2], NOW)), 'object'), null);
});

test('a good envelope round-trips with its payload and timestamp intact', () => {
  const parsed = parseEnvelope<number[]>(JSON.stringify(envelope([1, 2, 3], NOW)), 'array');
  assert.deepEqual(parsed?.payload, [1, 2, 3]);
  assert.equal(parsed?.fetchedAt, NOW);
  assert.equal(parsed?.etag, null);
});

// ── keys ─────────────────────────────────────────────────────────

test('a river key round-trips a hyphenated slug', () => {
  // Every Eddy slug is hyphenated. A colon-delimited key with a naive split is
  // exactly why riverSlugFromRegionId in @eddy/offline had to grow a regex.
  for (const slug of ['current', 'north-fork-white', 'big-piney']) {
    assert.equal(slugFromRiverKey(riverKey(slug)), slug);
  }
});

test('the index, meta and river keys are told apart', () => {
  // An eviction sweep over getAllKeys() that matched too broadly would delete
  // the river index because it shares a prefix with the river entries.
  assert.equal(isRiverKey(riverKey('current')), true);
  assert.equal(isRiverKey(INDEX_KEY), false);
  assert.equal(isRiverKey(META_KEY), false);
  assert.equal(slugFromRiverKey(INDEX_KEY), null);
});

test('the stale sweep matches a previous version and never the current one', () => {
  // Get this wrong in one direction and a version bump strands the old data
  // forever; in the other, the sweep deletes the store it just wrote.
  assert.equal(isStaleVersionKey(`eddy.cache.v${CACHE_VERSION - 1}.index`), true);
  assert.equal(isStaleVersionKey(INDEX_KEY), false);
  assert.equal(isStaleVersionKey(riverKey('current')), false);
});

test('the stale sweep never matches the stars or saved floats', () => {
  // Those live under `eddy.` too and are NOT caches — they are the only copy.
  // Deleting them would be real data loss, so the sweep is anchored on the
  // cache prefix specifically.
  assert.equal(isStaleVersionKey('eddy.stars.v3'), false);
  assert.equal(isStaleVersionKey('eddy.savedFloats.v1'), false);
});
