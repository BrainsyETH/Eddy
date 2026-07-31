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
  mergeParts,
  effectiveReadingAgeHours,
  gaugeKey,
  mayPaintCachedCondition,
  readingBand,
  VIEWPORT_GAUGES_INDEX_KEY,
  viewportGaugeKey,
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

test('viewport gauge payloads use versioned, collision-safe keys', () => {
  const request = '1000:-109.1,36.9,-102,41.1';
  assert.notEqual(viewportGaugeKey(request), VIEWPORT_GAUGES_INDEX_KEY);
  assert.match(viewportGaugeKey(request), /viewport-gauge:/);
  assert.equal(viewportGaugeKey(request), viewportGaugeKey(request));
});

test('the index, meta and river keys are told apart', () => {
  // An eviction sweep over getAllKeys() that matched too broadly would delete
  // the river index because it shares a prefix with the river entries.
  assert.equal(isRiverKey(riverKey('current')), true);
  assert.equal(isRiverKey(INDEX_KEY), false);
  assert.equal(isRiverKey(META_KEY), false);
  assert.equal(slugFromRiverKey(INDEX_KEY), null);
});

test('a gauge key is versioned and safely encodes provider ids', () => {
  assert.match(gaugeKey('SWL/clearwater dam'), /^eddy\.cache\.v\d+\.gauge:/);
  assert.equal(gaugeKey('SWL/clearwater dam').includes('/'), false);
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

// ── merging one part into a river's entry ──────────────────────────────────

interface Parts {
  river?: { slug: string };
  hazards?: { id: string }[];
  accessPoints?: { id: string }[];
}

test('writing one part preserves the parts already stored', () => {
  // THE bug this function exists to prevent. A river's entry is written five
  // separate times from five separate requests, so a naive setItem on the
  // hazards response would blank that river's put-ins and its own line on
  // disk — and the damage only appears later, offline, on the screen that
  // needed them.
  const stored = mergeParts<Parts>(null, { river: { slug: 'current' } }, '2026-07-01T00:00:00.000Z');
  const after = mergeParts<Parts>(stored, { hazards: [{ id: 'h1' }] }, '2026-07-02T00:00:00.000Z');

  assert.deepEqual(after.payload.river, { slug: 'current' });
  assert.deepEqual(after.payload.hazards, [{ id: 'h1' }]);
});

test('a part is replaced wholesale, not merged element by element', () => {
  // A hazard removed upstream has to disappear from the phone. Concatenating
  // would make the cache a growing union that never forgets a retired hazard.
  const stored = mergeParts<Parts>(null, { hazards: [{ id: 'old' }] }, '2026-07-01T00:00:00.000Z');
  const after = mergeParts<Parts>(stored, { hazards: [{ id: 'new' }] }, '2026-07-02T00:00:00.000Z');

  assert.deepEqual(after.payload.hazards, [{ id: 'new' }]);
});

test('the entry carries the age of its newest write', () => {
  // fetchedAt describes the entry as a whole, and the staleness bands ask how
  // old the freshest thing here is — not the oldest.
  const stored = mergeParts<Parts>(null, { river: { slug: 'current' } }, '2026-07-01T00:00:00.000Z');
  const after = mergeParts<Parts>(stored, { hazards: [] }, '2026-07-02T00:00:00.000Z');

  assert.equal(after.fetchedAt, '2026-07-02T00:00:00.000Z');
});

test('a merge onto an unreadable entry starts clean rather than throwing', () => {
  // parseEnvelope answers null for a corrupt or wrong-version entry, and that
  // null arrives here. Repair is a write, not a crash.
  const after = mergeParts<Parts>(null, { hazards: [{ id: 'h1' }] }, '2026-07-02T00:00:00.000Z');
  assert.deepEqual(after.payload, { hazards: [{ id: 'h1' }] });
  assert.equal(after.v, CACHE_VERSION);
});

// ── ageing a stored reading ───────────────────────────────────────────────

const HOUR = 3_600_000;
const WRITTEN = '2026-07-01T00:00:00.000Z';
const at = (hoursLater: number) => Date.parse(WRITTEN) + hoursLater * HOUR;

test("a reading's age counts from when it was cached, not from its own timestamp", () => {
  // THE bug. readingAgeHours is a scalar the server computed at request time,
  // so replaying it off disk three days later still prints "an hour ago" — a
  // cached reading claiming to be an hour old forever. The two timestamps
  // differ, and using the reading's own under-reports staleness by exactly the
  // amount that matters.
  assert.equal(effectiveReadingAgeHours(1, WRITTEN, at(0)), 1);
  assert.equal(effectiveReadingAgeHours(1, WRITTEN, at(72)), 73);
});

test('a reading never gets younger when the device clock moves backwards', () => {
  // Trusting a negative elapsed time would age a reading DOWN, which is the one
  // direction this must never round.
  assert.equal(effectiveReadingAgeHours(5, WRITTEN, at(-10)), 5);
});

test('an unknown age is not evidence of freshness', () => {
  // A gauge that never reported has a null age. Treating null as 0 would paint
  // it in a confident condition colour.
  assert.equal(effectiveReadingAgeHours(null, WRITTEN, at(0)), null);
  assert.equal(effectiveReadingAgeHours(undefined, WRITTEN, at(0)), null);
  assert.equal(readingBand(null), 'expired');
});

test('an unreadable cache timestamp is not treated as just-written', () => {
  assert.equal(effectiveReadingAgeHours(1, 'not-a-date', at(0)), null);
  assert.equal(effectiveReadingAgeHours(1, null, at(0)), null);
});

test('the bands turn over at six and forty-eight hours', () => {
  // Six is the same threshold accuracyNote already owns, so the caveat sentence
  // and the greyed chip cannot land on opposite sides of one line.
  assert.equal(readingBand(5.9), 'fresh');
  assert.equal(readingBand(6), 'stale');
  assert.equal(readingBand(47.9), 'stale');
  assert.equal(readingBand(48), 'expired');
});

test('a gauge cache keeps its verdict for under six hours only', () => {
  assert.equal(mayPaintCachedCondition(1, WRITTEN, at(4.9)), true);
  assert.equal(mayPaintCachedCondition(1, WRITTEN, at(5)), false);
  assert.equal(mayPaintCachedCondition(null, WRITTEN, at(0)), false);
});
