// src/lib/eddy/trajectory-window.ts
// How long a set of gauge readings actually spans. Pure, so it can be tested
// without the database client gauge-trajectory.ts imports at module scope.

/**
 * Whole days between the oldest and newest reading, never less than one.
 *
 * The trajectory asks for a fixed number of days, but a provider can return
 * fewer (a new station, an outage, a fallback path). The Read prompt labels
 * the peak and low with this number, so it has to describe what they were
 * taken over rather than what was requested.
 */
export function spanDays(readings: ReadonlyArray<{ timestamp: string }>): number {
  const times = readings.map((r) => new Date(r.timestamp).getTime()).filter(Number.isFinite);
  if (times.length < 2) return 1;
  return Math.max(1, Math.round((Math.max(...times) - Math.min(...times)) / 86_400_000));
}
