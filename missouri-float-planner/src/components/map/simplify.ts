// src/components/map/simplify.ts
// Douglas–Peucker line simplification (iterative, stack-based).
//
// Exists for LABEL PLACEMENT: full-resolution NHD river geometry is so
// sinuous that MapLibre's line-placed text almost never finds a legal
// placement — every attempt trips text-max-angle on the meander trains,
// which is why river names silently never appeared (the basemap's own
// waterway labels fail the same way on OSM geometry). Labels therefore
// ride a simplified shadow line that follows the river's general course;
// the visible condition-colored line keeps the true geometry.

/**
 * Simplify a lng/lat polyline. `tolerance` is in degrees — 0.004° ≈ 400 m
 * in Missouri, which keeps a label near the real channel at planning
 * zooms while smoothing the wiggles that break text placement. (0.002
 * proved too faithful: offline harness renders showed labels still
 * failing placement until the line was straightened this far AND
 * text-max-angle was raised — see the label layers.)
 */
export function simplifyLine(
  coords: ReadonlyArray<ReadonlyArray<number>>,
  tolerance: number,
): [number, number][] {
  const n = coords.length;
  if (n <= 2) return coords.map((c) => [c[0], c[1]]);
  const sqTol = tolerance * tolerance;
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: Array<[number, number]> = [[0, n - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let maxSq = 0;
    let index = -1;
    const x1 = coords[first][0];
    const y1 = coords[first][1];
    const dx = coords[last][0] - x1;
    const dy = coords[last][1] - y1;
    const segSq = dx * dx + dy * dy;
    for (let i = first + 1; i < last; i++) {
      let t = segSq ? ((coords[i][0] - x1) * dx + (coords[i][1] - y1) * dy) / segSq : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = x1 + t * dx - coords[i][0];
      const qy = y1 + t * dy - coords[i][1];
      const sq = qx * qx + qy * qy;
      if (sq > maxSq) {
        maxSq = sq;
        index = i;
      }
    }
    if (index > 0 && maxSq > sqTol) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    if (keep[i]) out.push([coords[i][0], coords[i][1]]);
  }
  return out;
}

/** Shared tolerance for river-name label lines (see module comment). */
export const LABEL_SIMPLIFY_TOLERANCE = 0.004;
