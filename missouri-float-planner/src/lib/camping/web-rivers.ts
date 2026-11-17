import type { RiversResponse } from '@/types/api';
import { withCampingTimeout } from './web-request';

/**
 * The rivers list for the Camping hub: names, pages and current conditions.
 *
 * Keep the receipt time with the response so the older relative-age payload
 * continues to age, including time already spent in an HTTP cache.
 */
export function loadCampingRivers(signal?: AbortSignal): Promise<{
  rivers: RiversResponse['rivers']; receivedAt: number;
}> {
  return withCampingTimeout(async (deadline) => {
    const response = await fetch('/api/rivers', { signal: deadline });
    if (!response.ok) throw new Error('Rivers could not be loaded');
    const receivedAt = Date.now();
    const datedAt = Date.parse(response.headers.get('date') ?? '');
    const cacheAge = Number(response.headers.get('age') ?? 0) * 1000;
    const elapsed = Math.max(
      0,
      Number.isFinite(datedAt) ? receivedAt - datedAt : 0,
      Number.isFinite(cacheAge) ? cacheAge : 0,
    );
    return {
      rivers: ((await response.json()) as RiversResponse).rivers,
      receivedAt: receivedAt - elapsed,
    };
  }, 15_000, signal);
}
