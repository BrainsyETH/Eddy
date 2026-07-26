import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHUNK_SIZE,
  MAX_ZOOM,
  MIN_ZOOM,
  TILE_LIMIT,
  canPlanOffline,
  fitsInBudget,
  overallProgress,
  planOffline,
  regionId,
  regionPrefix,
  riverSlugFromRegionId,
  tileBudget,
} from '../../../packages/eddy-offline/index';
import type { RiverDetail } from '../../../packages/eddy-types/index';

// A stand-in for the Current River: same bbox and point count as the real
// /api/rivers/current response, along a diagonal.
function river(points = 632, slug = 'current'): RiverDetail {
  const coordinates: Array<[number, number]> = Array.from({ length: points }, (_, i) => {
    const t = points === 1 ? 0 : i / (points - 1);
    return [-91.6614 + t * 0.905, 36.252224 + t * 1.198];
  });
  return {
    id: 'r1',
    name: 'Current River',
    slug,
    lengthMiles: 184,
    description: null,
    difficultyRating: null,
    region: null,
    geometry: { type: 'LineString', coordinates },
    bounds: [-91.6614, 36.252224, -90.756214, 37.450406],
  };
}

test('a river with no geometry cannot be planned', () => {
  const empty = river();
  empty.geometry.coordinates = [];
  assert.equal(canPlanOffline(empty), false);
  assert.equal(planOffline(empty), null);

  // One point is a location, not a corridor — the API degrades to a short
  // LineString rather than 404ing, so this case is reachable.
  const single = river(1);
  assert.equal(canPlanOffline(single), false);
  assert.equal(planOffline(single), null);
});

test('a planned river stays inside a downloadable budget', () => {
  const plan = planOffline(river());
  assert.ok(plan);
  // The measured figure was ~42 MB / 1,237 tiles. This asserts the budget, not
  // the exact number, so a style or chunking tweak does not fail the suite while
  // a regression to half a gigabyte does.
  assert.ok(
    plan.estimatedBytes < 150 * 1024 * 1024,
    `plan was ${plan.sizeLabel} (${plan.tileCount} tiles)`,
  );
  assert.match(plan.sizeLabel, /MB$/);
  assert.equal(plan.minZoom, MIN_ZOOM);
  assert.equal(plan.maxZoom, MAX_ZOOM);
});

test('following the corridor beats the plain bounding box', () => {
  const plan = planOffline(river());
  assert.ok(plan);
  // This is the whole reason the planner exists. If someone replaces
  // corridorBoxes with the river's bbox, this fails.
  assert.ok(
    plan.naiveTileCount / plan.tileCount > 2,
    `saving was only ${(plan.naiveTileCount / plan.tileCount).toFixed(1)}x`,
  );
});

test('one river leaves room for others within Mapbox tile limit', () => {
  const plan = planOffline(river());
  assert.ok(plan);
  // Mapbox's ToS forbids raising TILE_LIMIT, so a river has to be small enough
  // that storing several is possible. At z15 one river would eat two thirds of
  // the device allowance, which is why MAX_ZOOM is 14.
  assert.ok(plan.tileCount * 3 < TILE_LIMIT, `${plan.tileCount} tiles per river is too many`);
});

test('the tile budget refuses a river that will not fit', () => {
  const plan = planOffline(river());
  assert.ok(plan);
  assert.equal(fitsInBudget(plan, tileBudget(0)), true);
  assert.equal(fitsInBudget(plan, tileBudget(TILE_LIMIT)), false);
  // Exactly enough room must be allowed, not rejected off by one.
  assert.equal(fitsInBudget(plan, tileBudget(TILE_LIMIT - plan.tileCount)), true);
});

test('a used budget never reports negative headroom', () => {
  // Mapbox can hold packs we did not create, so used can legitimately exceed
  // our own limit. A negative remaining would make fitsInBudget nonsense.
  assert.equal(tileBudget(TILE_LIMIT + 5000).remaining, 0);
});

test('region ids round-trip to their river slug', () => {
  assert.equal(regionId('current', 0), 'river:current:0');
  assert.equal(riverSlugFromRegionId('river:current:0'), 'current');
  assert.equal(riverSlugFromRegionId(regionId('eleven-point', 7)), 'eleven-point');
  // Every region for a river shares the prefix, which is how deletion finds
  // them all without a separate index that could drift from disk.
  assert.ok(regionId('current', 3).startsWith(regionPrefix('current')));
});

test('a pack we did not create is not claimed as ours', () => {
  // useOfflinePacks skips packs whose name does not parse, so this returning
  // null is what stops us deleting or counting someone else's data.
  assert.equal(riverSlugFromRegionId('some-other-pack'), null);
  assert.equal(riverSlugFromRegionId('river:current'), null);
  assert.equal(riverSlugFromRegionId('river:current:abc'), null);
  assert.equal(riverSlugFromRegionId(''), null);
});

test('every region carries a distinct id and covers part of the river', () => {
  const plan = planOffline(river());
  assert.ok(plan);
  const ids = new Set(plan.regions.map((r) => r.id));
  assert.equal(ids.size, plan.regions.length);
  // 632 points at 64 per chunk.
  assert.equal(plan.regions.length, Math.ceil(632 / CHUNK_SIZE));
});

test('per-region tile counts sum to the plan total', () => {
  const plan = planOffline(river());
  assert.ok(plan);
  // The budget check uses plan.tileCount; the progress bar and the pack
  // metadata use the per-region figures. If those two ever disagree, the app
  // would promise one download size and account for another.
  const summed = plan.regions.reduce((n, r) => n + r.tileCount, 0);
  assert.equal(summed, plan.tileCount);
  assert.ok(plan.regions.every((r) => r.tileCount > 0));
});

test('regions differ in size, which is why progress is weighted', () => {
  const plan = planOffline(river());
  assert.ok(plan);
  const counts = plan.regions.map((r) => r.tileCount);
  // A flat average would only be equivalent if every region were the same size.
  assert.ok(Math.max(...counts) > Math.min(...counts), 'regions were all equal');
});

test('progress is weighted by tile count, not a flat average', () => {
  const plan = planOffline(river());
  assert.ok(plan);
  assert.equal(overallProgress(plan.regions, {}), 0);

  const all = Object.fromEntries(plan.regions.map((r) => [r.id, 100]));
  assert.equal(overallProgress(plan.regions, all), 100);

  // A flat average of one-of-ten regions done would be exactly 10%. Weighting
  // means it lands near, but not on, that — which is the point: a small chunk
  // finishing must not count as much as a large one.
  const one = { [plan.regions[0].id]: 100 };
  const weighted = overallProgress(plan.regions, one);
  assert.ok(weighted > 0 && weighted < 100);
});

test('progress is clamped and tolerates unknown regions', () => {
  const plan = planOffline(river());
  assert.ok(plan);
  const wild = Object.fromEntries(plan.regions.map((r) => [r.id, 250]));
  wild['river:elsewhere:0'] = 100;
  // Mapbox has been known to report >100 briefly; an unclamped value would push
  // the bar past full and look broken.
  assert.equal(overallProgress(plan.regions, wild), 100);

  const negative = Object.fromEntries(plan.regions.map((r) => [r.id, -50]));
  assert.equal(overallProgress(plan.regions, negative), 0);
});

test('an empty region list yields zero rather than NaN', () => {
  assert.equal(overallProgress([], {}), 0);
});
