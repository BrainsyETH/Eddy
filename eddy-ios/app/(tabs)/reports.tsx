// eddy-ios/app/(tabs)/reports.tsx
// River Reports — the list view: every curated river ranked by how floatable it
// is right now. This is the tab that answers "what can I float today?", and it
// is the one screen in the shell wired to live data, because it needs no new
// backend: /api/rivers already returns each river's current condition.
//
// Deliberately sorted floatable-first rather than alphabetically. The product
// question is "where can I go", not "tell me about the Current River".

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RiverListItem } from '@eddy/types';
import { CONDITION_SEVERITY, isFloatable } from '@eddy/types';
import { ApiError, fetchRivers } from '@/api/client';
import { CONDITION_COLOR, CONDITION_LABEL, COLORS } from '@/theme/conditions';

export default function ReportsScreen() {
  const [rivers, setRivers] = useState<RiverListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setError(null);
      setRivers(await fetchRivers(signal));
    } catch (err) {
      if (err instanceof ApiError && err.message === 'Request cancelled') return;
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Floatable rivers first, then by severity, then by name. A paddler opening
  // this screen wants somewhere to go, not an index.
  const sorted = useMemo(() => {
    if (!rivers) return [];
    return [...rivers].sort((a, b) => {
      const aCode = a.currentCondition?.code ?? 'unknown';
      const bCode = b.currentCondition?.code ?? 'unknown';
      const aFloat = isFloatable(aCode) ? 1 : 0;
      const bFloat = isFloatable(bCode) ? 1 : 0;
      if (aFloat !== bFloat) return bFloat - aFloat;
      const bySeverity = CONDITION_SEVERITY[bCode] - CONDITION_SEVERITY[aCode];
      if (bySeverity !== 0) return bySeverity;
      return a.name.localeCompare(b.name);
    });
  }, [rivers]);

  const floatableCount = sorted.filter((r) => isFloatable(r.currentCondition?.code ?? 'unknown')).length;

  if (!rivers && !error) {
    return (
      <SafeAreaView style={styles.centered} edges={['top']}>
        <ActivityIndicator color={COLORS.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FlatList
        data={sorted}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>River Reports</Text>
            <Text style={styles.subtitle}>
              {error
                ? error
                : `${floatableCount} of ${sorted.length} rivers floatable right now`}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.subtitle}>{error ?? 'No rivers found'}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const code = item.currentCondition?.code ?? 'unknown';
          return (
            <View style={styles.row}>
              <View style={[styles.dot, { backgroundColor: CONDITION_COLOR[code] }]} />
              <View style={styles.rowBody}>
                <Text style={styles.riverName}>{item.name}</Text>
                <Text style={styles.riverMeta}>
                  {item.region ?? item.state} · {item.accessPointCount} access points
                </Text>
              </View>
              <Text style={[styles.condition, { color: CONDITION_COLOR[code] }]}>
                {item.currentCondition?.label ?? CONDITION_LABEL[code]}
              </Text>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg, padding: 24 },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  title: { color: COLORS.text, fontSize: 30, fontWeight: '700' },
  subtitle: { color: COLORS.textMuted, fontSize: 15, marginTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dot: { width: 12, height: 12, borderRadius: 6, marginRight: 14 },
  rowBody: { flex: 1 },
  riverName: { color: COLORS.text, fontSize: 17, fontWeight: '600' },
  riverMeta: { color: COLORS.textMuted, fontSize: 13, marginTop: 2 },
  condition: { fontSize: 13, fontWeight: '700', marginLeft: 12 },
});
