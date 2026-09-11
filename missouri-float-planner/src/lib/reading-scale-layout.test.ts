import assert from 'node:assert/strict';
import test from 'node:test';

import { anchoredLabelLeft } from '../../../eddy-ios/src/lib/readingScale';

test('centres a current-reading label on its marker', () => {
  assert.equal(anchoredLabelLeft(300, 60, 50), 120);
  assert.equal(anchoredLabelLeft(300, 60, 25), 45);
});

test('keeps the label inside both ends of the scale', () => {
  assert.equal(anchoredLabelLeft(300, 60, 0), 0);
  assert.equal(anchoredLabelLeft(300, 60, 5), 0);
  assert.equal(anchoredLabelLeft(300, 60, 95), 240);
  assert.equal(anchoredLabelLeft(300, 60, 100), 240);
});

test('handles unmeasured, oversized, and out-of-range input safely', () => {
  assert.equal(anchoredLabelLeft(0, 60, 50), 0);
  assert.equal(anchoredLabelLeft(40, 60, 50), 0);
  assert.equal(anchoredLabelLeft(300, 60, -10), 0);
  assert.equal(anchoredLabelLeft(300, 60, 110), 240);
  assert.equal(anchoredLabelLeft(300, 60, Number.NaN), 0);
});
