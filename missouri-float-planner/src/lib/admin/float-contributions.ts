// Pure logic for the admin Float contributions review: per-trip quality checks
// and the per-route comparison of measured moving pace with Eddy's estimate.
// These trips never change public estimates; this is review evidence only.
import type { CompletedFloat } from '@shared/float-archive';

export type ReviewDecision = 'use' | 'exclude';

export interface ContributionReview {
  decision: ReviewDecision;
  note: string | null;
  reviewedBy: string;
  reviewedAt: string;
}

export interface ContributionTrip {
  /** Stable key for a review write: the archive's (user_id, id). */
  userId: string;
  floatId: string;
  updatedAt: string;
  float: CompletedFloat;
  review: ContributionReview | null;
}

export interface RouteSummary {
  key: string;
  riverSlug: string;
  riverName: string;
  routeLabel: string;
  /** Trips counted (not excluded). */
  trips: number;
  /** Distinct accounts behind those trips: trips by one group aren't independent. */
  accounts: number;
  /** Trips with both a measured pace and an Eddy estimate. */
  paired: number;
  medianMovingMph: number | null;
  medianPlannerMph: number | null;
  /** Median of each trip's moving / estimate − 1; +0.1 means 10% faster. */
  medianDifference: number | null;
  minCfs: number | null;
  maxCfs: number | null;
  excluded: number;
}

export const CONTRIBUTION_FETCH_CAP = 2000;
export const CONTRIBUTION_PAGE_SIZE = 50;
export const MAX_REVIEW_NOTE_LENGTH = 1000;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function median(values: number[]): number | null {
  const sorted = values.filter(finite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Measurement problems a reviewer should weigh before trusting a trip. */
export function contributionFlags(t: CompletedFloat): string[] {
  const flags: string[] = [];
  if (!t.reachedTakeOut) flags.push('Arrival unconfirmed');
  if (!t.boatType) flags.push('Boat missing');
  if (!t.water) flags.push('Water missing');
  if (!finite(t.plannerMph)) flags.push('No Eddy estimate');
  if (finite(t.unknownMs) && finite(t.elapsedMs) && t.unknownMs > t.elapsedMs * 0.2)
    flags.push('Over 20% unobserved');
  if (!finite(t.movingMs) || t.movingMs < 15 * 60000) flags.push('Under 15 min moving');
  return flags;
}

/** Difference between a trip's measured moving pace and Eddy's estimate. */
export function paceDifference(t: Pick<CompletedFloat, 'movingMph' | 'plannerMph'>): number | null {
  return finite(t.movingMph) && finite(t.plannerMph) && t.plannerMph > 0
    ? t.movingMph / t.plannerMph - 1
    : null;
}

export function routeKey(t: CompletedFloat): string {
  return `${t.riverSlug}|${t.putInId ?? 'start'}|${t.takeOutId}`;
}

export function routeLabel(t: CompletedFloat): string {
  return `${t.putInName ?? 'On-river start'} → ${t.takeOutName}`;
}

/** One row per route, busiest first. Excluded trips are counted, not used. */
export function summarizeRoutes(trips: ContributionTrip[]): RouteSummary[] {
  const groups = new Map<string, ContributionTrip[]>();
  for (const trip of trips) {
    const key = routeKey(trip.float);
    groups.set(key, [...(groups.get(key) ?? []), trip]);
  }
  const rows: RouteSummary[] = [];
  for (const [key, group] of groups) {
    const used = group.filter((t) => t.review?.decision !== 'exclude');
    const paired = used.filter((t) => paceDifference(t.float) !== null);
    const cfs = used.map((t) => t.float.water?.dischargeCfs).filter(finite);
    const first = group[0].float;
    rows.push({
      key,
      riverSlug: first.riverSlug,
      riverName: first.riverName,
      routeLabel: routeLabel(first),
      trips: used.length,
      accounts: new Set(used.map((t) => t.userId)).size,
      paired: paired.length,
      medianMovingMph: median(used.map((t) => t.float.movingMph).filter(finite)),
      medianPlannerMph: median(used.map((t) => t.float.plannerMph).filter(finite)),
      medianDifference: median(paired.map((t) => paceDifference(t.float)!)),
      minCfs: cfs.length ? Math.min(...cfs) : null,
      maxCfs: cfs.length ? Math.max(...cfs) : null,
      excluded: group.length - used.length,
    });
  }
  return rows.sort(
    (a, b) => b.trips - a.trips || a.riverName.localeCompare(b.riverName) || a.routeLabel.localeCompare(b.routeLabel),
  );
}

/** Validate a review write. `decision: null` clears the review. */
export function parseReviewBody(
  body: unknown,
): { userId: string; floatId: string; decision: ReviewDecision | null; note: string | null } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof b.userId !== 'string' || !uuid.test(b.userId)) return { error: 'Invalid trip' };
  if (typeof b.floatId !== 'string' || b.floatId.length < 1 || b.floatId.length > 128)
    return { error: 'Invalid trip' };
  if (b.decision !== null && b.decision !== 'use' && b.decision !== 'exclude')
    return { error: 'Decision must be use, exclude or null' };
  if (b.note !== undefined && b.note !== null && typeof b.note !== 'string') return { error: 'Note must be text' };
  const note = typeof b.note === 'string' ? b.note.trim() : '';
  if (note.length > MAX_REVIEW_NOTE_LENGTH) return { error: 'Note is too long' };
  return { userId: b.userId, floatId: b.floatId, decision: b.decision as ReviewDecision | null, note: note || null };
}
