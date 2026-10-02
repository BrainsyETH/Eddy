export const ALERT_STALE_MS = 15 * 60 * 1000;
export function shouldRefreshAlerts(lastSuccess: number | null, now = Date.now()): boolean {
  return lastSuccess === null || now - lastSuccess >= ALERT_STALE_MS;
}
/** This is the fetch time, never the underlying observation's age. */
export function checkedTimeAgo(lastSuccess: number | null, now = Date.now()): string | null {
  if (lastSuccess === null) return null;
  const minutes = Math.max(0, Math.floor((now - lastSuccess) / 60_000));
  return minutes < 1 ? 'just now' : minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`;
}

/** Alerts supplies its own prefix; other screens can label each source. */
export function alertCheckedLabel(lastSuccess: number | null, now = Date.now()): string | null {
  const age = checkedTimeAgo(lastSuccess, now);
  return age === null ? null : `Last checked ${age}`;
}
