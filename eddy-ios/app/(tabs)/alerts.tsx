// eddy-ios/app/(tabs)/alerts.tsx
// The condition-change feed. Free to read, no account required — which is why
// filtering to "my rivers" happens on the client from the local star store
// rather than being asked of the server.
//
// Real-time push is the paid layer on top of this; the feed itself is part of
// the free tier.

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
import { ALERT_LATENCY_NOTE, type AlertFeedEntry } from '@eddy/types';
import { ApiError, fetchAlerts } from '@/api/client';
import { COLORS, conditionBg, conditionColor } from '@/theme/conditions';
import { alertDetail, alertHeadline } from '@/lib/alertCopy';
import { useStarredRivers } from '@/hooks/useStarredRivers';

export default function AlertsScreen() {
  const [alerts, setAlerts] = useState<AlertFeedEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [onlyStarred, setOnlyStarred] = useState(true);
  const { isStarred, starred } = useStarredRivers();

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setError(null);
      setAlerts(await fetchAlerts(signal));
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

  const visible = useMemo(() => {
    if (!alerts) return [];
    if (!onlyStarred) return alerts;
    return alerts.filter((a) => isStarred(a.riverId));
  }, [alerts, onlyStarred, isStarred]);

  if (!alerts && !error) {
    return (
      <SafeAreaView style={styles.centered} edges={['top']}>
        <ActivityIndicator color={COLORS.accent} />
      </SafeAreaView>
    );
  }

  const hasStars = starred.length > 0;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Alerts</Text>
            <View style={styles.toggleRow}>
              <Pressable
                onPress={() => setOnlyStarred(true)}
                style={[styles.toggle, onlyStarred && styles.toggleActive]}
              >
                <Text style={[styles.toggleText, onlyStarred && styles.toggleTextActive]}>
                  My rivers
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setOnlyStarred(false)}
                style={[styles.toggle, !onlyStarred && styles.toggleActive]}
              >
                <Text style={[styles.toggleText, !onlyStarred && styles.toggleTextActive]}>
                  All rivers
                </Text>
              </Pressable>
            </View>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="notifications-outline" size={40} color={COLORS.textSubtle} />
            <Text style={styles.emptyTitle}>
              {onlyStarred && !hasStars ? 'No starred rivers yet' : 'No recent changes'}
            </Text>
            <Text style={styles.emptyBody}>
              {onlyStarred && !hasStars
                ? 'Star a river in River Reports to see its condition changes here.'
                : onlyStarred
                  ? "None of your starred rivers have changed condition recently. That's usually good news."
                  : 'No rivers have changed condition recently.'}
            </Text>
          </View>
        }
        ListFooterComponent={
          visible.length > 0 ? (
            // The honesty line. Detection trails the real river by roughly
            // 20–75 minutes; measured at 31 minutes on the first live events.
            <Text style={styles.footnote}>{ALERT_LATENCY_NOTE}</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View
              style={[styles.stripe, { backgroundColor: conditionColor(item.newConditionCode) }]}
            />
            <View style={styles.rowBody}>
              <Text style={styles.riverName}>{item.riverName}</Text>
              <Text
                style={[styles.headline, { color: conditionColor(item.newConditionCode) }]}
              >
                {alertHeadline(item)}
              </Text>
              <Text style={styles.detail}>{alertDetail(item)}</Text>
            </View>
            <View
              style={[styles.chip, { backgroundColor: conditionBg(item.newConditionCode) }]}
            >
              <Ionicons
                name={item.kind === 'floatable' ? 'water-outline' : 'alert-circle-outline'}
                size={16}
                color={conditionColor(item.newConditionCode)}
              />
            </View>
          </View>
        )}
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
  },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 },
  title: { color: COLORS.text, fontSize: 30, fontWeight: '700' },
  toggleRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  toggle: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  toggleActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  toggleText: { color: COLORS.textMuted, fontSize: 13, fontWeight: '600' },
  toggleTextActive: { color: '#FFFFFF' },
  errorText: { color: COLORS.textMuted, fontSize: 14, marginTop: 10 },
  empty: { alignItems: 'center', paddingHorizontal: 40, paddingTop: 50 },
  emptyTitle: { color: COLORS.text, fontSize: 18, fontWeight: '600', marginTop: 14 },
  emptyBody: {
    color: COLORS.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 21,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  stripe: { width: 4, alignSelf: 'stretch' },
  rowBody: { flex: 1, padding: 14 },
  riverName: { color: COLORS.text, fontSize: 16, fontWeight: '600' },
  headline: { fontSize: 14, fontWeight: '700', marginTop: 3 },
  detail: { color: COLORS.textMuted, fontSize: 13, marginTop: 3 },
  chip: { padding: 8, borderRadius: 999, marginRight: 14 },
  footnote: {
    color: COLORS.textSubtle,
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 32,
    paddingTop: 6,
    paddingBottom: 24,
    lineHeight: 17,
  },
});
