// src/lib/pois/mile-axis.ts
// Putting the guide's mile numbers onto the mile axis this database speaks.
//
// ── THE GUIDE AND THE DATABASE DO NOT ALWAYS START COUNTING TOGETHER ──────
//
// `floatmissouri_mile_markers.json` numbers each river from wherever its own
// coverage begins. On most rivers that is the same mile zero the database uses
// and the two agree exactly — matched access points on the Gasconade, Meramec,
// Eleven Point, Jacks Fork, Niangua and St. Francis differ by 0.0 miles. On
// others the guide starts partway down: its Big Piney miles run about 19 low,
// its James miles 27 low, its Bryant Creek miles 20 low, its Elk miles 24 high.
// Feeding a guide mile straight into a database mile index would slide every
// spring on those rivers by that much.
//
// The offset is recoverable because both sources describe the same access
// points. Match them by name, take the differences, and the true offset is the
// value most of them agree on.
//
// ── WHY A MEDIAN WITH REJECTION, AND NOT AN AVERAGE ──────────────────────
//
// The name matches are not all right. The guide's prose is full of generic
// descriptions ("Low-water bridge access.") that fuzzy-match whichever access
// point happens to share a word, and one bad pair on the Gasconade differed by
// 103 miles. A mean over those is meaningless; a plain median survives a
// minority of them but still drifts. So this takes the median, discards every
// pair more than `INLIER_TOLERANCE_MI` from it, and re-medians until it settles
// — the offset ends up decided by the pairs that agree with each other, and the
// count of those pairs is returned so a caller can refuse a river whose offset
// rests on one lucky match.
//
// The estimate is offset-only by design. Fitting a slope as well is tempting
// and wrong: both axes are already in miles, so the only free parameter is
// where counting starts, and a fitted slope would happily absorb bad pairs into
// a plausible-looking stretch of the whole river.

export interface AxisSample {
  /** Mile as the guide states it. */
  sourceMile: number;
  /** Mile as the database states it, for the same place. */
  targetMile: number;
}

export interface AxisAlignment {
  /** Add this to a guide mile to get a database mile. */
  offsetMiles: number;
  /** Pairs that agreed with the final offset. */
  inliers: number;
  /** Pairs considered in total. */
  samples: number;
  /** Widest disagreement among the inliers — the offset's own error bar. */
  spreadMiles: number;
}

/** How far a pair may sit from the running offset and still count as agreeing. */
export const INLIER_TOLERANCE_MI = 1.0;

function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Estimate the constant offset between two mile axes.
 *
 * `null` when there is nothing to estimate from. Callers are expected to gate
 * on `inliers` as well — an offset backed by two agreeing pairs is a guess, and
 * `snap-springs.ts` requires three.
 */
export function alignMileAxis(samples: readonly AxisSample[]): AxisAlignment | null {
  const diffs = samples
    .map((s) => s.targetMile - s.sourceMile)
    .filter((d) => Number.isFinite(d));
  if (diffs.length === 0) return null;

  let offset = median(diffs);
  for (let i = 0; i < 8; i += 1) {
    const inliers = diffs.filter((d) => Math.abs(d - offset) <= INLIER_TOLERANCE_MI);
    if (inliers.length === 0) break;
    const next = median(inliers);
    if (Math.abs(next - offset) < 1e-9) break;
    offset = next;
  }

  const inliers = diffs.filter((d) => Math.abs(d - offset) <= INLIER_TOLERANCE_MI);
  const spread = inliers.length
    ? Math.max(...inliers.map((d) => Math.abs(d - offset)))
    : Number.NaN;

  return {
    offsetMiles: Math.round(offset * 100) / 100,
    inliers: inliers.length,
    samples: diffs.length,
    spreadMiles: Math.round(spread * 100) / 100,
  };
}

/**
 * Pair the guide's access markers with the database's access points by name.
 *
 * Deliberately strict, because a wrong pair is what the rejection above exists
 * to survive and it is cheaper not to make one: a pair is only produced when
 * the guide's text contains a word that belongs to EXACTLY ONE access point on
 * that river. Generic prose shares no such word and pairs with nothing, which
 * is the correct outcome for it.
 */
export function pairAccessByName(
  guide: readonly { mile: number; description: string }[],
  database: readonly { mile: number; name: string }[],
): AxisSample[] {
  const NOISE = new Set([
    'access', 'accesses', 'point', 'river', 'creek', 'campground', 'camp',
    'bridge', 'landing', 'the', 'and', 'for', 'from', 'off', 'conservation',
    'area', 'park', 'state', 'public', 'use', 'launch', 'ramp', 'boat', 'hwy',
    'highway', 'road', 'county', 'new', 'old', 'low', 'water', 'mile', 'miles',
    'north', 'south', 'east', 'west', 'fork', 'left', 'right', 'gravel', 'bar',
  ]);
  const tokens = (s: string) =>
    new Set(
      (s || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .split(' ')
        .filter((t) => t.length > 2 && !NOISE.has(t) && !/^\d+$/.test(t)),
    );

  const freq = new Map<string, number>();
  for (const d of database) {
    for (const t of tokens(d.name)) freq.set(t, (freq.get(t) ?? 0) + 1);
  }

  const out: AxisSample[] = [];
  for (const g of guide) {
    const rare = [...tokens(g.description)].filter((t) => freq.get(t) === 1);
    if (rare.length === 0) continue;
    const matches = database.filter((d) => {
      const dt = tokens(d.name);
      return rare.some((t) => dt.has(t));
    });
    if (matches.length !== 1) continue;
    out.push({ sourceMile: g.mile, targetMile: matches[0].mile });
  }
  return out;
}
