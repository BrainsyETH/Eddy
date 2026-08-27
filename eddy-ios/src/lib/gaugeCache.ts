import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GaugeSeed } from '@/lib/gaugeSeed';
import {
  effectiveReadingAgeHours,
  envelope,
  GAUGE_LRU_KEY,
  gaugeKey,
  mayPaintCachedCondition,
  parseEnvelope,
} from '@/lib/offline-cache';

/**
 * How many visited gauges stay on disk.
 *
 * One key per gauge screen ever opened, and the national tier is ~14,000
 * stations — without a cap the keys accumulate for the life of a cache
 * version, and offline-cache.ts documents why that hurts on iOS: every small
 * value rewrites the whole AsyncStorage manifest. Forty covers anyone's
 * actual rivers several times over; the eviction cost is one refetch on a
 * gauge not visited in a long while.
 */
const GAUGE_LRU_SIZE = 40;

/**
 * Writes serialised, like viewportGaugeCache's queue: the LRU index is a
 * read-modify-write, and two rapid gauge visits racing it would drop one
 * visit from the index — leaving its payload unevictable.
 */
let queue: Promise<void> = Promise.resolve();
function enqueue(work: () => Promise<void>): void {
  queue = queue.then(work, work).catch(() => {});
}

export async function readGauge(siteId: string): Promise<GaugeSeed | null> {
  try {
    const stored = parseEnvelope<GaugeSeed>(
      await AsyncStorage.getItem(gaugeKey(siteId)),
      'object',
    );
    if (!stored) return null;

    const age = effectiveReadingAgeHours(
      stored.payload.readingAgeHours,
      stored.fetchedAt,
      Date.now(),
    );
    const conditionIsFresh = mayPaintCachedCondition(
      stored.payload.readingAgeHours,
      stored.fetchedAt,
      Date.now(),
    );

    return {
      ...stored.payload,
      readingAgeHours: age,
      // Keep identity and the last number useful offline, but never replay a
      // six-hour-old verdict, percentile band, or flood-stage comparison.
      thresholds: conditionIsFresh ? stored.payload.thresholds : null,
      flowPercentile: conditionIsFresh ? stored.payload.flowPercentile : null,
      floodStages: conditionIsFresh ? stored.payload.floodStages : null,
    };
  } catch {
    return null;
  }
}

export function writeGauge(gauge: GaugeSeed): void {
  enqueue(async () => {
    await AsyncStorage.setItem(
      gaugeKey(gauge.siteId),
      JSON.stringify(envelope(gauge, new Date().toISOString())),
    );

    // Most-recently-visited last, evict from the front — the same LRU shape
    // as the viewport cache next door, minus the freshness dimension: a
    // gauge's identity does not expire, only its verdict, and readGauge
    // already withholds that by age.
    const stored = await AsyncStorage.getItem(GAUGE_LRU_KEY);
    let ids: string[] = [];
    try {
      const parsed: unknown = stored ? JSON.parse(stored) : [];
      if (Array.isArray(parsed)) ids = parsed.filter((id): id is string => typeof id === 'string');
    } catch {
      // A corrupt index is rebuilt from here on; orphaned payload keys from
      // before the corruption die with the next cache version's sweep.
    }
    const next = [...ids.filter((id) => id !== gauge.siteId), gauge.siteId];
    const evicted = next.slice(0, Math.max(0, next.length - GAUGE_LRU_SIZE));
    const kept = next.slice(-GAUGE_LRU_SIZE);
    await AsyncStorage.setItem(GAUGE_LRU_KEY, JSON.stringify(kept));
    if (evicted.length > 0) {
      await AsyncStorage.multiRemove(evicted.map(gaugeKey));
    }
  });
}
