import assert from 'node:assert/strict';
import test from 'node:test';
import { orderedPlannerEndpoints, plannerSelectionReducer as reduce, type PlannerSelectionHistory } from './planner-selection';

const route: PlannerSelectionHistory = {
  current: { riverSlug: 'current', selectedPutIn: 'akers', selectedTakeOut: 'pulltite' }, past: [],
};

test('Undo restores both endpoints after clearing a complete route in one action', () => {
  const cleared = reduce(route, { type: 'change', patch: { selectedPutIn: null, selectedTakeOut: null } });
  assert.equal(cleared.current.selectedPutIn, null);
  assert.equal(cleared.current.selectedTakeOut, null);
  assert.deepEqual(reduce(cleared, { type: 'undo' }), route);
});

test('Undo restores the prior river and route after browsing and starting another plan', () => {
  const changedRiver = reduce(route, { type: 'change', patch: { riverSlug: 'meramec', selectedPutIn: null, selectedTakeOut: null } });
  const newStart = reduce(changedRiver, { type: 'change', patch: { selectedPutIn: 'meramec-start' } });
  const previous = reduce(newStart, { type: 'undo' });
  assert.deepEqual(previous, changedRiver);
  assert.deepEqual(reduce(previous, { type: 'undo' }), route);
});

test('replacing or clearing one endpoint preserves the other and remains reversible', () => {
  for (const selectedTakeOut of ['round-spring', null]) {
    const updated = reduce(route, { type: 'change', patch: { selectedTakeOut } });
    assert.equal(updated.current.selectedPutIn, 'akers');
    assert.deepEqual(reduce(updated, { type: 'undo' }), route);
  }
});

test('unchanged selections and validation do not create undo steps', () => {
  assert.equal(reduce(route, { type: 'change', patch: { selectedPutIn: 'akers' } }), route);
  const validated = reduce(route, { type: 'validate', patch: { selectedTakeOut: null } });
  assert.deepEqual(validated.past, []);
  assert.equal(reduce(validated, { type: 'undo' }), validated);
});

test('picking endpoints in either order builds the same downstream route', () => {
  const upstream = { id: 'akers', riverMile: 10 };
  const downstream = { id: 'pulltite', riverMile: 20 };
  for (const pair of [[upstream, downstream], [downstream, upstream]]) {
    assert.deepEqual(orderedPlannerEndpoints(pair[0], pair[1]), {
      selectedPutIn: 'akers', selectedTakeOut: 'pulltite',
    });
  }
});

test('Undo reverses automatic ordering as one edit and restores the first pick', () => {
  const firstPick: PlannerSelectionHistory = {
    current: { riverSlug: 'current', selectedPutIn: 'pulltite', selectedTakeOut: null }, past: [],
  };
  const completed = reduce(firstPick, { type: 'change', patch: orderedPlannerEndpoints(
    { id: 'pulltite', riverMile: 20 }, { id: 'akers', riverMile: 10 },
  ) });
  assert.deepEqual(completed.current, route.current);
  assert.deepEqual(reduce(completed, { type: 'undo' }), firstPick);
});
