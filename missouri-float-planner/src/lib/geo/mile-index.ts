// src/lib/geo/mile-index.ts
// Turning a river mile into a point on the river's line.
//
// ── WHY THIS IS NOT `mile / length_miles` ──────────────────────────────────
//
// The obvious inverse of "where on this line is mile 31?" is a fraction —
// `ST_LineInterpolatePoint(geom, mile / length_miles)` — and for some rivers
// that is exactly right. For the rivers this repository cares most about it is
// wrong by MILES, and the reason is that `river_mile_downstream` is not a
// measurement of the stored geometry.
//
// Two different things wear the word "mile" here:
//
//   • GEOMETRY MILES. A fraction of the NHD centreline, scaled by
//     `rivers.length_miles`. This is what migration 00010's
//     `ST_LineLocatePoint(geom, point) * length_miles` computes, and it
//     round-trips through the formula above exactly.
//   • EDITORIAL MILES. The published mile index a river is actually described
//     by — the one on the float outfitter's map and in the mile-by-mile
//     guides — which `correct_all_access_point_miles` (migration 00009/00010)
//     snapped many access points onto.
//
// The two agree on a river whose access points were never corrected, and
// diverge on every river where the published index was applied, because a
// published index follows the channel's real meanders while the stored line is
// a generalisation of them. Measured against production, that divergence is not
// subtle: feeding an access point's own mile back through the naive formula
// misses its own location by a median of 20 km on the Meramec, 19 km on the
// St. Francis, 17 km on the Bourbeuse and 15 km on the Niangua, while landing
// within 5 m on the Current and the James. A single formula cannot serve both,
// and which kind of mile a given river carries is not recorded anywhere.
//
// ── SO THE RIVER TELLS US, THROUGH ITS ACCESS POINTS ──────────────────────
//
// Every approved access point is a control point that knows both answers: its
// `river_mile_downstream` (whichever kind of mile that river speaks) and its
// real location, hence its true fraction along the line. Interpolating between
// consecutive access points converts one to the other WITHOUT ever having to
// know which kind of mile the river uses — a river whose miles are geometric
// simply produces a straight mapping, and one whose miles are editorial
// produces the bent mapping that corrects for it.
//
// Leave-one-out cross-validation over all 350 approved access points puts the
// median error at 3–7 m on the rivers the naive formula already handled and at
// 250–600 m on the ones it missed by kilometres. That is the whole point: this
// is never worse than the fraction formula and is often three orders of
// magnitude better.
//
// ── IT REPORTS ITS OWN UNCERTAINTY, AND CALLERS MUST USE IT ───────────────
//
// Interpolation is only as good as the control points bracketing the mile
// asked for, so `mileToFraction` returns the width of the bracketing interval
// alongside the answer, and says when there was no bracketing interval at all
// (a mile beyond the outermost access point, where the result is an
// extrapolation off the end of a straight line). A caller placing something a
// reader will paddle towards is expected to refuse a wide bracket rather than
// draw a confident pin on a guess — see `spring-ingest.ts`, which does.

/** An access point as a control: the mile it is called, and where it really is. */
export interface MileControl {
  /** `access_points.river_mile_downstream` — whatever mile axis this river uses. */
  mile: number;
  /** `ST_LineLocatePoint(river.geom, location)` — 0 at the line's first vertex. */
  fraction: number;
}

/**
 * A river's mile axis, as a monotone ladder of control points.
 *
 * Built rather than used raw because two things in the source data break
 * interpolation and both occur in production — see `buildMileIndex`.
 */
export interface MileIndex {
  controls: readonly MileControl[];
}

/** What `mileToFraction` knows about an answer besides the answer itself. */
export interface MileFix {
  /** Position along the line, 0–1, clamped. */
  fraction: number;
  /**
   * Miles between the two control points this was interpolated between, or
   * `null` when the mile fell outside them and the answer is an extrapolation.
   *
   * This is the honest uncertainty signal. A mile landing in a two-mile gap
   * between access points is pinned down; the same mile in a forty-mile gap is
   * a guess dressed as a coordinate.
   */
  bracketMiles: number | null;
}

/**
 * Build a river's index from its access points.
 *
 * Two cleanups, both load-bearing against real data:
 *
 *  1. DUPLICATE MILES. Two access points sharing a mile (a put-in on each bank,
 *     or the duplicate `correct-access-point-miles.ts` warns about) give the
 *     ladder a zero-width rung and interpolation a division by zero.
 *  2. NON-MONOTONE FRACTIONS. A mile that increases while the fraction goes
 *     backwards means one of the two disagrees with the other — a mis-snapped
 *     access point, or an editorial mile applied to the wrong place. Production
 *     has one each on the Big Piney and the Eleven Point. Interpolating across
 *     an inversion drags every point in both neighbouring intervals to the
 *     wrong side of it, so the offending rung is dropped rather than trusted.
 *
 * Dropping is greedy and keeps the LONGER run: a rung is discarded only while
 * it contradicts the rung below it, so one bad point costs one point rather
 * than truncating the ladder at the first disagreement.
 */
