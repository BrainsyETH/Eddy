/** null means matching coverage is unavailable, not an all-clear. */
export function matchAlertsByTerms<T extends { headline: string; description: string; areaDesc: string }>(
  alerts: readonly T[], terms: readonly string[] | undefined,
): T[] | null {
  const usableTerms = terms?.map(term => term.trim().toLowerCase()).filter(Boolean);
  if (!usableTerms?.length) return null;
  return alerts.filter(alert => {
    const text = `${alert.headline} ${alert.description} ${alert.areaDesc}`.toLowerCase();
    return usableTerms.some(term => text.includes(term));
  });
}
