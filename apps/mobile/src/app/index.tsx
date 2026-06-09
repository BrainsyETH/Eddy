import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { ConditionCode, RiverListItem } from '@eddy/shared/types/api';
import { CONDITION_COLORS } from '@eddy/shared/constants';
import { getConditionShortLabel } from '@eddy/shared/conditions';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { api } from '@/lib/api';

function ConditionBadge({ code }: { code: ConditionCode }) {
  return (
    <View style={[styles.badge, { backgroundColor: CONDITION_COLORS[code] }]}>
      <ThemedText type="small" style={styles.badgeText}>
        {getConditionShortLabel(code)}
      </ThemedText>
    </View>
  );
}

function RiverRow({ river }: { river: RiverListItem }) {
  return (
    <ThemedView type="backgroundElement" style={styles.row}>
      <View style={styles.rowText}>
        <ThemedText style={styles.riverName}>{river.name}</ThemedText>
        <ThemedText type="small">
          {river.accessPointCount} access points
        </ThemedText>
      </View>
      {river.currentCondition && (
        <ConditionBadge code={river.currentCondition.code} />
      )}
    </ThemedView>
  );
}

export default function RiversScreen() {
  const [rivers, setRivers] = useState<RiverListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const { rivers } = await api.getRivers();
      setRivers(rivers);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load rivers');
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
          Rivers
        </ThemedText>
        {loading ? (
          <ActivityIndicator style={styles.loader} />
        ) : error ? (
          <View style={styles.center}>
            <ThemedText>Couldn&apos;t load rivers.</ThemedText>
            <ThemedText type="small">{error}</ThemedText>
            <ThemedText type="small">Pull down to retry.</ThemedText>
          </View>
        ) : null}
        <FlatList
          data={rivers}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => <RiverRow river={item} />}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
  rowText: {
    gap: 2,
    flexShrink: 1,
  },
  riverName: {
    fontWeight: '600',
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
  },
  badgeText: {
    color: '#fff',
    fontWeight: '600',
  },
});
