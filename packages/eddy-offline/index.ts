// packages/eddy-offline/index.ts
// Turns a river's centreline into a set of Mapbox offline regions.
//
// WHY THIS IS A SHARED PACKAGE AND NOT IN THE APP: it is pure, it is where the
// download-size policy lives, and it needs tests. The app has no test runner
// yet, so the alternative was re-implementing it inside a web test — which is
// the duplication-then-drift pattern this repo has already been bitten by four
// times. Imports below are relative rather than aliased for the same reason:
// both the Expo bundler and the web's plain tsx runner can resolve them.
//
// WHY A PLANNER AND NOT JUST offlineManager.createPack(bounds): because the
// naive answer is unshippable. Measured against the real Current River geometry
// (632 points, bbox [-91.6614, 36.252224, -90.756214, 37.450406]):
//
//   zoom    plain bounding box    corridor along the line
//   8-12    286 tiles (~10 MB)    187 tiles (~6 MB)
//   8-14    3,919 (~134 MB)       1,237 (~42 MB)
//   8-15    15,511 (~530 MB)      4,079 (~139 MB)
//
// A river's bbox is a rectangle but a river is a line, so most of that
// rectangle is land nowhere near the water. Following the corridor and capping
// at z14 is what gets one river to roughly 42 MB. z15 is not worth 4x the
// download for detail nobody floating a river needs.
//
// The maths lives in packages/eddy-geo so the size we show a user and the size
// we plan against come from one implementation and cannot disagree.

import {
  corridorBoxes,
  estimateBytes,
  formatBytes,
  tileCountForBoxes,
  tileCountForRange,
  type Bounds,
} from '../eddy-geo/index';
import type { RiverDetail } from '../eddy-types/index';

/**
 * Zoom floor. z8 shows the whole Ozark region, which is what someone needs when
 * they lose signal an hour out and want to know where they are relative to the
 * highway.
 */
export const MIN_ZOOM = 8;

/**
 * Zoom ceiling. z14 resolves individual gravel bars and access-road turnoffs.
 * Going to z15 quadruples the download (see the table above) to add detail that
 * only matters at walking scale.
 */
export const MAX_ZOOM = 14;

/**
 * Points per corridor box. Smaller chunks hug the river more tightly and
 * download less, but Mapbox tracks each region separately and the per-region
 * overhead stops being free somewhere around a few dozen. 64 put the Current
 * River at 10 boxes, which is the balance point that produced the 3.2x saving.
 */
export const CHUNK_SIZE = 64;

/**
 * Corridor half-width in kilometres. Wide enough to include the gravel roads
 * and low-water bridges you actually navigate by, narrow enough that the
 * corridor stays a corridor.
 */
export const BUFFER_KM = 2;

/**
 * Mapbox's default per-device offline tile ceiling.
 *
 * This is not a number we may simply raise: `setTileCountLimit`'s own docs say
 * "the Mapbox Terms of Service prohibit changing or bypassing this limit without
 * permission from Mapbox." At ~1,237 tiles for a river at z8-14 that is roughly
 * four rivers stored at once, which is a product constraint, not a bug — the UI
 * has to tell someone to remove a river rather than let a download fail with a
 * native error halfway through.
 *
 * It is also the second reason z15 is out: at ~4,079 tiles per river, ONE river
 * would consume two thirds of the device's entire allowance.
 */
export const TILE_LIMIT = 6000;

export interface TileBudget {
  used: number;
  limit: number;
  remaining: number;
}

export function tileBudget(usedTiles: number, limit = TILE_LIMIT): TileBudget {
  return { used: usedTiles, limit, remaining: Math.max(0, limit - usedTiles) };
}

/** Whether another river fits in what's left. Checked BEFORE starting a download. */
export function fitsInBudget(plan: OfflinePlan, budget: TileBudget): boolean {
  return plan.tileCount <= budget.remaining;
}

export interface OfflineRegion {
  /** Stable per-river, per-chunk id — Mapbox uses it as the pack name. */
  id: string;
  bounds: Bounds;
  /**
   * Tiles this region alone will fetch. Carried per region rather than
   * recomputed because it weights the progress bar and, written into the pack
   * metadata, lets the tile budget be reconstructed without asking Mapbox for a
   * status that can fail while a download is still in flight.
   */
  tileCount: number;
}

export interface OfflinePlan {
  riverSlug: string;
  riverName: string;
  regions: OfflineRegion[];
  minZoom: number;
  maxZoom: number;
  tileCount: number;
  estimatedBytes: number;
  /** Ready to render, e.g. "42 MB". */
  sizeLabel: string;
  /**
   * What the plain bounding box would have cost. Kept so the UI can be honest
   * about the tradeoff and so a regression here is visible rather than silent.
   */
  naiveTileCount: number;
}

/**
 * The four fields a download actually needs.
 *
 * Narrower than RiverDetail on purpose. The iOS map stopped fetching
 * /api/rivers/{slug} — the heaviest call it makes, for a line it never drew —
 * and now takes a river's shape from the statewide dataset it already holds,
 * which is the same geometry at the same resolution. That source has a slug, a
 * name, a line and an extent, and none of RiverDetail's other thirty fields.
 *
 * RiverDetail satisfies this structurally, so every existing caller is
 * unchanged.
 */
export type OfflineRiver = Pick<RiverDetail, 'slug' | 'name' | 'geometry' | 'bounds'>;

/** A river whose geometry never loaded cannot be downloaded — say so, don't guess. */
export function canPlanOffline(river: Pick<RiverDetail, 'geometry'>): boolean {
  return (river.geometry?.coordinates?.length ?? 0) >= 2;
}

