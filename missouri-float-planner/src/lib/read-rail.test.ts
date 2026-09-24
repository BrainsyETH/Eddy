import assert from 'node:assert/strict';
import test from 'node:test';
import { selectReadRail, readRailState } from '../../../eddy-ios/src/lib/readRail';

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
