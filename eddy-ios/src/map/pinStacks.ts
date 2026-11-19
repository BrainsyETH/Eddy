// eddy-ios/src/map/pinStacks.ts
// Overlapping places, grouped and opened the way the web planner map does it.
//
// ── Why the app groups them itself ──────────────────────────────────────────
// The web planner puts every access point, POI and gauge in ONE clustered
// source, so MapLibre groups a campground with the gauge beside it. This map
// draws each layer from its own source, and native clustering never looks
// across sources: a tent and a gauge 30pt apart were two marks a finger could
// not tell apart. So the grouping runs here, across the layers that are drawn
// as individual marks at the current zoom, with the web's numbers.
//
// ── The web rules this mirrors (PlannerMarkerLayer.tsx) ─────────────────────
//   - clusterRadius 56, at 512-point tiles, clustering to zoom 22;
//   - a numbered marker stands in for its members;
//   - tapping it below zoom 13 eases in to the zoom where it splits (capped at
//     15), when that is more than half a level away;
//   - otherwise it opens "N places here" and the reader chooses.
// Hazards join a group like any other place, on both platforms.
//
// ── Every zoom, ahead ───────────────────────────────────────────────────────
// stackLevels groups every whole zoom from the cluster rung up, so the map can
// hold all of them and let Mapbox pick the level per tile, as its own clusters
// do. It must equal pinStacks at each level; the web suite checks that.
//
// ── A pure .ts module, on purpose ───────────────────────────────────────────
// The Expo app has no test runner; the web suite imports this file directly.

export const STACK_RADIUS = 56;
export const STACK_ZOOM_IN_BELOW = 13;
export const STACK_MAX_ZOOM_IN = 15;
export const STACK_MAX_ZOOM = 22;
const TILE_SIZE = 512;

export interface StackCandidate {
  id: string;
  lng: number;
  lat: number;
}

export interface PinStack {
  /** Stable for the same members: `stack:` plus the sorted member IDs. */
  id: string;
  /** Sorted member IDs. Always two or more. */
  ids: string[];
  lng: number;
  lat: number;
  /** The first whole zoom at which the members no longer all share a group. */
  expansionZoom: number;
}

export type StackTap = { type: 'zoom'; zoom: number } | { type: 'choose' };

/** Web Mercator, in points at `zoom` for 512-point tiles. */
function project(lng: number, lat: number, zoom: number): [number, number] {
  const scale = TILE_SIZE * 2 ** zoom;
  const sin = Math.min(0.9999, Math.max(-0.9999, Math.sin((lat * Math.PI) / 180)));
  return [
    (lng / 360 + 0.5) * scale,
    (0.5 - (0.25 * Math.log((1 + sin) / (1 - sin))) / Math.PI) * scale,
  ];
}

/**
 * One number per grid cell. Cells are at most 2^31 / 56 < 2^26 across at zoom
 * 22, so the pair fits a double exactly (offset by one to keep -1 positive).
 */
const cellKey = (cx: number, cy: number) => (cx + 1) * 2 ** 27 + (cy + 1);

/**
 * Greedy grouping over places already sorted by ID and projected at zoom 0;
 * `scale` (2^zoom) takes them to the zoom being grouped. Scaling by a power
 * of two is exact, so this is the same arithmetic as projecting at that zoom,
 * and the sort and the trigonometry are done once however many zooms are asked.
 * Returns indices into `base`, each group led by its seed (its lowest ID).
 */
function groupProjected(
  base: readonly (readonly [number, number])[],
  scale: number,
  radius: number,
  members: readonly number[] = base.map((_, index) => index),
): number[][] {
  // A grid of radius-sized cells, so each seed only measures its neighbours.
  const cells = new Map<number, number[]>();
  const cellX = (index: number) => Math.floor((base[index][0] * scale) / radius);
  const cellY = (index: number) => Math.floor((base[index][1] * scale) / radius);
  for (const index of members) {
    const key = cellKey(cellX(index), cellY(index));
    const cell = cells.get(key);
    if (cell) cell.push(index);
    else cells.set(key, [index]);
  }
  const claimed = new Uint8Array(base.length);
  const groups: number[][] = [];
  for (const seed of members) {
    if (claimed[seed]) continue;
    claimed[seed] = 1;
    const group = [seed];
    const sx = base[seed][0] * scale;
    const sy = base[seed][1] * scale;
    const cx = cellX(seed);
    const cy = cellY(seed);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const cell = cells.get(cellKey(cx + dx, cy + dy));
        if (!cell) continue;
        for (const other of cell) {
          if (claimed[other]) continue;
          if (Math.hypot(base[other][0] * scale - sx, base[other][1] * scale - sy) <= radius) {
            claimed[other] = 1;
            group.push(other);
          }
        }
      }
    }
    groups.push(group);
  }
  return groups;
}

