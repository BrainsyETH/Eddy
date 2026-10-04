import type { FloatPlan } from '@/types/api';

export type SharedPlanLoad =
  | { kind: 'loaded'; plan: FloatPlan }
  | { kind: 'not-found' }
  | { kind: 'unavailable' };

/** Only an explicit 404 means the recipient's link is missing. */
export async function loadSharedPlan(shortCode: string, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<SharedPlanLoad> {
  try {
    const response = await fetcher(`/api/plan/${encodeURIComponent(shortCode)}`, { signal, cache: 'no-store' });
    if (response.status === 404) return { kind: 'not-found' };
    if (!response.ok) return { kind: 'unavailable' };
    const data = await response.json();
    return data?.plan ? { kind: 'loaded', plan: data.plan } : { kind: 'unavailable' };
  } catch {
    return { kind: 'unavailable' };
  }
}

/** An RPC error must never be turned into a permanent-looking missing plan. */
export function savedPlanLookupStatus(rows: unknown, error: unknown): 200 | 404 | 503 {
  if (error || !Array.isArray(rows)) return 503;
  return rows.length && rows[0] ? 200 : 404;
}
