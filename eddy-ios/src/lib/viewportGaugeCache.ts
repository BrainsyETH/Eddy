// Persistent, stale-first storage for the national gauge layer.
//
// Each viewport is its own AsyncStorage value. A typical state-sized response
// is around 150–220 KB as JSON; keeping twelve in one manifest value would make
// every new pan parse and rewrite a multi-megabyte blob on the JS thread. The
// small index below is the only shared value, while each payload remains an
// independently written file on iOS.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MapGaugesResponse, MapGaugeLite } from '@eddy/types';
import type { Bounds } from '@eddy/geo';
import {
  effectiveReadingAgeHours,
  mayPaintCachedCondition,
  VIEWPORT_GAUGES_INDEX_KEY,
  viewportGaugeKey,
} from '@/lib/offline-cache';

export const VIEWPORT_GAUGE_CACHE_SIZE = 12;

/** Positions remain useful, but a two-day-old viewport should not paint first. */
const MAX_ENTRY_AGE_MS = 48 * 60 * 60 * 1000;

interface IndexEntry {
  key: string;
  bbox: Bounds;
  limit: number;
  fetchedAt: string;
}

interface StoredPayload {
  fetchedAt: string;
  payload: MapGaugesResponse;
}

export interface StoredViewportGauges extends IndexEntry {
  payload: MapGaugesResponse;
}

function isBounds(value: unknown): value is Bounds {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((part) => typeof part === 'number' && Number.isFinite(part))
  );
}

function parseIndex(raw: string | null): IndexEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is IndexEntry => {
      if (!entry || typeof entry !== 'object') return false;
      const candidate = entry as Partial<IndexEntry>;
      return (
        typeof candidate.key === 'string' &&
        isBounds(candidate.bbox) &&
        typeof candidate.limit === 'number' &&
        typeof candidate.fetchedAt === 'string'
      );
    });
  } catch {
    return [];
  }
}

function ageGauge(gauge: MapGaugeLite, fetchedAt: string, now: number): MapGaugeLite {
  const readingAgeHours = effectiveReadingAgeHours(gauge.readingAgeHours, fetchedAt, now);
  return {
    ...gauge,
    readingAgeHours,
    // A cached number may remain visible with its honest age. Its historical
    // comparison is a present-tense interpretation and expires much sooner.
    flowPercentile: mayPaintCachedCondition(gauge.readingAgeHours, fetchedAt, now)
      ? gauge.flowPercentile
      : null,
  };
}

export async function readViewportGaugeCache(): Promise<StoredViewportGauges[]> {
  try {
    const index = parseIndex(await AsyncStorage.getItem(VIEWPORT_GAUGES_INDEX_KEY));
    const now = Date.now();
    const fresh = index.filter((entry) => {
      const fetched = Date.parse(entry.fetchedAt);
      return Number.isFinite(fetched) && now - fetched < MAX_ENTRY_AGE_MS;
    });
    if (fresh.length === 0) return [];

    const values = await AsyncStorage.multiGet(fresh.map((entry) => viewportGaugeKey(entry.key)));
    const byStorageKey = new Map(values);
    const result: StoredViewportGauges[] = [];

    for (const entry of fresh) {
      const raw = byStorageKey.get(viewportGaugeKey(entry.key));
      if (!raw) continue;
      try {
        const stored = JSON.parse(raw) as StoredPayload;
        if (!stored?.payload || !Array.isArray(stored.payload.gauges)) continue;
        result.push({
          ...entry,
          payload: {
            ...stored.payload,
            gauges: stored.payload.gauges.map((gauge) => ageGauge(gauge, entry.fetchedAt, now)),
          },
        });
      } catch {
        // One corrupt cell is one miss; the rest of the index remains useful.
      }
    }

    return result;
  } catch {
    return [];
  }
}

let writeChain: Promise<void> = Promise.resolve();

export function writeViewportGaugeCache(entry: StoredViewportGauges): void {
  // Serialise the index update so two quick successful requests cannot erase
  // one another with overlapping read-modify-writes.
  writeChain = writeChain
    .then(async () => {
      const payloadKey = viewportGaugeKey(entry.key);
      await AsyncStorage.setItem(
        payloadKey,
        JSON.stringify({ fetchedAt: entry.fetchedAt, payload: entry.payload } satisfies StoredPayload),
      );

      const previous = parseIndex(await AsyncStorage.getItem(VIEWPORT_GAUGES_INDEX_KEY));
      const next = [
        ...previous.filter((item) => item.key !== entry.key),
        {
          key: entry.key,
          bbox: entry.bbox,
          limit: entry.limit,
          fetchedAt: entry.fetchedAt,
        },
      ];
      const evicted = next.slice(0, Math.max(0, next.length - VIEWPORT_GAUGE_CACHE_SIZE));
      const kept = next.slice(-VIEWPORT_GAUGE_CACHE_SIZE);

      await AsyncStorage.setItem(VIEWPORT_GAUGES_INDEX_KEY, JSON.stringify(kept));
      if (evicted.length > 0) {
        await AsyncStorage.multiRemove(evicted.map((item) => viewportGaugeKey(item.key)));
      }
    })
    .catch(() => {});
}
