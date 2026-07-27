// eddy-ios/app/(tabs)/favorites.tsx
// Starred rivers, from the local-first store. Works with no account and no
// network — see src/hooks/useStarredRivers.tsx for why that matters.
//
// The store is the source of truth for WHICH rivers appear. It cannot be the
// source of truth for their condition: it only holds an id, a name and a slug,
// which is why this screen used to print the raw slug as a subtitle. The one
// list of rivers a user explicitly curated was the only list in the app with no
// condition on it at all.
//
// So conditions are an ENRICHMENT, not a dependency. /api/rivers is fetched
// opportunistically and matched by id; if it fails — offline at a put-in, which
// is the case this screen exists for — the rows still render from the store with
// an honest "conditions unavailable" note instead of vanishing.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { MapGauge, RiverListItem } from '@eddy/types';
import { fetchGauges, fetchRivers } from '@/api/client';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { EddyScene } from '@/components/EddyScene';
import { RiverRow } from '@/components/RiverRow';
import { GaugeRow } from '@/components/GaugeRow';
import { useStarredRivers } from '@/hooks/useStarredRivers';
import { useSavedFloats } from '@/hooks/useSavedFloats';
import { useRouter } from 'expo-router';

export default function FavoritesScreen() {
  const { starred, toggleStar, ready } = useStarredRivers();
  const { floats: savedFloats } = useSavedFloats();
  const { colors, elevation } = useTheme();
  const router = useRouter();

  const [rivers, setRivers] = useState<RiverListItem[] | null>(null);
  const [gauges, setGauges] = useState<MapGauge[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Errors are swallowed on purpose. A failed enrichment must not produce an
  // error state on a screen whose whole promise is that it works offline.
  const load = useCallback(async (signal?: AbortSignal) => {
    // Rivers and gauges enrich independently: a starred gauge must still show a
    // live reading when the river list fails, and vice versa.
    await Promise.all([
      fetchRivers(signal)
        .then(setRivers)
        .catch(() => {}),
      fetchGauges(signal)
        .then(setGauges)
        .catch(() => {}),
    ]);
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

  const byId = useMemo(
    () => new Map((rivers ?? []).map((river) => [river.id, river])),
    [rivers],
  );
  const gaugeById = useMemo(
    () => new Map((gauges ?? []).map((gauge) => [gauge.id, gauge])),
    [gauges],
  );

  // "3 rivers · 1 gauge", and never a kind with a zero — a mixed list should
  // describe what is in it, not enumerate what is not.
  const favoritesSummary = useMemo(() => {
    const riverCount = starred.filter((s) => s.kind === 'river').length;
    const gaugeCount = starred.length - riverCount;
    return [
      riverCount > 0 ? `${riverCount} river${riverCount === 1 ? '' : 's'}` : null,
      gaugeCount > 0 ? `${gaugeCount} gauge${gaugeCount === 1 ? '' : 's'}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }, [starred]);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
      <FlatList
        data={starred}
        keyExtractor={(item) => `${item.kind}:${item.entityId}`}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>Favorites</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              {starred.length === 0
                ? 'Favorites are saved on this device'
                : favoritesSummary}
            </Text>

            {/* Saved floats live here rather than in a sixth tab: this is
                already the screen for "things I kept", and both of them are
                local, account-free and work offline. Hidden at zero — an empty
                row teaching a feature nobody has used yet is clutter on the one
                screen that should be all the user's own stuff. */}
            {savedFloats.length > 0 ? (
              <Pressable
                onPress={() => router.push('/floats')}
                style={({ pressed }) => [
                  styles.floatsRow,
                  { backgroundColor: colors.card, opacity: pressed ? 0.6 : 1 },
                  elevation(1),
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Saved floats, ${savedFloats.length}`}
              >
                <Ionicons name="navigate-outline" size={18} color={colors.accent} />
                <Text style={[styles.floatsText, { color: colors.text }]}>Saved floats</Text>
                <Text style={[styles.floatsCount, { color: colors.textSubtle }]}>
                  {savedFloats.length}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
              </Pressable>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          ready ? (
            <View style={styles.empty}>
              {/* "No favorite rivers yet?" — the heart is the screen. */}
              <EddyScene name="heart" size={128} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                No favorite rivers yet?
              </Text>
              <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
                Tap the star on any river or gauge to save it to your favorites. No account
                needed — favorites are kept on this device and will sync when you sign in.
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          if (item.kind === 'gauge') {
            const gauge = gaugeById.get(item.entityId) ?? null;
            // The gauge's own primary association names the river, so this does
            // not depend on the river list having loaded. Falls back to the
            // river list by slug, and then to nothing.
            const riverName =
              gauge?.thresholds?.find((link) => link.isPrimary)?.riverName ??
              (rivers ?? []).find((r) => r.slug === item.slug)?.name ??
              null;
            return (
              <GaugeRow
                name={item.name}
                riverName={riverName}
                gauge={gauge}
                // Only when it actually rates a river. A gauge that rates none
                // has nowhere honest to go, and a dead tap is worse than none.
                onPress={item.slug ? () => router.push(`/river/${item.slug}`) : null}
                onToggleStar={() => toggleStar(item)}
              />
            );
          }

          const river = byId.get(item.entityId);
          if (river) {
            return (
              <RiverRow
                river={river}
                starred
                onPress={() => router.push(`/river/${item.slug}`)}
                onToggleStar={() => toggleStar(item)}
              />
            );
          }

          // Store-only fallback: named, tappable, honest about what's missing.
          return (
            <View style={[styles.row, { backgroundColor: colors.card }, elevation(1)]}>
              <Pressable
                onPress={() => router.push(`/river/${item.slug}`)}
                style={({ pressed }) => [styles.rowBody, { opacity: pressed ? 0.6 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel={`${item.name} details, conditions unavailable`}
              >
                <Text style={[styles.riverName, { color: colors.text }]}>{item.name}</Text>
                <Text style={[styles.riverMeta, { color: colors.textSubtle }]}>
                  Conditions unavailable — pull to refresh
                </Text>
              </Pressable>
              <Pressable
                onPress={() => toggleStar(item)}
                style={({ pressed }) => [styles.starColumn, { opacity: pressed ? 0.5 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel={`Unstar ${item.name}`}
              >
                <Ionicons name="star" size={21} color={colors.warm} />
              </Pressable>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  title: { ...t['3xl'], fontFamily: fonts.display },
  subtitle: { ...t.sm, fontFamily: fonts.body, marginTop: 4 },
  floatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    paddingHorizontal: 13,
    paddingVertical: 12,
    borderRadius: 12,
  },
  floatsText: { ...t.sm, fontFamily: fonts.semibold, flex: 1 },
  floatsCount: { ...t.sm, fontFamily: fonts.mono },
  empty: { alignItems: 'center', paddingHorizontal: 40, paddingTop: 40 },
  emptyTitle: { ...t.lg, fontFamily: fonts.semibold, marginTop: 10 },
  emptyBody: { ...t.sm, fontFamily: fonts.body, textAlign: 'center', marginTop: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginHorizontal: 16,
    marginBottom: 9,
    borderRadius: 14,
    overflow: 'hidden',
  },
  rowBody: { flex: 1, minWidth: 0, paddingVertical: 14, paddingLeft: 16, paddingRight: 4 },
  riverName: { ...t.base, fontFamily: fonts.semibold },
  riverMeta: { ...t.xs, fontFamily: fonts.body, marginTop: 3 },
  starColumn: { width: 52, alignItems: 'center', justifyContent: 'center' },
});
