import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SAFETY_DISCLAIMER } from '../../../eddy-ios/src/lib/safetyCopy';

test('uses the approved safety disclaimer verbatim', () => {
  assert.equal(
    SAFETY_DISCLAIMER,
    'Conditions are estimated. Always check with local authorities before getting on the water.',
  );
});

test('retired general-purpose safety copy does not return', () => {
  const walk = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return walk(path);
      return /\.tsx?$/.test(entry.name) ? [path] : [];
    });
  // Manual recursion keeps this test on the Node 20 floor used by CI;
  // node:fs globSync was added later.
  const files = [...walk('../eddy-ios/app'), ...walk('../eddy-ios/src')];
  const offenders = files.filter((file) =>
    /always judge the water in front of you/i.test(readFileSync(file, 'utf8')),
  );
  assert.deepEqual(offenders, []);
});

test('static safety copy is not announced as a live alert', () => {
  const component = readFileSync('../eddy-ios/src/components/SafetyDisclaimer.tsx', 'utf8');
  assert.doesNotMatch(component, /accessibilityRole=["']alert["']/);
});
