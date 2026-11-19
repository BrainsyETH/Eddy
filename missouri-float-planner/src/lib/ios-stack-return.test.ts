// The iOS dam and lake screens link to each other. This is the rule that keeps
// that pair from growing the back stack: a link to the screen directly
// underneath goes back to it. eddy-ios has no test runner, so it is tested here.

import assert from 'node:assert/strict';
import test from 'node:test';
import { previousRouteIs } from '../../../eddy-ios/src/lib/stackReturn';

const dam = (damId: string) => ({ name: 'dam/[damId]', params: { damId } });
const lake = (slug: string) => ({ name: 'lake/[slug]', params: { slug, name: 'Table Rock Lake' } });

test('a lake opened from its dam returns to that dam, and the dam returns to that lake', () => {
  // reports → Table Rock Dam → Table Rock Lake (focused): the lake's own dam row goes back.
  const onLake = { index: 2, routes: [{ name: 'reports' }, dam('swl-table-rock-dam'), lake('table-rock')] };
  assert.equal(previousRouteIs(onLake, 'dam/[damId]', 'damId', 'swl-table-rock-dam'), true);
  // reports → lake → its dam (focused): the dam's lake button goes back.
  const onDam = { index: 2, routes: [{ name: 'reports' }, lake('table-rock'), dam('swl-table-rock-dam')] };
  assert.equal(previousRouteIs(onDam, 'lake/[slug]', 'slug', 'table-rock'), true);
});

test('any other target is a new destination and is pushed', () => {
  const onLake = { index: 2, routes: [{ name: 'reports' }, dam('swl-table-rock-dam'), lake('table-rock')] };
  // A different dam (Beaver, upstream) is not the screen underneath.
  assert.equal(previousRouteIs(onLake, 'dam/[damId]', 'damId', 'swl-beaver-dam'), false);
  // The same dam further down the stack is not "back": going back would land somewhere else.
  const deeper = { index: 3, routes: [dam('swl-table-rock-dam'), { name: 'river/[slug]', params: { slug: 'taneycomo' } }, { name: 'reports' }, lake('table-rock')] };
  assert.equal(previousRouteIs(deeper, 'dam/[damId]', 'damId', 'swl-table-rock-dam'), false);
  // Only what sits UNDER the focused screen counts, not what was pushed above it.
  const behind = { index: 0, routes: [lake('table-rock'), dam('swl-table-rock-dam')] };
  assert.equal(previousRouteIs(behind, 'dam/[damId]', 'damId', 'swl-table-rock-dam'), false);
});

test('a cold link, a missing state and a route with no params all push', () => {
  assert.equal(previousRouteIs(undefined, 'dam/[damId]', 'damId', 'x'), false);
  assert.equal(previousRouteIs({ index: 0, routes: [lake('table-rock')] }, 'dam/[damId]', 'damId', 'x'), false);
  assert.equal(previousRouteIs({ index: 1, routes: [{ name: 'dam/[damId]' }, lake('table-rock')] }, 'dam/[damId]', 'damId', 'x'), false);
});
