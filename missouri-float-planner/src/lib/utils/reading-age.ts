// src/lib/utils/reading-age.ts
// One compact "how old is this" formatter for the river report. The report
// shows freshness in more than one place (the reading card, Eddy's generated
// report), and three hand-rolled formatters had already drifted apart on
// casing and on where they switched from minutes to hours.

/** Compact age from a duration in hours: "just now", "12m ago", "3h ago", "2d ago". */
export function formatAgeFromHours(hours: number): string {
  if (hours < 1) {
    const mins = Math.round(hours * 60);
    return mins < 2 ? 'just now' : `${mins}m ago`;
  }
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Same scale, measured from an ISO timestamp. Returns null when unparseable. */
export function formatAgeFromTimestamp(timestamp: string, now = Date.now()): string | null {
  const parsed = new Date(timestamp).getTime();
  if (!Number.isFinite(parsed)) return null;
  return formatAgeFromHours(Math.max(0, now - parsed) / 3_600_000);
}

/** Age in hours from an ISO timestamp, or null for absent/unparseable. */
export function ageHoursOf(timestamp: string | null | undefined, now = Date.now()): number | null {
  if (!timestamp) return null;
  const parsed = new Date(timestamp).getTime();
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, now - parsed) / 3_600_000;
}