export function buildMileIndex(controls: readonly MileControl[]): MileIndex {
  const sorted = [...controls]
    .filter((c) => Number.isFinite(c.mile) && Number.isFinite(c.fraction))
    .sort((a, b) => a.mile - b.mile);

  const deduped: MileControl[] = [];
  for (const c of sorted) {
    if (deduped.length > 0 && Math.abs(c.mile - deduped[deduped.length - 1].mile) < 1e-9) continue;
    deduped.push(c);
  }

  const monotone: MileControl[] = [];
  for (const c of deduped) {
    while (monotone.length > 0 && c.fraction <= monotone[monotone.length - 1].fraction) {
      monotone.pop();
    }
    monotone.push(c);
  }

  return { controls: monotone };
}

/**
 * Where along the line mile `mile` falls, and how well the index pins it down.
 *
 * `null` when the index has fewer than two controls — one point fixes an offset
 * but says nothing about scale, and there is no honest answer to give.
 */
export function mileToFraction(index: MileIndex, mile: number): MileFix | null {
  const c = index.controls;
  if (c.length < 2 || !Number.isFinite(mile)) return null;

  const clamp = (f: number) => Math.max(0, Math.min(1, f));

  // Off the upstream end: continue the first segment's slope. Reported as
  // unbracketed, because nothing downstream of the answer constrains it.
  if (mile <= c[0].mile) {
    const slope = (c[1].fraction - c[0].fraction) / (c[1].mile - c[0].mile);
    return { fraction: clamp(c[0].fraction + slope * (mile - c[0].mile)), bracketMiles: null };
  }

  const last = c.length - 1;
  if (mile >= c[last].mile) {
    const slope =
      (c[last].fraction - c[last - 1].fraction) / (c[last].mile - c[last - 1].mile);
    return {
      fraction: clamp(c[last].fraction + slope * (mile - c[last].mile)),
      bracketMiles: null,
    };
  }

  let hi = 1;
  while (hi < c.length && c[hi].mile < mile) hi += 1;
  const a = c[hi - 1];
  const b = c[hi];
  const span = b.mile - a.mile;
  const t = span === 0 ? 0 : (mile - a.mile) / span;
  return {
    fraction: clamp(a.fraction + (b.fraction - a.fraction) * t),
    bracketMiles: span,
  };
}

/**
 * The point at `fraction` along a line, measured the way PostGIS measures it.
 *
 * PLANAR, in degrees, deliberately: the control fractions come from
 * `ST_LineLocatePoint` on an SRID-4326 geometry, which is cartesian over
 * degrees and not geodesic. Walking this line geodesically would place points
 * consistently wrong against the very fractions used to calibrate it — the
 * error is the latitude-cosine distortion, about 20% at Ozark latitudes, and it
 * would land on whichever axis the river happens to run along. Matching
 * PostGIS's convention exactly is what makes the round trip close.
 */
export function interpolateAlong(
  coords: readonly (readonly [number, number])[],
  fraction: number,
): [number, number] | null {
  if (coords.length === 0) return null;
  if (coords.length === 1) return [coords[0][0], coords[0][1]];

  const cum: number[] = [0];
  for (let i = 1; i < coords.length; i += 1) {
    const dx = coords[i][0] - coords[i - 1][0];
    const dy = coords[i][1] - coords[i - 1][1];
    cum.push(cum[i - 1] + Math.hypot(dx, dy));
  }
  const total = cum[cum.length - 1];
  if (total === 0) return [coords[0][0], coords[0][1]];

  const target = Math.max(0, Math.min(1, fraction)) * total;
  let i = 1;
  while (i < cum.length && cum[i] < target) i += 1;
  const seg = cum[i] - cum[i - 1];
  const t = seg === 0 ? 0 : (target - cum[i - 1]) / seg;
  const a = coords[i - 1];
  const b = coords[i];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Great-circle metres between two lng/lat pairs. For reporting, not routing. */
export function metresBetween(
  a: readonly [number, number],
  b: readonly [number, number],
): number {
  const R = 6371008.8;
  const p1 = (a[1] * Math.PI) / 180;
  const p2 = (b[1] * Math.PI) / 180;
  const dp = p2 - p1;
  const dl = ((b[0] - a[0]) * Math.PI) / 180;
  const h =
    Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
