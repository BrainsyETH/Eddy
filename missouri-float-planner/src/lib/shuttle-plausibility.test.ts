import assert from 'node:assert/strict';
import test from 'node:test';
import { assessShuttlePlausibility } from './shuttle-plausibility';

test('allows ordinary shuttle routes', () => {
  assert.equal(assessShuttlePlausibility(18, 10).anomaly, false);
});

test('flags very long shuttle routes even without comparison data', () => {
  assert.equal(assessShuttlePlausibility(75.34).anomaly, true);
});

test('flags an extreme road-to-trip ratio', () => {
  assert.equal(assessShuttlePlausibility(45, 10).anomaly, true);
});

test('fails safely for invalid output', () => {
  assert.equal(assessShuttlePlausibility(0).anomaly, true);
});
