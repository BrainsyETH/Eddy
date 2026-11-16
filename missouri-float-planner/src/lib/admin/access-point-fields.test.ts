import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_FEE_NOTES_LENGTH, parseAmenities, parseFeeNotes } from './access-point-fields';

test('fee notes are trimmed, clearable and bounded', () => {
  assert.equal(parseFeeNotes('  $5 day use, cash only '), '$5 day use, cash only');
  assert.equal(parseFeeNotes('   '), null);
  assert.equal(parseFeeNotes(null), null);
  assert.equal(parseFeeNotes(5), undefined);
  assert.equal(parseFeeNotes('x'.repeat(MAX_FEE_NOTES_LENGTH + 1)), undefined);
});

test('amenities are keys, never free text', () => {
  assert.deepEqual(parseAmenities(['parking', 'restrooms', 'parking']), ['parking', 'restrooms']);
  assert.deepEqual(parseAmenities(['hot_showers']), ['hot_showers'], 'an existing unknown key survives a save');
  assert.deepEqual(parseAmenities([]), []);
  for (const bad of [['Restrooms'], ['boat ramp'], ['<b>x</b>'], [3], 'parking', null, Array(21).fill('parking')])
    assert.equal(parseAmenities(bad), undefined, JSON.stringify(bad));
});
