import assert from 'node:assert/strict';
import test from 'node:test';
import { plannerSelectionReducer as reduce, type PlannerSelectionHistory } from './planner-selection';

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
