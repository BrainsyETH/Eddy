// Persistent, stale-first storage for the national gauge layer.
//
// The index is tiny and loads when the map mounts. Payloads are intentionally
// separate: a typical state-sized response is 150–220 KB as JSON, so parsing
// all twelve before the first viewport request would move latency from the
// network onto the JS thread. Once the camera settles, only the newest stored
// box that contains that screen is read.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MapGaugesResponse, MapGaugeLite } from '@eddy/types';
import {
  effectiveReadingAgeHours,
  mayPaintCachedCondition,
  newestContainingViewportGaugeEntry,
  touchViewportGaugeIndex,
  VIEWPORT_GAUGES_INDEX_KEY,
  viewportGaugeEntryIsFresh,
  viewportGaugeKey,
  type ViewportGaugeIndexRecord,
} from '@/lib/offline-cache';

export const VIEWPORT_GAUGE_CACHE_SIZE = 12;

interface StoredPayload {
  fetchedAt: string;
  payload: MapGaugesResponse;
}

export interface StoredViewportGauges extends ViewportGaugeIndexRecord {
  payload: MapGaugesResponse;
}

function isBounds(value: unknown): value is [number, number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((part) => typeof part === 'number' && Number.isFinite(part))
  );
}

function parseIndex(raw: string | null): ViewportGaugeIndexRecord[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is ViewportGaugeIndexRecord => {
      if (!entry || typeof entry !== 'object') return false;
      const candidate = entry as Partial<ViewportGaugeIndexRecord>;
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
    flowPercentile: mayPaintCachedCondition(gauge.readingAgeHours, fetchedAt, now)
      ? gauge.flowPercentile
      : null,
  };
}

export async function readViewportGaugeIndex(): Promise<ViewportGaugeIndexRecord[]> {
  try {
    const now = Date.now();
    return parseIndex(await AsyncStorage.getItem(VIEWPORT_GAUGES_INDEX_KEY)).filter((entry) =>
      viewportGaugeEntryIsFresh(entry, now),
    );
  } catch {
    return [];
  }
}

export async function readContainingViewportGauge(
  index: ViewportGaugeIndexRecord[],
  bounds: [number, number, number, number],
  limit: number,
): Promise<StoredViewportGauges | null> {
  const now = Date.now();
  const entry = newestContainingViewportGaugeEntry(
    index.filter((item) => viewportGaugeEntryIsFresh(item, now)),
    bounds,
    limit,
  );
  if (!entry) return null;

  try {
    const raw = await AsyncStorage.getItem(viewportGaugeKey(entry.key));
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredPayload;
    if (!stored?.payload || !Array.isArray(stored.payload.gauges)) return null;
    return {
      ...entry,
      payload: {
        ...stored.payload,
        gauges: stored.payload.gauges.map((gauge) => ageGauge(gauge, entry.fetchedAt, now)),
      },
    };
  } catch {
    return null;
  }
}

let writeChain: Promise<void> = Promise.resolve();

function enqueue(work: () => Promise<void>): void {
  writeChain = writeChain.then(work, work).catch(() => {});
}

export function touchViewportGaugeCache(key: string): void {
  enqueue(async () => {
    const stored = parseIndex(await AsyncStorage.getItem(VIEWPORT_GAUGES_INDEX_KEY));
    const previous = stored.filter((entry) => viewportGaugeEntryIsFresh(entry, Date.now()));
    const expired = stored.filter((entry) => !previous.includes(entry));
    const next = touchViewportGaugeIndex(previous, key);
    if (next !== previous || expired.length > 0) {
      await AsyncStorage.setItem(VIEWPORT_GAUGES_INDEX_KEY, JSON.stringify(next));
    }
    if (expired.length > 0) {
      await AsyncStorage.multiRemove(expired.map((entry) => viewportGaugeKey(entry.key)));
    }
  });
}

export function writeViewportGaugeCache(entry: StoredViewportGauges): void {
  enqueue(async () => {
    await AsyncStorage.setItem(
      viewportGaugeKey(entry.key),
      JSON.stringify({ fetchedAt: entry.fetchedAt, payload: entry.payload } satisfies StoredPayload),
    );

    const stored = parseIndex(await AsyncStorage.getItem(VIEWPORT_GAUGES_INDEX_KEY));
    const previous = stored.filter((item) => viewportGaugeEntryIsFresh(item, Date.now()));
    const expired = stored.filter((item) => !previous.includes(item));
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
    const discarded = [...expired, ...evicted].filter(
      (item, index, all) => all.findIndex((candidate) => candidate.key === item.key) === index,
    );
    if (discarded.length > 0) {
      await AsyncStorage.multiRemove(discarded.map((item) => viewportGaugeKey(item.key)));
    }
  });
}
