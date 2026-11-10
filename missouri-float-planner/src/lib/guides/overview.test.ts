import assert from 'node:assert/strict';
import test from 'node:test';
import { guideOverview, guideOverviewMap } from './overview';
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

test('a step past a bend and back is dropped, and the access-point ends never move', () => {
  // The real tail of Buffalo City → Norfork on the White: the stored line steps east, then back west.
  const coordinates = [[-92.4403, 36.16413], [-92.41559, 36.18858], [-92.30795, 36.23036], [-92.30152, 36.22729], [-92.29453, 36.21506],
    [-92.29103, 36.21087], [-92.28981, 36.21083], [-92.29064, 36.2104], [-92.29039, 36.20925]];
  const [line] = guideOverview([route({ type: 'LineString', coordinates })]);
  const xs = line.path.split(' ').map(p => Number(p.slice(1).split(',')[0]));
  assert.equal(xs.length, coordinates.length - 1);
  assert.equal(Math.max(...xs), Number(line.end[0].toFixed(1)), 'nothing is drawn beyond the take-out');
  const straight = guideOverview([route({ type: 'LineString', coordinates: [[-91, 37], [-90.9, 37.05], [-90.8, 37]] })])[0];
  assert.equal(straight.path.split(' ').length, 3, 'an ordinary bend is kept');
});

test('the river line shares the featured stretches’ projection and is optional', () => {
  const stretch = route({ type: 'LineString', coordinates: [[-91, 37.5], [-90.5, 37]] });
  const map = guideOverviewMap([stretch], { type: 'LineString', coordinates: [[-92, 38], [-91, 37.5], [-90.5, 37], [-90, 36.5]] });
  assert.ok(map.river?.includes(map.routes[0].path.slice(1).split(' ')[0]), 'the river passes through the stretch’s start');
  assert.equal(guideOverviewMap([stretch]).river, null);
  assert.equal(guideOverviewMap([stretch], { type: 'Point', coordinates: [-91, 37] }).river, null);
  assert.deepEqual(guideOverviewMap([], { type: 'LineString', coordinates: [[-92, 38], [-91, 37.5]] }), { routes: [], river: null });
});