export function planOffline(river: OfflineRiver): OfflinePlan | null {
  if (!canPlanOffline(river)) return null;

  const boxes = corridorBoxes(river.geometry.coordinates, CHUNK_SIZE, BUFFER_KM);
  if (boxes.length === 0) return null;

  const regions: OfflineRegion[] = boxes.map((bounds, i) => ({
    id: regionId(river.slug, i),
    bounds,
    tileCount: tileCountForRange(bounds, MIN_ZOOM, MAX_ZOOM),
  }));
  const tileCount = tileCountForBoxes(boxes, MIN_ZOOM, MAX_ZOOM);

  return {
    riverSlug: river.slug,
    riverName: river.name,
    regions,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    tileCount,
    estimatedBytes: estimateBytes(tileCount),
    sizeLabel: formatBytes(estimateBytes(tileCount)),
    naiveTileCount: tileCountForRange(river.bounds, MIN_ZOOM, MAX_ZOOM),
  };
}

/**
 * Pack naming. Every region for a river shares the prefix so the whole river
 * can be found, counted, or deleted without keeping a separate index that could
 * fall out of sync with what Mapbox actually stored on disk.
 */
export function regionId(riverSlug: string, index: number): string {
  return `${regionPrefix(riverSlug)}${index}`;
}

export function regionPrefix(riverSlug: string): string {
  return `river:${riverSlug}:`;
}

export function riverSlugFromRegionId(id: string): string | null {
  const match = /^river:([^:]+):\d+$/.exec(id);
  return match ? match[1] : null;
}

/**
 * The metadata every pack carries, in one place so the writer and the reader
 * cannot drift.
 *
 * `regionCount` is what makes a pack SELF-DESCRIBING: the hook that reads packs
 * back only sees Mapbox's list and has no river geometry to re-plan from, so
 * without this it cannot know that a river should have had ten packs and has
 * four. Writing createPack metadata without it silently disables the whole
 * completeness check, with no other symptom.
 */
export function packMetadata(
  plan: OfflinePlan,
  region: OfflineRegion,
): { riverSlug: string; riverName: string; tileCount: number; regionCount: number } {
  return {
    riverSlug: plan.riverSlug,
    riverName: plan.riverName,
    tileCount: region.tileCount,
    regionCount: plan.regions.length,
  };
}

/**
 * Read `regionCount` back off a pack. 0 when unknown.
 *
 * Coerced rather than trusted because the native bridge stringifies metadata —
 * the same reason the caller already does `Number(...)` on `tileCount`.
 */
export function expectedRegionsFromMetadata(metadata: unknown): number {
  const raw = (metadata as { regionCount?: unknown } | null | undefined)?.regionCount;
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** What is on disk for one river, read back from Mapbox's own pack list. */
export interface RiverPackTally {
  riverSlug: string;
  /** Packs found whose name parses to this river. */
  regionCount: number;
  /** Regions the download was planned for, from pack metadata. 0 = unknown. */
  expectedRegions: number;
  /** Packs whose status() answered, and answered "not finished". */
  unfinishedRegions: number;
  /**
   * Completed tiles. For the BUDGET only, and deliberately over-counting.
   * Explicitly NOT part of the completeness question — see offlineCompleteness.
   */
  tileCount: number;
}

export type OfflineCompleteness = 'absent' | 'partial' | 'complete';

/**
 * Is this river actually saved?
 *
 * ── Why this does NOT compare tile counts ───────────────────────────────────
 * The obvious predicate is `sum(completedTileCount) >= plan.tileCount`, and it
 * is wrong in both directions.
 *
 * It reads HIGH on a broken river: when `status()` throws — which it does for a
 * region still being written — the caller substitutes `metadata.tileCount`, the
 * PLANNED count. So a river whose regions are all half-written can sum to
 * exactly the plan total.
 *
 * It reads LOW on a healthy one: `plan.tileCount` is a plain sum over corridor
 * boxes with no dedupe of overlapping tiles, while Mapbox stores each tile once,
 * so a genuinely complete river legitimately lands under its own estimate.
 *
 * Counting packs is the only signal neither failure corrupts. Downloads run one
 * region at a time, so an interrupted one leaves a clean PREFIX — fewer packs
 * than planned, each individually finished — which is exactly what a count sees
 * and a percentage does not.
 */
export function offlineCompleteness(
  tally: RiverPackTally | undefined,
  plannedRegions?: number,
): OfflineCompleteness {
  if (!tally || tally.regionCount <= 0) return 'absent';

  const expected = tally.expectedRegions || plannedRegions || 0;
  if (expected > 0 && tally.regionCount < expected) return 'partial';

  // Catches the one case counting misses: the LAST region dying mid-write, where
  // the count is right and the data is not.
  if (tally.unfinishedRegions > 0) return 'partial';

  // No expectation to test against — an unknown must not invent a hole and nag
  // someone to repair a river that is fine.
  return 'complete';
}

/**
 * Progress across a multi-region download.
 *
 * Mapbox reports percentage per region, so a plain average would let a tiny
 * 40-tile chunk finishing count as much as a 400-tile one and make the bar jump
 * around. Weighting by tile count keeps it monotonic and roughly truthful.
 */
export function overallProgress(
  regions: OfflineRegion[],
  percentByRegionId: Record<string, number>,
): number {
  let weighted = 0;
  let total = 0;
  for (const region of regions) {
    const weight = region.tileCount;
    total += weight;
    const pct = Math.max(0, Math.min(100, percentByRegionId[region.id] ?? 0));
    weighted += weight * pct;
  }
  if (total === 0) return 0;
  return Math.round(weighted / total);
}
