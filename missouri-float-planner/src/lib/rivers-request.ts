import type { RiversResponse, RiverDetailResponse } from '@/types/api';
import { withRequestTimeout } from './browser-request';

/** Shared navigation loaders also work on Safari without AbortSignal statics. */
export function loadRivers(signal?: AbortSignal): Promise<RiversResponse['rivers']> {
  return withRequestTimeout(async deadline => {
    const response = await fetch('/api/rivers', { signal: deadline });
    if (!response.ok) throw new Error('Failed to fetch rivers');
    return ((await response.json()) as RiversResponse).rivers;
  }, 15_000, signal);
}

export function loadRiver(slug: string, signal?: AbortSignal): Promise<RiverDetailResponse['river']> {
  return withRequestTimeout(async deadline => {
    const response = await fetch(`/api/rivers/${encodeURIComponent(slug)}`, { signal: deadline });
    if (!response.ok) throw new Error('Failed to fetch river');
    return ((await response.json()) as RiverDetailResponse).river;
  }, 15_000, signal);
}
