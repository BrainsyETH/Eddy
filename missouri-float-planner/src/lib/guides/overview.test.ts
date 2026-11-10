import assert from 'node:assert/strict';
import test from 'node:test';
import { guideOverview } from './overview';
import { guideEditorialDate } from './editorial-date';
const route = (geometry: unknown, id = 1) => ({ id, number: id, label: `Route ${id}`, miles: '6', geometry });

test('overview omits missing or invalid geometry and never makes a replacement line', () => {
  for (const geometry of [null, {}, { type: 'Point', coordinates: [-91, 37] }, { type: 'LineString', coordinates: [[-91, 37]] }, { type: 'LineString', coordinates: [[-91, 37], [NaN, 38]] }, { type: 'LineString', coordinates: [[-91, 37], [-191, 38]] }]) {
    assert.deepEqual(guideOverview([route(geometry)]), []);
  }
});

test('projection keeps north up and shared endpoints coincident across route cards', () => {
  const lines = guideOverview([
    route({ type: 'LineString', coordinates: [[-91, 38], [-91, 37.5]] }),
    route({ type: 'LineString', coordinates: [[-91, 37.5], [-90.5, 37]] }, 2),
  ]);
  assert.deepEqual(lines[0].end, lines[1].start);
  assert.ok(lines[0].start[1] < lines[1].end[1]);
  assert.deepEqual(lines.map(l => l.id), [1, 2]);
  for (const line of lines) for (const [x, y] of [line.start, line.end]) assert.ok(x >= 20 && x <= 580 && y >= 20 && y <= 280);
});

test('large geometries stay bounded without losing the final endpoint', () => {
  const coordinates = Array.from({ length: 200000 }, (_, i) => [-91 + i / 1000000, 37 + i / 1000000]);
  const [line] = guideOverview([route({ type: 'LineString', coordinates })]);
  assert.ok(line.path.split(' ').length <= 1201);
  assert.ok(line.end[0] > line.start[0]);
});

test('editorial dates reject impossible, future or operational dates', () => {
  assert.equal(guideEditorialDate({ editorial_updated_at: '2020-02-29' }), '2020-02-29');
  for (const value of ['2025-02-29', '2099-01-01', '2025-01-01T00:00:00Z', 'yesterday', 123]) assert.equal(guideEditorialDate({ editorial_updated_at: value }), undefined);
  assert.equal(guideEditorialDate({ updated_at: '2025-01-01', checked_at: '2025-01-01' }), undefined);
});
