import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesMapSearch, plannerMapPlaces } from './planner-map-catalog';
import type { MOAccessPoint, MODataset, MORiver } from './usgs/mo-statewide-data';

const point = (extra: Partial<MOAccessPoint> = {}): MOAccessPoint => ({
  id: 'akers', name: 'Akers Ferry', slug: 'akers-ferry', type: 'access',
  river_mile_downstream: 10, lon: -91.5, lat: 37.3, ownership: 'Public', ...extra,
});
const river = (access_points: MOAccessPoint[] | null, extra: Partial<MORiver> = {}): MORiver => ({
  id: 'current', slug: 'current', name: 'Current River', region: 'Ozarks', length_miles: 100,
  geometry: { type: 'LineString', coordinates: [[-91.5, 37.3], [-91.4, 37.2]] },
  gauges: null, pois: null, access_points, ...extra,
});
const dataset = (...rivers: MORiver[]): MODataset => ({ rivers, campgrounds: [], generated_at: '2026-10-26T00:00:00Z' });

test('map search matches all words across fields regardless of case, accents, order or whitespace', () => {
  assert.equal(matchesMapSearch('  FERRY   current ', 'Akers Ferry', 'Current River'), true);
  assert.equal(matchesMapSearch('cafe riviere', 'Café', 'Rivière'), true);
  assert.equal(matchesMapSearch('akers meramec', 'Akers Ferry', 'Current River'), false);
  assert.equal(matchesMapSearch('  ', undefined, null), true);
  assert.equal(matchesMapSearch('current', undefined, null), false);
});

test('an unavailable or slim catalogue has no access results', () => {
  assert.deepEqual(plannerMapPlaces(undefined), []);
  assert.deepEqual(plannerMapPlaces(dataset()), []);
  assert.deepEqual(plannerMapPlaces(dataset(river(null))), []);
});

test('access places carry their river identity and coordinates without changing the catalogue', () => {
  const input = dataset(river([point()]));
  const before = structuredClone(input);
  assert.deepEqual(plannerMapPlaces(input), [{
    id: 'akers', name: 'Akers Ferry', slug: 'akers-ferry', riverId: 'current',
    riverSlug: 'current', riverName: 'Current River', coordinates: { lng: -91.5, lat: 37.3 },
  }]);
  assert.deepEqual(input, before);
});

test('invalid coordinates are excluded while geographic boundary values remain valid', () => {
  const invalid = [point({ lon: NaN }), point({ lat: Infinity }), point({ lon: 181 }),
    point({ lon: -181 }), point({ lat: 91 }), point({ lat: -91 }),
    point({ lon: null as unknown as number }), point({ lat: undefined as unknown as number })];
  const result = plannerMapPlaces(dataset(river([...invalid, point({ lon: -180, lat: 90 }),
    point({ id: 'south', lon: 180, lat: -90 })])));
  assert.deepEqual(result.map(p => p.coordinates), [{ lng: -180, lat: 90 }, { lng: 180, lat: -90 }]);
});

test('duplicates collapse within a river, preserving a shared access on another river', () => {
  const result = plannerMapPlaces(dataset(river([point(), point()]),
    river([point()], { id: 'jacks-fork', slug: 'jacks-fork', name: 'Jacks Fork' })));
  assert.deepEqual(result.map(p => [p.riverId, p.id]), [['current', 'akers'], ['jacks-fork', 'akers']]);
});
