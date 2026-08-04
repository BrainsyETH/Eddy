// shared/primary-river-link.ts
// Given a gauge, which river is it?
//
// ── Why this is not `links.find(l => l.isPrimary)` ───────────────────────
//
// `is_primary` on river_gauges means "this is the primary gauge FOR THIS
// RIVER". Read that way, a gauge being primary for two rivers is not a data
// error: Courtois Creek has no gauge of its own and borrows Huzzah's, so
// 07014000 is legitimately the primary gauge for both
// (00164_fix_river_gauge_misassociations.sql:58 and :87). Each river still has
// exactly one primary, which is the invariant that actually matters.
//
// The bug is in the other direction. Asking "which river does this gauge
// belong to" has two valid answers, and every consumer resolved it with
// `find(l => l.isPrimary) || links[0]` — which returns whichever row PostgREST
// happened to order first. Nothing guarantees that order, so the same gauge
// could present as Huzzah on the map and Courtois on the detail screen, in one
// session, with nothing logged. /api/gauges/[siteId] sorts primary-first, but
// with two primaries that comparator returns 0 for both and the arbitrary order
// survives.
//
// The tiebreak already exists in the data and nobody was reading it:
// `distance_from_section_miles` is 0.0 for Huzzah and 5.0 for Courtois, because
// the gauge physically sits on the Huzzah. Nearest wins, which is both
// deterministic AND correct.
//
// Where distance has not been plumbed through a payload yet, the slug breaks
// the tie instead. That is arbitrary but stable — the same answer every time,
// on every surface — which is the property that was missing.

export interface PrimaryRiverCandidate {
  isPrimary: boolean;
  riverSlug: string | null;
  /** river_gauges.distance_from_section_miles. Absent where not yet plumbed. */
  distanceFromSectionMiles?: number | null;
}

/**
 * Order gauge→river links so the first is the one to show.
 *
 * Primary before non-primary, then nearest, then slug. Returns a new array;
 * callers that only want the winner should use pickPrimaryRiverLink.
 */
export function orderRiverLinks<T extends PrimaryRiverCandidate>(links: readonly T[]): T[] {
  return [...links].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;

    // Null distance sorts last: an unmeasured association should not beat a
    // measured one, and two nulls fall through to the slug.
    const aDist = a.distanceFromSectionMiles ?? null;
    const bDist = b.distanceFromSectionMiles ?? null;
    if (aDist !== bDist) {
      if (aDist === null) return 1;
      if (bDist === null) return -1;
      return aDist - bDist;
    }

    return (a.riverSlug ?? '').localeCompare(b.riverSlug ?? '');
  });
}

/** The river to show for this gauge, or null when it rates none. */
export function pickPrimaryRiverLink<T extends PrimaryRiverCandidate>(
  links: readonly T[] | null | undefined,
): T | null {
  if (!links || links.length === 0) return null;
  return orderRiverLinks(links)[0] ?? null;
}

/**
 * True when two or more primary links cannot be told apart.
 *
 * This — not "primary for more than one river" — is the reportable condition.
 * Courtois borrowing Huzzah's gauge is a resolved tie and a legitimate
 * arrangement; two primaries at the same distance, or with no distance
 * recorded, is a coin flip that the code will resolve alphabetically and a
 * human should look at.
 */
export function hasUnresolvablePrimaryTie(links: readonly PrimaryRiverCandidate[]): boolean {
  const primaries = links.filter((l) => l.isPrimary);
  if (primaries.length < 2) return false;

  const distances = primaries.map((l) => l.distanceFromSectionMiles ?? null);
  if (distances.some((d) => d === null)) return true;

  const nearest = Math.min(...(distances as number[]));
  return distances.filter((d) => d === nearest).length > 1;
}
