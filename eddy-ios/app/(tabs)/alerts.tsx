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
import { conditionBg, conditionColor, conditionInk } from '@/theme/conditions';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { alertDetail, alertHeadline } from '@/lib/alertCopy';
import { EddyScene } from '@/components/EddyScene';
import { useStarredRivers } from '@/hooks/useStarredRivers';
import { useRouter } from 'expo-router';

export default function AlertsScreen() {
  const [alerts, setAlerts] = useState<AlertFeedEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [onlyStarred, setOnlyStarred] = useState(true);
  const { isStarred, starred } = useStarredRivers();
  const { colors, elevation } = useTheme();
  const router = useRouter();

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
    return alerts.filter((a) => isStarred('river', a.riverId));
  }, [alerts, onlyStarred, isStarred]);

  if (!alerts && !error) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.bg }]} edges={['top']}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  const hasStars = starred.length > 0;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>Alerts</Text>
            <View style={styles.toggleRow}>
              <Pressable
                onPress={() => setOnlyStarred(true)}
                style={[
                  styles.toggle,
                  { borderColor: colors.border },
                  onlyStarred && { backgroundColor: colors.accent, borderColor: colors.accent },
                ]}
              >
                <Text
                  style={[
                    styles.toggleText,
                    { color: onlyStarred ? colors.onAccent : colors.textMuted },
                  ]}
                >
                  My rivers
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setOnlyStarred(false)}
                style={[
                  styles.toggle,
                  { borderColor: colors.border },
                  !onlyStarred && { backgroundColor: colors.accent, borderColor: colors.accent },
                ]}
              >
                <Text
                  style={[
                    styles.toggleText,
                    { color: !onlyStarred ? colors.onAccent : colors.textMuted },
                  ]}
                >
                  All rivers
                </Text>
              </Pressable>
            </View>
            {error ? <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            {/* Checking, not alarmed. Every string below this is a version of
                "we looked and nothing has changed", and the catalog's
                high-water scene would announce the opposite. */}
            <EddyScene name="checkingGauge" size={120} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {onlyStarred && !hasStars ? 'No starred rivers yet' : 'No recent changes'}
            </Text>
            <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
              {onlyStarred && !hasStars
                ? 'Star a river in Search to see its condition changes here.'
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
            <Text style={[styles.footnote, { color: colors.textSubtle }]}>{ALERT_LATENCY_NOTE}</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/river/${item.riverSlug}`)}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
              elevation(1),
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${item.riverName} details`}
          >
            <View
              style={[styles.stripe, { backgroundColor: conditionColor(item.newConditionCode) }]}
            />
            <View style={styles.rowBody}>
              <Text style={[styles.riverName, { color: colors.text }]}>{item.riverName}</Text>
              {/* ink, not `solid`. The solid is the marker/stripe colour and is
                  not a text colour: lime-500 and yellow-500 fall below 4.5:1 on
                  white, so a "Good" or "Low" headline was failing contrast while
                  the icon two lines down already used ink correctly. */}
              <Text
                style={[styles.headline, { color: conditionInk(item.newConditionCode) }]}
              >
                {alertHeadline(item)}
              </Text>
              <Text style={[styles.detail, { color: colors.textMuted }]}>{alertDetail(item)}</Text>
            </View>
            <View
              style={[styles.chip, { backgroundColor: conditionBg(item.newConditionCode) }]}
            >
              <Ionicons
                name={item.kind === 'floatable' ? 'water-outline' : 'alert-circle-outline'}
                size={16}
                color={conditionInk(item.newConditionCode)}
              />
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 },
  title: { ...t['3xl'], fontFamily: fonts.display },
  toggleRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  toggle: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  toggleText: { ...t.xs, fontFamily: fonts.semibold },
  errorText: { ...t.sm, fontFamily: fonts.body, marginTop: 10 },
  empty: { alignItems: 'center', paddingHorizontal: 40, paddingTop: 30 },
  emptyTitle: { ...t.lg, fontFamily: fonts.semibold, marginTop: 10 },
  emptyBody: { ...t.sm, fontFamily: fonts.body, textAlign: 'center', marginTop: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 14,
    overflow: 'hidden',
  },
  stripe: { width: 4, alignSelf: 'stretch' },
  rowBody: { flex: 1, padding: 14 },
  riverName: { ...t.base, fontFamily: fonts.semibold },
  headline: { ...t.sm, fontFamily: fonts.semibold, marginTop: 3 },
  detail: { ...t.xs, fontFamily: fonts.body, marginTop: 3 },
  chip: { padding: 8, borderRadius: 999, marginRight: 14 },
  footnote: {
    ...t.xs,
    fontFamily: fonts.body,
    textAlign: 'center',
    paddingHorizontal: 32,
    paddingTop: 6,
    paddingBottom: 24,
  },
});
