import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import type {
  GaugeHistoryResponse,
  GaugeStationSummary,
} from '@eddy/shared/types/api';
import { formatRelativeTime } from '@eddy/shared/utils/formatters';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { api } from '@/lib/api';

const THRESHOLD_ROWS = [
  { key: 'levelDangerous', label: 'Flood', color: '#ef4444' },
  { key: 'levelHigh', label: 'High', color: '#f97316' },
  { key: 'levelOptimalMin', label: 'Ideal above', color: '#059669' },
  { key: 'levelLow', label: 'Low below', color: '#eab308' },
  { key: 'levelTooLow', label: 'Too low below', color: '#78716c' },
] as const;

export default function GaugeDetailScreen() {
  const { siteId } = useLocalSearchParams<{ siteId: string }>();
  const [gauge, setGauge] = useState<GaugeStationSummary | null>(null);
  const [history, setHistory] = useState<GaugeHistoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!siteId) return;
    try {
      // No single-gauge endpoint yet; the list is small (~20 active gauges).
      const { gauges } = await api.getGauges();
      const match = gauges.find((g) => g.usgsSiteId === siteId);
      if (!match) {
        setError('Gauge not found');
        return;
      }
      setGauge(match);
      api
        .getGaugeHistory(siteId, 7)
        .then(setHistory)
        .catch(() => setHistory(null));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load gauge');
    }
  }, [siteId]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <ThemedView style={[styles.container, styles.center]}>
        <ThemedText>Couldn&apos;t load this gauge.</ThemedText>
        <ThemedText type="small">{error}</ThemedText>
      </ThemedView>
    );
  }

  if (!gauge) {
    return (
      <ThemedView style={[styles.container, styles.center]}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  const primary = gauge.thresholds?.find((t) => t.isPrimary);
  const unit = primary?.thresholdUnit ?? 'ft';

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: gauge.name }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.statsRow}>
          {gauge.gaugeHeightFt != null && (
            <Stat label="Stage" value={`${gauge.gaugeHeightFt} ft`} />
          )}
          {gauge.dischargeCfs != null && (
            <Stat label="Flow" value={`${gauge.dischargeCfs} cfs`} />
          )}
          {gauge.readingTimestamp && (
            <Stat
              label="Updated"
              value={formatRelativeTime(gauge.readingTimestamp)}
            />
          )}
        </View>

        {primary && (
          <>
            <ThemedText type="subtitle">
              Thresholds — {primary.riverName} ({unit})
            </ThemedText>
            <ThemedView type="backgroundElement" style={styles.thresholdCard}>
              {THRESHOLD_ROWS.map(({ key, label, color }) => {
                const value = primary[key];
                if (value == null) return null;
                return (
                  <View key={key} style={styles.thresholdRow}>
                    <View style={[styles.dot, { backgroundColor: color }]} />
                    <ThemedText type="small" style={styles.thresholdLabel}>
                      {label}
                    </ThemedText>
                    <ThemedText style={styles.semibold}>
                      {value} {unit}
                    </ThemedText>
                  </View>
                );
              })}
            </ThemedView>
          </>
        )}

        {history && history.readings.length > 0 && (
          <>
            <ThemedText type="subtitle">Last 7 days</ThemedText>
            <ThemedView type="backgroundElement" style={styles.thresholdCard}>
              {history.stats.minHeight != null &&
                history.stats.maxHeight != null && (
                  <ThemedText type="small">
                    Stage range: {history.stats.minHeight}–
                    {history.stats.maxHeight} ft
                  </ThemedText>
                )}
              {history.stats.minDischarge != null &&
                history.stats.maxDischarge != null && (
                  <ThemedText type="small">
                    Flow range: {history.stats.minDischarge}–
                    {history.stats.maxDischarge} cfs
                  </ThemedText>
                )}
              <ThemedText type="small">
                {history.readings.length} readings
              </ThemedText>
            </ThemedView>
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <ThemedView type="backgroundElement" style={styles.stat}>
      <ThemedText type="small">{label}</ThemedText>
      <ThemedText style={styles.semibold}>{value}</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  stat: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    gap: 2,
  },
  thresholdCard: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  thresholdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  thresholdLabel: {
    flex: 1,
  },
  semibold: {
    fontWeight: '600',
  },
});
