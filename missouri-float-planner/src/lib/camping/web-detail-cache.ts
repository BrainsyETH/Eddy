import type { CampingStayResult } from '../../../shared/camping-stay';

// Short-lived, bounded browser cache. Dates are part of the identity; observation
// freshness and current park policies are still evaluated every time we render.
const details = new Map<string, { until: number; promise: Promise<CampingStayResult | null> }>();
export function loadCampgroundSites(facility: string, arrival: string, departure: string) {
  const key = `${facility}:${arrival}:${departure}`;
  const now = Date.now();
  for (const [id, value] of details) if (value.until <= now) details.delete(id);
  const cached = details.get(key);
  if (cached) return cached.promise;
  if (details.size >= 40) details.delete(details.keys().next().value!);
  const promise = fetch(`/api/camping/sites?${new URLSearchParams({ facility, arrival, departure })}`, {
    signal: AbortSignal.timeout(8000),
  }).then(async response => {
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('Couldn’t load sites.');
    return await response.json() as CampingStayResult;
  }).catch(error => {
    if (details.get(key)?.promise === promise) details.delete(key);
    throw error;
  });
  details.set(key, { until: now + 60_000, promise });
  return promise;
}
