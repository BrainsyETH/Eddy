import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { routeFixture } from './route-estimate-fixture';
import { savedTimeRangeLabel, validTimeRange } from './saved-time-range';

test('published route range takes priority and scales for low water', async () => {
  const result = await routeFixture({ published: { min: 180, max: 300 }, condition: 'low' }).estimate();
  assert.deepEqual(result.floatTime?.timeRange, { min: 239, max: 399 });
  assert.equal(result.floatTime?.isEstimate, false);
});

test('route service resolves flow and river curve, rather than using a social band shortcut', async () => {
  const flow = await routeFixture({ miles: 7.2, condition: 'good', discharge: 400, reference: 180 }).estimate();
  const band = await routeFixture({ miles: 7.2, condition: 'good' }).estimate();
  assert.notEqual(flow.floatTime?.formatted, band.floatTime?.formatted);
  assert.deepEqual(flow.floatTime?.timeRange, { min: 136, max: 218 });
  const slow = await routeFixture({ condition: 'low', speedCurve: { low: 0.5, too_low: 0.25 } }).estimate();
  assert.equal(slow.floatTime?.timeRange?.min, 480);
});

test('typical route keeps endpoint/published lookup but does not read live water', async () => {
  const fixture = routeFixture({ condition: 'dangerous', published: { min: 180, max: 300 } });
  const result = await fixture.estimate('typical');
  assert.deepEqual(result.floatTime?.timeRange, { min: 180, max: 300 });
  assert.equal(result.estimateBasis, 'typical');
  assert.ok(!fixture.calls.includes('get_river_condition_segment'));
  assert.ok(!fixture.calls.includes('statistics'));
});

test('published times cannot bypass dangerous or regulated withholding', async () => {
  for (const options of [{ condition: 'dangerous' as const }, { riverType: 'dam_tailwater' }]) {
    const result = await routeFixture({ ...options, published: { min: 180, max: 300 } }).estimate();
    assert.equal(result.floatTime, null);
    assert.ok(result.withholdReason);
  }
  assert.equal((await routeFixture({ riverType: 'dam_tailwater' }).estimate('typical')).floatTime, null);
});

test('cross-river endpoints fail before distance or time lookup', async () => {
  const fixture = routeFixture({ wrongRiver: true });
  await assert.rejects(fixture.estimate(), /not on this river/);
  assert.ok(!fixture.calls.includes('get_float_segment'));
});

test('saved previews never manufacture a range from an old average', () => {
  assert.equal(savedTimeRangeLabel({}), null);
  assert.equal(validTimeRange({ min: NaN, max: 200 }), null);
  assert.equal(validTimeRange({ min: 300, max: 200 }), null);
  assert.equal(savedTimeRangeLabel({ estimated_float_min_minutes: 180, estimated_float_max_minutes: 300 }), '~3 hours – ~5 hours');
});

test('all route entry points delegate to the shared service', () => {
  for (const path of ['src/app/api/plan/route.ts', 'src/app/api/route-estimate/route.ts', 'src/app/api/mcp/route.ts', 'src/lib/chat/tool-handlers.ts', 'src/lib/social/post-context.ts', 'src/app/api/favorite-floats/route.ts', 'src/lib/access-points/detail.ts']) {
    const source = readFileSync(path, 'utf8');
    assert.match(source, /await estimateRoute\(|=> estimateRoute\(/, path);
  }
});
