import assert from 'node:assert/strict';
import test from 'node:test';
import { compareReadRivers, selectReadRail, readRailState } from '../../../eddy-ios/src/lib/readRail';

test('rail excludes featured rivers before limiting and preserves ranking', () => {
  const ranked = ['a', 'b', 'c', 'd', 'e'];
  assert.deepEqual(selectReadRail(ranked, new Set(['a', 'c']), id => id), ['b', 'd', 'e']);
  assert.deepEqual(ranked, ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(selectReadRail(ranked, new Set(ranked), id => id), ['a', 'b', 'c']);
  assert.deepEqual(selectReadRail(ranked, new Set(['a', 'b', 'c', 'd']), id => id), ['e']);
  assert.deepEqual(selectReadRail([], new Set(), String), []);
});

test('wrapped validated Reads use the same selection and retain their content', () => {
  const reads = ['a', 'b', 'c', 'd'].map(id => ({ river: { id }, prose: `Read ${id}` }));
  assert.deepEqual(selectReadRail(reads, new Set(['b']), item => item.river.id), [reads[0], reads[2], reads[3]]);
});

test('loading placeholders disappear on success, empty response or failure', () => {
  assert.equal(readRailState(0, true, false), 'loading');
  assert.equal(readRailState(3, false, false), 'ready');
  assert.equal(readRailState(0, false, false), 'empty');
  assert.equal(readRailState(0, false, true), 'error');
  assert.equal(readRailState(0, true, true), 'error');
  assert.equal(readRailState(3, true, false), 'ready');
  assert.equal(readRailState(3, false, true), 'ready');
});

test('Read ordering: favorites, then nearest, then most floatable, then newest prose, then name', () => {
  const river = (id: string, code = 'good') => ({ id, name: id.toUpperCase(), currentCondition: { code } });
  const rivers = [river('a', 'low'), river('b'), river('c'), river('d', 'dangerous'), river('e')];
  const favorites = new Set(['e']);
  const distances = new Map([['a', 5], ['b', 30], ['c', 30], ['d', 1]]);
  const context = { isFavorite: (id: string) => favorites.has(id), distances };
  const written: Record<string, string> = { b: '2026-09-24T10:00:00Z', c: '2026-09-24T12:00:00Z' };

  const candidates = [...rivers].sort((x, y) => compareReadRivers(x, y, context)).map((r) => r.id);
  // e is a favorite; d is nearest despite its condition; b and c tie on everything but name.
  assert.deepEqual(candidates, ['e', 'd', 'a', 'b', 'c']);

  const settled = [...rivers]
    .sort((x, y) => compareReadRivers(x, y, context, { a: written[x.id], b: written[y.id] }))
    .map((r) => r.id);
  // Only the prose-age tiebreak differs: c was written more recently than b.
  assert.deepEqual(settled, ['e', 'd', 'a', 'c', 'b']);
  // So the first three a candidate rail shows are the three the Reads settle on.
  assert.deepEqual(candidates.slice(0, 3), settled.slice(0, 3));
});

test('without a location, condition decides after favorites', () => {
  const river = (id: string, code: string) => ({ id, name: id, currentCondition: { code } });
  const ordered = [river('x', 'unknown'), river('y', 'good'), river('z', 'low')]
    .sort((a, b) => compareReadRivers(a, b, { isFavorite: () => false, distances: null }))
    .map((r) => r.id);
  assert.equal(ordered[ordered.length - 1], 'x');
});
