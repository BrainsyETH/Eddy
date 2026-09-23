import { strict as assert } from 'node:assert';
import { test } from 'node:test';

test('chart date windows use readable UTC calendar dates', async () => {
  const { chartDateRange } = await import('../../../eddy-ios/src/lib/chartDateRange');
  assert.equal(chartDateRange('2026-09-16T00:00:00Z', '2026-09-23T23:59:59Z'), 'Sep 16–23');
  assert.equal(chartDateRange('2026-08-30', '2026-09-02'), 'Aug 30 – Sep 2');
  assert.equal(chartDateRange('2025-12-30', '2026-01-02'), 'Dec 30, 2025 – Jan 2, 2026');
  assert.equal(chartDateRange('bad', '2026-01-02'), 'Selected dates');
});
