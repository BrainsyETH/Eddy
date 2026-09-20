import assert from 'node:assert/strict';
import test from 'node:test';
import { compactFloatEstimate } from '../../../eddy-ios/src/components/map-sheet/floatEstimate';

test('compact ranges retain both endpoints and quarter-hour precision', () => {
  assert.equal(compactFloatEstimate('~4 hours 30 minutes – ~7 hours 15 minutes'), '4h 30m–7h 15m');
  assert.equal(compactFloatEstimate('~45 minutes – ~1 hour'), '45m–1h');
  assert.equal(compactFloatEstimate('~1.5 hr'), '1.5h');
  assert.equal(compactFloatEstimate('~15 mins'), '15m');
});

test('already short and unfamiliar estimates retain their meaning', () => {
  assert.equal(compactFloatEstimate('2h–3h'), '2h–3h');
  assert.equal(compactFloatEstimate('Under 30 minutes'), 'Under 30m');
  assert.equal(compactFloatEstimate('Depends on releases'), 'Depends on releases');
});
