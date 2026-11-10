/** Shared by the public display, ramp cautions and collector health checks. */
export const LAKE_READING_MAX_AGE_HOURS = { hourly: 6, daily: 36 } as const;

export function lakeObservationIsCurrent(at: string, cadence: keyof typeof LAKE_READING_MAX_AGE_HOURS, now: number): boolean {
  const observedAt = Date.parse(at);
  return Number.isFinite(observedAt) && observedAt <= now + 3_600_000
    && now - observedAt <= LAKE_READING_MAX_AGE_HOURS[cadence] * 3_600_000;
}
