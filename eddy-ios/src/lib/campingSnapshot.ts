import type { CampingOverview } from '@eddy/types';

/** Versioned, bounded public cache. Provider checkedAt values remain untouched. */
export function parseCampingSnapshot(raw: string, nights: number, now = Date.now()): CampingOverview | null {
  try {
    const data = JSON.parse(raw) as CampingOverview;
    const age = now - Date.parse(data.generatedAt);
    if (data.schemaVersion !== 1 || data.timeZone !== 'America/Chicago' ||
      !Number.isFinite(age) || age < 0 || age > 72 * 3600_000 ||
      !Number.isFinite(data.maxObservationAgeSeconds) || data.maxObservationAgeSeconds <= 0 ||
      !Array.isArray(data.horizon?.nights) || data.horizon.nights.length !== nights ||
      !Array.isArray(data.weekend?.nights) || !Array.isArray(data.tracked) || !Array.isArray(data.untracked) ||
      !data.tracked.every((row) => row && typeof row.id === 'string' && Array.isArray(row.nights))) return null;
    return data;
  } catch { return null; }
}
