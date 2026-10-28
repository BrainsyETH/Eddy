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
// Hazards never join a group, on either platform: a hazard must never
// disappear into a count.
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
 * Greedy grouping, the way supercluster seeds its clusters: each unclaimed
 * place, in ID order, claims every unclaimed place within `radius` points of
 * it. ID order keeps the result identical however the layers arrive.
 */
export function groupByScreenDistance(
  points: readonly StackCandidate[],
  zoom: number,
  radius = STACK_RADIUS,
): StackCandidate[][] {
  const ordered = [...points].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const projected = ordered.map((point) => project(point.lng, point.lat, zoom));
  // A grid of radius-sized cells, so each seed only measures its neighbours.
  const cells = new Map<string, number[]>();
  const cellOf = ([x, y]: [number, number]) => [Math.floor(x / radius), Math.floor(y / radius)];
  projected.forEach((xy, index) => {
    const [cx, cy] = cellOf(xy);
    const key = `${cx}:${cy}`;
    const cell = cells.get(key);
    if (cell) cell.push(index);
    else cells.set(key, [index]);
  });
  const claimed = new Array<boolean>(ordered.length).fill(false);
  const groups: StackCandidate[][] = [];
  ordered.forEach((seed, index) => {
    if (claimed[index]) return;
    claimed[index] = true;
    const group = [seed];
    const [sx, sy] = projected[index];
    const [cx, cy] = cellOf(projected[index]);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const other of cells.get(`${cx + dx}:${cy + dy}`) ?? []) {
          if (claimed[other]) continue;
          const [ox, oy] = projected[other];
          if (Math.hypot(ox - sx, oy - sy) <= radius) {
            claimed[other] = true;
            group.push(ordered[other]);
          }
        }
      }
    }
    groups.push(group);
  });
  return groups;
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

/**
 * The stacks at this zoom. Whole zoom levels, like native clustering, so the
 * groups hold still while the camera settles within one level.
 */
export function pinStacks(points: readonly StackCandidate[], zoom: number): PinStack[] {
  if (!Number.isFinite(zoom)) return [];
  const level = Math.floor(zoom);
  return groupByScreenDistance(points, level)
    .filter((group) => group.length > 1)
    .map((group) => {
      const ids = group.map((member) => member.id).sort();
      return {
        id: `stack:${ids.join('|')}`,
        ids,
        lng: group.reduce((sum, member) => sum + member.lng, 0) / group.length,
        lat: group.reduce((sum, member) => sum + member.lat, 0) / group.length,
        expansionZoom: stackExpansionZoom(group, level),
      };
    });
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