const byId = (a: StackCandidate, b: StackCandidate) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const atZoomZero = (points: readonly StackCandidate[]) => points.map((point) => project(point.lng, point.lat, 0));

/**
 * Greedy grouping, the way supercluster seeds its clusters: each unclaimed
 * place, in ID order, claims every unclaimed place within `radius` points of
 * it. ID order keeps the result identical however the layers arrive.
 */
export function groupByScreenDistance(
  points: readonly StackCandidate[],
  zoom: number,
  radius = STACK_RADIUS,
): StackCandidate[][] {
  const ordered = [...points].sort(byId);
  return groupProjected(atZoomZero(ordered), 2 ** zoom, radius).map((group) => group.map((index) => ordered[index]));
}

/**
 * Where a group grouped ALONE splits, from its members' zoom-0 positions.
 * Alone, the seed (lowest ID) claims every member within the radius and any
 * other member starts a second group — so the group holds exactly while every
 * member is within the radius of the seed, measured as groupProjected does.
 */
function splitZoom(base: readonly (readonly [number, number])[], group: readonly number[], level: number): number {
  const [seed, ...rest] = group;
  for (let z = level + 1; z <= STACK_MAX_ZOOM; z++) {
    const scale = 2 ** z;
    const sx = base[seed][0] * scale;
    const sy = base[seed][1] * scale;
    if (rest.some((other) => Math.hypot(base[other][0] * scale - sx, base[other][1] * scale - sy) > STACK_RADIUS)) return z;
  }
  return STACK_MAX_ZOOM + 1;
}

/**
 * The first whole zoom at which these members stop being one group.
 * Places at the very same spot never split, so they answer past the last
 * clustering zoom, which is what the web's getClusterExpansionZoom returns.
 */
export function stackExpansionZoom(members: readonly StackCandidate[], zoom: number): number {
  for (let z = Math.floor(zoom) + 1; z <= STACK_MAX_ZOOM; z++) {
    if (groupByScreenDistance(members, z).length > 1) return z;
  }
  return STACK_MAX_ZOOM + 1;
}

function toStacks(
  ordered: readonly StackCandidate[],
  base: readonly (readonly [number, number])[],
  groups: number[][],
  level: number,
): PinStack[] {
  return groups
    .filter((group) => group.length > 1)
    .map((group) => {
      const members = group.map((index) => ordered[index]);
      const ids = members.map((member) => member.id).sort();
      return {
        id: `stack:${ids.join('|')}`,
        ids,
        lng: members.reduce((sum, member) => sum + member.lng, 0) / members.length,
        lat: members.reduce((sum, member) => sum + member.lat, 0) / members.length,
        expansionZoom: splitZoom(base, group, level),
      };
    });
}

/**
 * The stacks at this zoom. Whole zoom levels, like native clustering, so the
 * groups hold still while the camera settles within one level.
 */
export function pinStacks(points: readonly StackCandidate[], zoom: number): PinStack[] {
  if (!Number.isFinite(zoom)) return [];
  const level = Math.floor(zoom);
  const ordered = [...points].sort(byId);
  const base = atZoomZero(ordered);
  return toStacks(ordered, base, groupProjected(base, 2 ** level, STACK_RADIUS), level);
}

/** The stacks at one whole zoom; the last entry also holds for every zoom above it. */
export interface StackLevel {
  level: number;
  stacks: PinStack[];
}

/**
 * The stacks at EVERY whole zoom from `fromLevel` up, computed ahead so the
 * map can switch between them itself as a pinch crosses a level — the way
 * native clustering does — instead of waiting for JavaScript to regroup.
 *
 * Stops at the first level where every stack is one that never splits (or
 * there are none): from there nothing can change. Distances only grow with
 * zoom, so a place that is clear of every seed at that level stays clear of
 * it above, and a group of places at one spot stays one group. The LAST
 * entry therefore stands for every zoom above it.
 */
