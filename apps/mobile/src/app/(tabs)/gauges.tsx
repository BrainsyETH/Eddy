import { Link } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { GaugeStationSummary } from '@eddy/shared/types/api';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { api } from '@/lib/api';

function formatReading(gauge: GaugeStationSummary): string {
  const parts: string[] = [];
  if (gauge.gaugeHeightFt != null) parts.push(`${gauge.gaugeHeightFt} ft`);
  if (gauge.dischargeCfs != null) parts.push(`${gauge.dischargeCfs} cfs`);
  return parts.length > 0 ? parts.join(' · ') : 'No recent reading';
}

function GaugeRow({ gauge }: { gauge: GaugeStationSummary }) {
  const riverName = gauge.thresholds?.find((t) => t.isPrimary)?.riverName;
  return (
    <Link href={`/gauges/${gauge.usgsSiteId}`} asChild>
      <Pressable>
        {({ pressed }) => (
          <ThemedView
            type="backgroundElement"
            style={[styles.row, pressed && styles.rowPressed]}
          >
            <View style={styles.rowText}>
              <ThemedText style={styles.semibold} numberOfLines={1}>
                {gauge.name}
              </ThemedText>
              <ThemedText type="small">
                {formatReading(gauge)}
                {riverName ? ` · ${riverName}` : ''}
              </ThemedText>
            </View>
          </ThemedView>
        )}
      </Pressable>
    </Link>
  );
}

export default function GaugesScreen() {
  const [gauges, setGauges] = useState<GaugeStationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const { gauges } = await api.getGauges();
      setGauges(gauges);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load gauges');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          Gauges
        </ThemedText>
        {loading ? (
          <ActivityIndicator style={styles.loader} />
        ) : error ? (
          <View style={styles.center}>
            <ThemedText>Couldn&apos;t load gauges.</ThemedText>
            <ThemedText type="small">{error}</ThemedText>
          </View>
        ) : null}
        <FlatList
          data={gauges}
          keyExtractor={(g) => g.id}
          renderItem={({ item }) => <GaugeRow gauge={item} />}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
  },
  title: {
    paddingVertical: Spacing.three,
  },
  loader: {
    marginTop: Spacing.four,
  },
  center: {
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.four,
  },
  list: {
    gap: Spacing.two,
    paddingBottom: BottomTabInset + Spacing.three,
  },
  row: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowText: {
    gap: 2,
  },
  semibold: {
    fontWeight: '600',
  },
});
