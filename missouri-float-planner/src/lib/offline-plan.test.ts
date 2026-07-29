import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHUNK_SIZE,
  MAX_ZOOM,
  MIN_ZOOM,
  TILE_LIMIT,
  canPlanOffline,
  expectedRegionsFromMetadata,
  fitsInBudget,
  offlineCompleteness,
  overallProgress,
  packMetadata,
  planOffline,
  regionId,
  regionPrefix,
  riverSlugFromRegionId,
  tileBudget,
  type RiverPackTally,
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

// ── is a river actually saved? ───────────────────────────────────

function tally(overrides: Partial<RiverPackTally> = {}): RiverPackTally {
  return {
    riverSlug: 'current',
    regionCount: 10,
    expectedRegions: 10,
    unfinishedRegions: 0,
    tileCount: 1237,
    ...overrides,
  };
}

test('a river with fewer packs than regions is not saved', () => {
  // THE bug. A download killed after region 4 of 10 leaves four finished packs,
  // and useOfflinePacks reported the river "Saved on this phone" on the
  // strength of any pack existing at all — then the user drove to the river.
  assert.equal(offlineCompleteness(tally({ regionCount: 4 })), 'partial');
});

test('a river with no packs is absent, not partial', () => {
  // The two drive different buttons — "Download 42 MB" vs "Finish saving this
  // map". Collapsing them offers a repair for a river never downloaded.
  assert.equal(offlineCompleteness(undefined), 'absent');
  assert.equal(offlineCompleteness(tally({ regionCount: 0 })), 'absent');
});

test('a pack that never finished writing keeps the river partial', () => {
  // Region count alone misses the LAST region dying mid-write: the count is
  // right and the data is not.
  assert.equal(offlineCompleteness(tally({ unfinishedRegions: 1 })), 'partial');
});

test('completeness never asks about tile counts', () => {
  // The obvious "simplification" here is `sumCompleted >= plan.tileCount`, and
  // it is wrong in BOTH directions. It reads high on a broken river, because
  // refresh() substitutes the PLANNED count from metadata whenever status()
  // throws; and low on a healthy one, because plan.tileCount does not dedupe
  // tiles shared by overlapping corridor boxes while Mapbox stores each once.
  assert.equal(offlineCompleteness(tally({ tileCount: 1 })), 'complete');
  assert.equal(offlineCompleteness(tally({ tileCount: 999_999 })), 'complete');
});

test('a complete river reading below its own tile estimate is still complete', () => {
  // The concrete form of the case above, and the reason a tile predicate would
  // have looked fine in testing and failed on a real device.
  const plan = planOffline(river())!;
  assert.ok(plan.tileCount > 0);
  assert.equal(
    offlineCompleteness(tally({ regionCount: plan.regions.length, tileCount: 1 })),
    'complete',
  );
});

test('pack metadata carries the region count the download was planned for', () => {
  // Writing createPack metadata without regionCount silently disables the whole
  // completeness check, with no other symptom — refresh() has no geometry to
  // re-plan from, so a pack is the only thing that can say how many siblings it
  // should have had.
  const plan = planOffline(river())!;
  const meta = packMetadata(plan, plan.regions[0]);

  assert.equal(meta.regionCount, plan.regions.length);
  assert.equal(expectedRegionsFromMetadata(meta), plan.regions.length);
});

test('metadata from the native bridge is coerced, not trusted', () => {
  // The bridge stringifies metadata — the hook already does Number() on
  // tileCount for exactly this reason.
  assert.equal(expectedRegionsFromMetadata({ regionCount: '10' }), 10);
  assert.equal(expectedRegionsFromMetadata({ regionCount: 'x' }), 0);
  assert.equal(expectedRegionsFromMetadata({ regionCount: -1 }), 0);
  assert.equal(expectedRegionsFromMetadata({}), 0);
  assert.equal(expectedRegionsFromMetadata(null), 0);
  assert.equal(expectedRegionsFromMetadata(undefined), 0);
});

test('a pack set written before regionCount existed falls back to the plan', () => {
  // Every pack on an already-installed phone lacks the new field. The row
  // supplies plan.regions.length so those installs are still checked.
  assert.equal(offlineCompleteness(tally({ expectedRegions: 0, regionCount: 4 }), 10), 'partial');
  assert.equal(offlineCompleteness(tally({ expectedRegions: 0, regionCount: 10 }), 10), 'complete');
});

test('an unknown expected count never invents a hole', () => {
  // No metadata and no plan means no expectation. Reporting 'partial' there
  // would nag every legacy install to repair a river that is fine.
  assert.equal(offlineCompleteness(tally({ expectedRegions: 0, regionCount: 4 })), 'complete');
});
