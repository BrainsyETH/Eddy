import type { RiversResponse } from '@/types/api';
import { withCampingTimeout } from './web-request';

/**
 * The rivers list for the Camping hub: names, pages and current conditions.
 *
 * Not useRivers(): that hook needs AbortSignal.any and AbortSignal.timeout,
 * which older Safari lacks, and the hub supports those browsers
 * (scripts/camping-smoke.mjs removes both statics before it runs).
 */
export function loadCampingRivers(signal?: AbortSignal): Promise<RiversResponse['rivers']> {
  return withCampingTimeout(async (deadline) => {
    const response = await fetch('/api/rivers', { signal: deadline });
    if (!response.ok) throw new Error('Rivers could not be loaded');
    return ((await response.json()) as RiversResponse).rivers;
  }, 15_000, signal);
}
