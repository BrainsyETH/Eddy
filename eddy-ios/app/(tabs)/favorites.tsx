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
//
// ── A favourite gets the card, not the row ──────────────────────────────────
// Starred rivers render as FavoriteRiverCard rather than the compact RiverRow
// the Search tab uses, and the difference is the band track under each reading.
// This screen holds three or four rivers somebody chose on purpose and comes
// back to in order to check on them; answering that with "944 cfs · Good" made
// them do the interpreting. The header of that component has the longer argument.
//
// ── This screen makes TWO requests, and that is the point ───────────────────
// It used to make N+2: /api/rivers, /api/gauges, and then one
// /api/rivers/[slug]/outlook per starred river to put Eddy's bottom line on
// each card. Six-at-a-time batching, an epoch counter and an answered-slug ref
// existed solely to keep that fan-out from opening twenty sockets on one bar of
// LTE — which is the connection this screen is designed around.
//
// The track replaced the prose, and every input it needs was already in the
// /api/gauges response: each gauge carries the threshold ladder per river it
// grades. So the fan-out and all of its machinery are gone. The prose still
// exists on the river screen, one tap away, where there is room for it.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { DamSnapshot, MapGauge, RiverListItem } from '@eddy/types';
import { fetchDams, fetchGauges, fetchRivers } from '@/api/client';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { EddyScene } from '@/components/EddyScene';
import { FavoriteRiverCard, type GaugeThresholds } from '@/components/FavoriteRiverCard';
import { GaugeRow } from '@/components/GaugeRow';
import { SafetyDisclaimer } from '@/components/SafetyDisclaimer';
import { DamRow } from '@/components/dam/DamRow';
import { rememberGauge, seedFromMapGauge, seedFromStar } from '@/lib/gaugeSeed';
import { useStarredRivers } from '@/hooks/useStarredRivers';
import { useSavedFloats } from '@/hooks/useSavedFloats';
import { useRouter } from 'expo-router';

/**
 * The ladder a river's own reading is graded on, out of the gauge list.
 *
 * ── Why it is matched on riverId and not on "the gauge's primary" ──────────
 * One physical station can rate two rivers on different editorial ladders —
 * 07014000 is primary for the Huzzah and also rates the Courtois — so a card
 * that took the gauge's own primary link would show its neighbour's bands under
 * its own number. The river is known here, so its row is the only correct one.
 * Same rule gaugeLink() applies when a river slug is in hand.
 *
 * Prefers the gauge for which THIS river is the primary association, because
 * that is the station /api/rivers computed `currentCondition` from, and the
 * track has to be about the number printed above it.
 *
 * Returns null freely: no gauge, no ladder, or the list simply has not landed.
 */
function thresholdsForRiver(
  gauges: MapGauge[] | null,
  riverId: string,
): GaugeThresholds | null {
  if (!gauges) return null;

  let fallback: GaugeThresholds | null = null;
  for (const gauge of gauges) {
    for (const link of gauge.thresholds ?? []) {
      if (link.riverId !== riverId) continue;
      if (link.isPrimary) return link;
      fallback ??= link;
    }
  }
  return fallback;
}

export default function FavoritesScreen() {
  const { starred, toggleStar, ready } = useStarredRivers();
  const { floats: savedFloats } = useSavedFloats();
  const { colors, elevation } = useTheme();
  const router = useRouter();

  const [rivers, setRivers] = useState<RiverListItem[] | null>(null);
  const [gauges, setGauges] = useState<MapGauge[] | null>(null);
  // Not nullable, unlike the two above: fetchDams already resolves to [] on
  // failure, so there is no "not yet loaded" state to distinguish.
  const [dams, setDams] = useState<DamSnapshot[]>([]);
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
      // A third enrichment, on the same terms as the other two: the store holds
      // a dam's slug and name, and this supplies what it is doing right now.
      // Failing is fine — the row still renders from the store.
      fetchDams(signal)
        .then(setDams)
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
  const damById = useMemo(() => new Map(dams.map((dam) => [dam.id, dam])), [dams]);

  // "3 rivers · 1 gauge", and never a kind with a zero — a mixed list should
  // describe what is in it, not enumerate what is not.
  const favoritesSummary = useMemo(() => {
    const riverCount = starred.filter((s) => s.kind === 'river').length;
    const gaugeCount = starred.filter((s) => s.kind === 'gauge').length;
    const damCount = starred.filter((s) => s.kind === 'dam').length;
    return [
      riverCount > 0 ? `${riverCount} river${riverCount === 1 ? '' : 's'}` : null,
      gaugeCount > 0 ? `${gaugeCount} gauge${gaugeCount === 1 ? '' : 's'}` : null,
      damCount > 0 ? `${damCount} dam${damCount === 1 ? '' : 's'}` : null,
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
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.interactive}
          />
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
                <Ionicons name="navigate-outline" size={18} color={colors.interactive} />
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
        ListFooterComponent={starred.length > 0 ? <SafetyDisclaimer /> : null}
        renderItem={({ item }) => {
          if (item.kind === 'dam') {
            const dam = damById.get(item.entityId);
            // No snapshot yet — offline, or /api/dams has not landed. The row
            // needs one to say anything about generation or release, so the
            // store's name and lake stand in until it does rather than the row
            // disappearing from a list the user curated.
            if (!dam) {
              // The same store-only fallback the river branch ends with, and
              // for the same reason: named, tappable, honest about what is
              // missing. A dam that only exists in the store still opens.
              return (
                <View style={[styles.row, { backgroundColor: colors.card }, elevation(1)]}>
                  <Pressable
                    onPress={() => router.push(`/dam/${item.entityId}`)}
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
            }
            return (
              <DamRow
                dam={dam}
                onPress={() => router.push(`/dam/${dam.id}`)}
                // Everything in this list is starred; the row is what unstars it.
                starred
                onToggleStar={() => toggleStar(item)}
                // The reason somebody starred a dam. /api/dams already carries
                // today's schedule, so this is a render, not a request.
                showSchedule
              />
            );
          }

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
                // Everything in this list is starred; the row is what unstars it.
                starred
                // THE GAUGE, not its river. This used to require `item.slug`
                // and open the river screen, which meant a starred station that
                // rates nothing was a dead row — and one that does rate a river
                // sent you to a page about whichever station is that river's
                // PRIMARY, which is frequently not the one you starred.
                //
                // The seed comes from the store rather than the gauge list, so
                // a starred national station opens with its name on screen even
                // though /api/gauges has never returned it.
                onPress={
                  item.usgsSiteId
                    ? () => {
                        rememberGauge(
                          gauge ? seedFromMapGauge(gauge) : seedFromStar(item),
                        );
                        router.push(`/gauge/${encodeURIComponent(item.usgsSiteId!)}`);
                      }
                    : null
                }
                onToggleStar={() => toggleStar(item)}
              />
            );
          }

          const river = byId.get(item.entityId);
          if (river) {
            return (
              <FavoriteRiverCard
                river={river}
                // From the gauge list this screen already fetches — no request
                // of its own. Null when the river has no gauge, when none of
                // its gauges rates IT, or simply when /api/gauges has not
                // landed; all three are ordinary and the card renders without
                // the track.
                thresholds={thresholdsForRiver(gauges, river.id)}
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
