// eddy-ios/app/(tabs)/reports.tsx
// River Reports — the list view: every curated river ranked by how floatable it
// is right now. This is the tab that answers "what can I float today?".
//
// Ordering and the floatable count both come from the canonical condition
// system rather than local logic, so the app's headline number always matches
// the website's. See src/theme/conditions.ts for why the two severity orderings
// must not be conflated.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { RiverListItem } from '@eddy/types';
import { ApiError, fetchRivers } from '@/api/client';
import {
  COLORS,
  conditionBg,
  conditionColor,
  conditionLabel,
  floatableRank,
  isFloatableNow,
} from '@/theme/conditions';
import { useStarredRivers } from '@/hooks/useStarredRivers';

export default function ReportsScreen() {
  const [rivers, setRivers] = useState<RiverListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { isStarred, toggleStar, ready: starsReady } = useStarredRivers();

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

  // Floatable first, then by canonical rank, then by name. A paddler opening
  // this screen wants somewhere to go, not an index.
  const sorted = useMemo(() => {
    if (!rivers) return [];
    return [...rivers].sort((a, b) => {
      const aCode = a.currentCondition?.code ?? 'unknown';
      const bCode = b.currentCondition?.code ?? 'unknown';
      const byRank = floatableRank(aCode) - floatableRank(bCode);
      if (byRank !== 0) return byRank;
      return a.name.localeCompare(b.name);
    });
  }, [rivers]);

  // Uses the strict flowing/good bucket, matching every public floatable count.
  const floatableCount = sorted.filter((r) =>
    isFloatableNow(r.currentCondition?.code ?? 'unknown')
  ).length;

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
              {error ? error : `${floatableCount} of ${sorted.length} rivers floatable right now`}
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
          const starred = isStarred(item.id);
          return (
            <View style={styles.row}>
              <View style={[styles.dot, { backgroundColor: conditionColor(code) }]} />
              <View style={styles.rowBody}>
                <Text style={styles.riverName}>{item.name}</Text>
                <Text style={styles.riverMeta}>
                  {item.region ?? item.state} · {item.accessPointCount} access points
                </Text>
              </View>
              <View style={[styles.chip, { backgroundColor: conditionBg(code) }]}>
                <Text style={[styles.chipText, { color: conditionColor(code) }]}>
                  {item.currentCondition?.label ?? conditionLabel(code)}
                </Text>
              </View>
              <Pressable
                onPress={() => toggleStar({ riverId: item.id, name: item.name, slug: item.slug })}
                disabled={!starsReady}
                hitSlop={10}
                style={styles.starButton}
                accessibilityRole="button"
                accessibilityLabel={starred ? `Unstar ${item.name}` : `Star ${item.name}`}
              >
                <Ionicons
                  name={starred ? 'star' : 'star-outline'}
                  size={22}
                  color={starred ? COLORS.warm : COLORS.textSubtle}
                />
              </Pressable>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bg,
    padding: 24,
  },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  title: { color: COLORS.text, fontSize: 30, fontWeight: '700' },
  subtitle: { color: COLORS.textMuted, fontSize: 15, marginTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  rowBody: { flex: 1 },
  riverName: { color: COLORS.text, fontSize: 17, fontWeight: '600' },
  riverMeta: { color: COLORS.textMuted, fontSize: 13, marginTop: 2 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, marginRight: 4 },
  chipText: { fontSize: 12, fontWeight: '700' },
  starButton: { paddingLeft: 8, paddingVertical: 4 },
});
