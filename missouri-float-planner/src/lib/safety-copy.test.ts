import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { SAFETY_DISCLAIMER } from '../../../eddy-ios/src/lib/safetyCopy';

test('uses the approved safety disclaimer verbatim', () => {
  assert.equal(
    SAFETY_DISCLAIMER,
    'Conditions are estimated. Always check with local authorities before getting on the water.',
  );
});

test('retired general-purpose safety copy does not return', () => {
  const files = globSync('../eddy-ios/{app,src}/**/*.{ts,tsx}');
  const offenders = files.filter((file) =>
    /always judge the water in front of you/i.test(readFileSync(file, 'utf8')),
  );
  assert.deepEqual(offenders, []);
});
