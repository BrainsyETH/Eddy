import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { terrainMapPlan, terrainMapUrl } from './social-terrain-map';
import { progressAlongRoute, type LngLat } from './social-route-journey';
import { ROUTE_MAP_STAGE, ROUTE_STAGE_TOP } from './social-route-layout';
import { REEL_SAFE } from './social-brand';

const coordinates = JSON.parse(readFileSync(new URL('../remotion/src/fixtures/akers-pulltite.json', import.meta.url), 'utf8')).routeCoordinates as LngLat[];
test('real Akers–Pulltite route and canoe stay inside the reserved map area', () => {
  const plan = terrainMapPlan(coordinates)!;
  for (const p of plan.journey.points) {
    assert.ok(p.x >= 129 && p.x <= ROUTE_MAP_STAGE.width - 129);
    assert.ok(p.y >= 79 && p.y <= ROUTE_MAP_STAGE.height - 79);
  }
  assert.equal(plan.journey.maxDeviationPx, 0);
});
test('north-up map and overlay share the exact provider camera and pixel scale', () => {
  const plan = terrainMapPlan([[-91, 37], [-90.9, 37.1]])!;
  const url = new URL(terrainMapUrl(plan, 'test-token'));
  assert.ok(url.pathname.endsWith(`/${plan.lng},${plan.lat},${plan.zoom},0,0/540x960@2x`));
  assert.equal(url.searchParams.get('access_token'), 'test-token');
  const first = plan.journey.points[0], last = plan.journey.points[1];
  assert.ok(last.x > first.x && last.y < first.y);
  const scale = 1024 * 2 ** plan.zoom;
  assert.ok(Math.abs(first.x + REEL_SAFE.left - (540 + (-91 - plan.lng) / 360 * scale)) < 1e-7);
  const y = (lat: number) => (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2;
  assert.ok(Math.abs(first.y + ROUTE_STAGE_TOP - (960 + (y(37) - y(plan.lat)) * scale)) < 1e-7);
});
test('source progress puts every vertex stop on its correct map coordinate', () => {
  const plan = terrainMapPlan(coordinates)!;
  coordinates.forEach((coordinate, i) => {
    const progress = progressAlongRoute(coordinates, coordinate)!;
    const located = plan.journey.locate(progress);
    assert.ok(Math.hypot(located.point.x - plan.journey.points[i].x, located.point.y - plan.journey.points[i].y) < 1e-6);
  });
  assert.deepEqual(plan.journey.locate(-1).point, plan.journey.points[0]);
  assert.deepEqual(plan.journey.locate(2).point, plan.journey.points.at(-1));
});
test('invalid and unsupported geometry cannot produce a misleading basemap', () => {
  for (const route of [undefined, [], [[1, 1]], [[1, 1], [1, 1]], [[0, 86], [1, 86]], [[179, 30], [-179, 30]]] as (LngLat[] | undefined)[]) {
    assert.equal(terrainMapPlan(route), null);
  }
});
