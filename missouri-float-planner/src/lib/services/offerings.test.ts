import assert from 'node:assert/strict';
import test from 'node:test';
import { offeringSummary } from './offerings';

test('groups a full-service outfitter into Float, Stay and Also lines', () => {
  assert.deepEqual(
    offeringSummary([
      'general_store', 'shuttle', 'camping_rv', 'kayak_rental', 'cabins',
      'canoe_rental', 'showers', 'camping_primitive',
    ]),
    [
      { group: 'Float', text: 'Canoes, kayaks, shuttle' },
      { group: 'Stay', text: 'Cabins, tent sites, RV sites' },
      { group: 'Also', text: 'Store, showers' },
    ],
  );
});

test('names the first extras by priority and counts the rest', () => {
  assert.deepEqual(
    offeringSummary(['wifi', 'swimming_pool', 'showers', 'food_service', 'general_store']),
    [{ group: 'Also', text: 'Store, food, showers +2 more' }],
  );
  assert.deepEqual(offeringSummary(['wifi', 'laundry'], { maxExtras: 0 }), [
    { group: 'Also', text: '+2 more' },
  ]);
});

test('omits empty groups, drops unknown keys and collapses duplicates', () => {
  assert.deepEqual(offeringSummary(['camping_primitive', 'camping_primitive', 'teleporter']), [
    { group: 'Stay', text: 'Tent sites' },
  ]);
  assert.deepEqual(offeringSummary(null), []);
  assert.deepEqual(offeringSummary([]), []);
});

test('keeps acronyms intact when they lead a line', () => {
  assert.deepEqual(offeringSummary(['camping_rv']), [{ group: 'Stay', text: 'RV sites' }]);
  assert.deepEqual(offeringSummary(['wifi']), [{ group: 'Also', text: 'Wi-Fi' }]);
});