export function stackLevels(
  points: readonly StackCandidate[],
  fromLevel: number,
  toLevel = STACK_MAX_ZOOM,
): StackLevel[] {
  const ordered = [...points].sort(byId);
  const base = atZoomZero(ordered);
  const first = Math.floor(fromLevel);
  // Each place's nearest neighbour at the first level, if one is in reach.
  // A place with no neighbour within the radius is a singleton at that zoom,
  // and a singleton neither claims nor is claimed — so leaving it out of the
  // grouping changes no group. Distances double per level, so the set worth
  // grouping shrinks fast as the zoom climbs; a place with no neighbour at
  // the first level never takes part at all.
  const nearest = new Array<number>(ordered.length).fill(Number.POSITIVE_INFINITY);
  const firstScale = 2 ** first;
  const cells = new Map<number, number[]>();
  const cellX = (index: number) => Math.floor((base[index][0] * firstScale) / STACK_RADIUS);
  const cellY = (index: number) => Math.floor((base[index][1] * firstScale) / STACK_RADIUS);
  base.forEach((_, index) => {
    const key = cellKey(cellX(index), cellY(index));
    const cell = cells.get(key);
    if (cell) cell.push(index);
    else cells.set(key, [index]);
  });
  base.forEach((_, index) => {
    const cx = cellX(index);
    const cy = cellY(index);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const other of cells.get(cellKey(cx + dx, cy + dy)) ?? []) {
          if (other === index) continue;
          const d = Math.hypot(base[other][0] - base[index][0], base[other][1] - base[index][1]) * firstScale;
          if (d < nearest[index]) nearest[index] = d;
        }
      }
    }
  });
  const levels: StackLevel[] = [];
  for (let level = first; level <= toLevel; level++) {
    // A little slack at the boundary only lets in a singleton, which is harmless.
    const reach = (STACK_RADIUS * (1 + 1e-9)) / 2 ** (level - first);
    const members: number[] = [];
    nearest.forEach((distance, index) => { if (distance <= reach) members.push(index); });
    const stacks = toStacks(ordered, base, groupProjected(base, 2 ** level, STACK_RADIUS, members), level);
    levels.push({ level, stacks });
    if (stacks.every((stack) => stack.expansionZoom > STACK_MAX_ZOOM)) break;
  }
  return levels;
}

/** What a tap on a numbered marker does, by the web planner's rule. */
export function stackTap(stack: Pick<PinStack, 'expansionZoom'>, zoom: number): StackTap {
  if (zoom < STACK_ZOOM_IN_BELOW && stack.expansionZoom > zoom + 0.5) {
    return { type: 'zoom', zoom: Math.min(STACK_MAX_ZOOM_IN, stack.expansionZoom) };
  }
  return { type: 'choose' };
}

/** A mark under the finger. `lift` is how far, in points, the mark's visual
 * centre sits ABOVE its coordinate — a bottom-anchored pin's tip is the place,
 * but its bulb is what a finger aims at. */
export interface HitCandidate extends StackCandidate {
  lift?: number;
}

/**
 * Of the marks under a finger, the one nearest to it. Duplicate hits from a
 * mark's icon and label layers collapse to one ID. Mercator distance is the
 * right comparison: the projection is conformal, so nearer on the map is
 * nearer on screen — measured at `zoom`, so a mark's `lift` is in screen
 * points. Without the lift a gauge just above an access pin's bulb won a tap
 * aimed at the bulb, because the access pin was measured from its tip.
 */
export function nearestHitId(
  hits: readonly HitCandidate[],
  tap: { lng: number; lat: number } | null,
  zoom = 0,
): string | null {
  if (!hits.length) return null;
  if (!tap) return hits[0].id;
  const [tx, ty] = project(tap.lng, tap.lat, zoom);
  let best = hits[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const hit of hits) {
    const [x, y] = project(hit.lng, hit.lat, zoom);
    const distance = Math.hypot(x - tx, y - (hit.lift ?? 0) - ty);
    if (distance < bestDistance) {
      best = hit;
      bestDistance = distance;
    }
  }
  return best.id;
}
