import assert from 'node:assert/strict';
import test from 'node:test';
import { publishableValue } from './dams';

// `%-Flood Pool` is the one dam metric whose meaning is local rather than
// universal, and both surfaces render it unguarded as
// `${value.toFixed(0)}% flood pool`. Every case below is a real reading taken
// from CWMS on 2026-08-02.

test('an ordinary flood-pool percentage passes through untouched', () => {
  assert.equal(publishableValue({}, 'pctFloodPool', 0), 0);
  assert.equal(publishableValue({}, 'pctFloodPool', 2.29), 2.29);
  assert.equal(publishableValue({}, 'pctFloodPool', 90.78), 90.78);
});

test('a rounding-band negative clamps to zero rather than flickering', () => {
  // Tenkiller read -0.39% and +2.29% hours apart, drifting either side of the
  // top of its conservation pool. Dropping the metric on the negative reading
  // would make the row appear and disappear; rendering it raw would have shipped
  // "-0% flood pool".
  assert.equal(publishableValue({}, 'pctFloodPool', -0.39), 0);
  assert.equal(publishableValue({}, 'pctFloodPool', -0.5), 0);
});

test('a meaningfully negative flood pool is omitted, not shown as zero', () => {
  // Broken Bow read -7.52%: drawn down below the flood pool entirely. That is
  // the ordinary summer state, but "% flood pool" cannot express it, and
  // clamping it to 0% would assert the lake is at the top of its conservation
  // pool when it is well below.
  assert.equal(publishableValue({}, 'pctFloodPool', -7.52), null);
  assert.equal(publishableValue({}, 'pctFloodPool', -50), null);
});

test('a suppressed metric is omitted whatever its value', () => {
  // Robert S. Kerr and Webbers Falls hold a constant navigation pool and read
  // 90.78% and 94.23% of flood pool as their normal state — true numbers that
  // tell a reader the opposite of the truth beside Table Rock's 0%.
  const navDam = { suppressMetrics: ['pctFloodPool' as const] };
  assert.equal(publishableValue(navDam, 'pctFloodPool', 90.78), null);
  assert.equal(publishableValue(navDam, 'pctFloodPool', 0), null);
  // Suppression is per-metric: everything else at that dam still publishes.
  assert.equal(publishableValue(navDam, 'release', 0), 0);
  assert.equal(publishableValue(navDam, 'poolElevation', 459.82), 459.82);
});

test('other metrics are never clamped or dropped for being negative', () => {
  // Only flood pool has the below-zero meaning. A negative release or elevation
  // would be a data fault worth surfacing, not something to quietly hide.
  assert.equal(publishableValue({}, 'release', -5), -5);
  assert.equal(publishableValue({}, 'tailwaterTempF', -1), -1);
});
