// shared/lake-status.ts
// The words a lake surface may use for a reported launch status, its
// provenance, and the two cautions a ramp's published elevations can produce.
//
// Shared because web and iOS must say exactly the same thing, and because the
// rules are the product's safety boundary (ADR 0019): a status is the agency's
// listing with the agency's date; a caution is arithmetic on published
// thresholds and never a clearance. Tests fail on wording that says "available".

/** The Corps' vocabulary, kept distinct. `partial` is "Limited access", never open or closed. */
export type ReportedStatus = 'open' | 'partial' | 'closed' | 'seasonal_closure' | 'unknown';

export const REPORTED_STATUS_LABELS: Record<ReportedStatus, string> = {
  open: 'Reported open',
  partial: 'Limited access',
  closed: 'Reported closed',
  seasonal_closure: 'Seasonal closure',
  unknown: 'Status unknown',
};

/** The provenance line a reader sees: the agency's date, or the fact that there is none. */
export function provenanceLine(record: { source_updated_at: string | null }, agency = 'Corps of Engineers'): string {
  return record.source_updated_at
    ? `${agency} listing, updated ${record.source_updated_at.slice(0, 10)}`
    : `${agency} listing · update date unavailable`;
}

/**
 * How old an agency listing is, in words a reader sees at a glance. The age
 * is the point: a six-month-old "Reported open" must not read as today's.
 */
export function listingAge(sourceUpdatedAt: string | null, now = Date.now()): string {
  if (!sourceUpdatedAt) return 'update date unavailable';
  const ms = Date.parse(sourceUpdatedAt);
  if (!Number.isFinite(ms)) return 'update date unavailable';
  const days = Math.floor((now - ms) / 86_400_000);
  if (days <= 0) return 'updated today';
  if (days === 1) return 'updated yesterday';
  if (days < 14) return `updated ${days} days ago`;
  // Floor, not round: "6 months" for 195 days. Rounding up would age a listing
  // past what the date supports; understating is the safer error here.
  if (days < 60) return `updated ${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `updated ${Math.floor(days / 30)} months ago`;
  const years = days / 365;
  return years < 1.5 ? 'updated over a year ago' : `updated ${Math.round(years)} years ago`;
}

export type RampCaution = 'low_water' | 'high_water';

export const RAMP_CAUTION_COPY: Record<RampCaution, { title: string; body: string; basis: string }> = {
  low_water: {
    title: 'Low-water caution',
    body: "The latest lake level is below this ramp's published lower elevation. Launching may be difficult or unavailable.",
    basis: 'Based on published elevation thresholds, not an official closure report.',
  },
  high_water: {
    title: 'High-water caution',
    body: 'The latest lake level is above the elevation at which this ramp is closed.',
    basis: 'Based on published elevation thresholds, not an official closure report.',
  },
};

export type VerticalDatum = 'NGVD29' | 'NAVD88';

/**
 * The caution a pool reading produces for a ramp, or null. Requires both
 * thresholds and a pool in the same datum; a missing threshold is "not
 * published", never a caution and never a clearance.
 */
export function rampCaution(
  pool: { elevationFt: number; datum: VerticalDatum },
  ramp: { bottomFt: number | null; closureFt: number | null; datum: VerticalDatum },
): RampCaution | null {
  if (pool.datum !== ramp.datum) throw new Error('Pool and ramp thresholds are in different datums');
  if (ramp.bottomFt === null || ramp.closureFt === null) return null;
  if (pool.elevationFt < ramp.bottomFt) return 'low_water';
  if (pool.elevationFt > ramp.closureFt) return 'high_water';
  return null;
}

/**
 * A signed level change, never a verdict. "+0.4 ft in 24h" needs no threshold
 * and cannot be wrong; "rising" would be (TAILWATER_PLAN.md measured why).
 */
export function levelChangeLabel(deltaFt: number | null, hours: number): string | null {
  if (deltaFt === null || !Number.isFinite(deltaFt)) return null;
  const span = hours % 24 === 0 && hours >= 48 ? `${hours / 24}d` : `${hours}h`;
  const magnitude = Math.abs(deltaFt);
  if (magnitude < 0.05) return `no change in ${span}`;
  const sign = deltaFt > 0 ? '+' : '−';
  return `${sign}${magnitude.toFixed(magnitude < 1 ? 2 : 1)} ft in ${span}`;
}

export type PoolPosition = 'below_conservation' | 'within_operating_range' | 'above_flood';

/** Where the pool sits against documented pools, in one datum. Null when the range is not published. */
export function poolPosition(
  elevationFt: number,
  range: { conservationFt: number; floodFt: number } | null,
): PoolPosition | null {
  if (!range) return null;
  if (elevationFt < range.conservationFt) return 'below_conservation';
  if (elevationFt > range.floodFt) return 'above_flood';
  return 'within_operating_range';
}

export function poolPositionSentence(position: PoolPosition | null, elevationFt: number, range: { conservationFt: number; floodFt: number } | null): string {
  if (!position || !range) return 'Operating range not published.';
  const vsConservation = elevationFt - range.conservationFt;
  const feet = `${Math.abs(vsConservation).toFixed(1)} ft`;
  switch (position) {
    case 'below_conservation':
      return `${feet} below the ${range.conservationFt.toFixed(0)} ft conservation pool.`;
    case 'above_flood':
      return `${(elevationFt - range.floodFt).toFixed(1)} ft above the ${range.floodFt.toFixed(0)} ft flood pool.`;
    default:
      return vsConservation < 0.05
        ? `At the ${range.conservationFt.toFixed(0)} ft conservation pool.`
        : `${feet} above the ${range.conservationFt.toFixed(0)} ft conservation pool, in the flood-control range.`;
  }
}
