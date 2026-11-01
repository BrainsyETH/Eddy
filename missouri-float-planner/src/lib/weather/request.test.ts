import assert from 'node:assert/strict';
import test from 'node:test';
import { BoundedTtlCache, parseWeatherCoords } from './request';

const parse = (query: string) => parseWeatherCoords(new URLSearchParams(query));

test('coordinates snap to the same 0.05° grid the iOS app quantises to', () => {
  const result = parse('lat=37.1234&lon=-91.4321');
  assert.deepEqual(result, { ok: true, lat: 37.1, lon: -91.45, key: '37.1,-91.45' });
  // Two nearby points are one upstream call, not two.
  assert.equal((parse('lat=37.11&lon=-91.44') as { key: string }).key, '37.1,-91.45');
});

test('non-numbers and locations outside the US are rejected before any paid call', () => {
  for (const query of ['lat=abc&lon=-91', 'lat=NaN&lon=-91', 'lat=37', 'lat=48.85&lon=2.35', 'lat=-33.9&lon=151.2', 'lat=1e9&lon=-91']) {
    assert.equal(parse(query).ok, false, query);
  }
  assert.equal(parse('lat=61.2&lon=-149.9').ok, true, 'Alaska is in');
  assert.equal(parse('lat=21.3&lon=-157.8').ok, true, 'Hawaii is in');
});

test('the cache is bounded and evicts the least recently used entry', () => {
  const cache = new BoundedTtlCache<number>(60_000, 2);
  cache.set('a', 1, 0);
  cache.set('b', 2, 0);
  cache.get('a', 1); // a is now most recent
  cache.set('c', 3, 2);
  assert.equal(cache.size, 2);
  assert.equal(cache.get('b', 3), undefined, 'b was least recently used');
  assert.equal(cache.get('a', 3), 1);
});

test('entries expire after their TTL', () => {
  const cache = new BoundedTtlCache<number>(1000);
  cache.set('a', 1, 0);
  assert.equal(cache.get('a', 999), 1);
  assert.equal(cache.get('a', 1000), undefined);
});
