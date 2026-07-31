import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GaugeSeed } from '@/lib/gaugeSeed';
import {
  effectiveReadingAgeHours,
  envelope,
  gaugeKey,
  mayPaintCachedCondition,
  parseEnvelope,
} from '@/lib/offline-cache';

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
  void AsyncStorage.setItem(
    gaugeKey(gauge.siteId),
    JSON.stringify(envelope(gauge, new Date().toISOString())),
  ).catch(() => {});
}
