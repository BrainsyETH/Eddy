import assert from 'node:assert/strict';
import test from 'node:test';
import { MAP_OVERLAYS } from './map-overlays';

test('map overlay definitions have unique ids and complete attribution', () => {
  assert.equal(new Set(MAP_OVERLAYS.map((overlay) => overlay.id)).size, MAP_OVERLAYS.length);
  for (const overlay of MAP_OVERLAYS) {
    assert.ok(overlay.label.length > 0, `${overlay.id} needs a label`);
    assert.ok(overlay.attribution.label.length > 0, `${overlay.id} needs an attribution label`);
    assert.ok(overlay.attribution.source.length > 0, `${overlay.id} needs an attribution source`);
    assert.match(overlay.attribution.url, /^https:\/\//, `${overlay.id} attribution must be https`);
  }
});

test('public-land ownership caveat remains attached to its visible control', () => {
  const publicLand = MAP_OVERLAYS.find((overlay) => overlay.id === 'publicLands');
  assert.match(publicLand?.caveat ?? '', /Ownership, not permission/);
});
