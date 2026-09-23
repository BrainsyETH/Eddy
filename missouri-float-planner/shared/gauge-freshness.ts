/** Freshness always describes the observation, never the response cache. */
export type GaugeFreshness = 'live' | 'delayed' | 'historical' | 'unavailable';
export function observationAgeHours(timestamp: string | null | undefined, now = Date.now()): number | null {
  const time = timestamp ? Date.parse(timestamp) : NaN;
  if (!Number.isFinite(time) || time > now + 300_000) return null;
  return Math.max(0, now - time) / 3_600_000;
}
export function gaugeFreshness(timestamp: string | null | undefined, now = Date.now()): GaugeFreshness {
  const age = observationAgeHours(timestamp, now);
  return age === null ? 'unavailable' : age > 24 ? 'historical' : age > 6 ? 'delayed' : 'live';
}
export function gaugeFreshnessLabel(timestamp: string | null | undefined, now = Date.now()): string {
  switch (gaugeFreshness(timestamp, now)) {
    case 'live': return 'Recent observation';
    case 'delayed': return 'Reporting delayed';
    case 'historical': return `Historical reading · ${new Date(timestamp!).toLocaleDateString()}`;
    default: return 'Observation time unavailable';
  }
}
export function isCurrentWaterMeasurement(value: { observedAt: string } | null | undefined, now = Date.now()): boolean {
  const age = observationAgeHours(value?.observedAt, now);
  return age !== null && age <= 24;
}
