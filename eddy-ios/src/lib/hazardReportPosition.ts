// eddy-ios/src/lib/hazardReportPosition.ts
// Where a hazard report is filed from, and how old that position reads.
//
// The report sheet has up to two places to ask: the phone's own location
// (a fresh fix, or iOS's last known one) and the float recorder's last raw
// fix. Neither is better by source: on a locked, moving float the recorder
// often holds a newer fix than iOS's cache, and the other way round after a
// GPS gap. The newer one by timestamp wins. Pure, so it is tested from
// missouri-float-planner/src/lib/hazard-report-position.test.ts.

export interface ReportPosition {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  /** When the position was measured, in epoch milliseconds. */
  at: number;
}

/** A clock a little ahead of the phone's is tolerated; a fix from the future is not. */
const FUTURE_SKEW_MS = 60_000;

function usable(position: ReportPosition | null | undefined, now: number): position is ReportPosition {
  return Boolean(
    position &&
      Number.isFinite(position.latitude) && Math.abs(position.latitude) <= 90 &&
      Number.isFinite(position.longitude) && Math.abs(position.longitude) <= 180 &&
      Number.isFinite(position.at) && position.at <= now + FUTURE_SKEW_MS,
  );
}

/** The newest usable candidate by timestamp; on a tie, the earlier-listed one. */
export function newestPosition(candidates: readonly (ReportPosition | null | undefined)[], now: number): ReportPosition | null {
  let best: ReportPosition | null = null;
  for (const candidate of candidates) {
    if (usable(candidate, now) && (!best || candidate.at > best.at)) best = candidate;
  }
  return best;
}

/** A recorder fix ([lng, lat] order) in the report's shape. */
export function recorderPosition(fix: { lngLat: readonly [number, number] | number[]; at: number; accuracyMeters?: number | null } | null | undefined): ReportPosition | null {
  return fix ? { latitude: fix.lngLat[1], longitude: fix.lngLat[0], accuracyMeters: fix.accuracyMeters ?? null, at: fix.at } : null;
}

/**
 * The position's age as the sheet shows it, recomputed as time passes:
 * "just now" only inside the first minute, then whole minutes, then hours.
 */
export function positionAgeLabel(at: number, now: number): string {
  const seconds = Math.max(0, (now - at) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `position from ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `position from ${hours} h ${minutes % 60} min ago`;
}
