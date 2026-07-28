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
// the Search tab uses, and the difference is Eddy's live call on each one. This
// screen holds three or four rivers somebody chose on purpose and comes back to
// in order to check on them; answering that with "944 cfs · Good" made them do
// the interpreting. The header of that component has the longer argument.
//
// The call comes from /api/rivers/[slug]/outlook, one request per starred
// river, and it is an enrichment on an enrichment: the card degrades to exactly
// the row it replaced when it does not arrive. Nothing on it is gated — see
// the note there on why the BOTTOM LINE is the piece of prose that belongs on a
// card and Eddy's long read is not.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { MapGauge, RiverListItem, RiverOutlookResponse } from '@eddy/types';
import { fetchGauges, fetchRiverOutlook, fetchRivers } from '@/api/client';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { EddyScene } from '@/components/EddyScene';
import { FavoriteRiverCard } from '@/components/FavoriteRiverCard';
import { GaugeRow } from '@/components/GaugeRow';
import { useStarredRivers } from '@/hooks/useStarredRivers';
import { useSavedFloats } from '@/hooks/useSavedFloats';
import { useRouter } from 'expo-router';

/**
 * How many river reports are in flight at once.
 *
 * One request per starred river, and nothing caps how many rivers somebody
 * stars. Six at a time keeps a long favourites list from opening twenty-odd
 * sockets on one bar of LTE — which is the connection this screen is designed
 * around — while still filling the visible cards in the first round.
 */
const REPORT_CONCURRENCY = 6;

export default function FavoritesScreen() {
  const { starred, toggleStar, ready } = useStarredRivers();
  const { floats: savedFloats } = useSavedFloats();
  const { colors, elevation } = useTheme();
  const router = useRouter();

  const [rivers, setRivers] = useState<RiverListItem[] | null>(null);
  const [gauges, setGauges] = useState<MapGauge[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Keyed by slug. A slug present with a null value has been asked about and
  // has no report; a slug that is absent has not been asked yet, which is what
  // lets a card tell "loading" from "there is nothing to say".
  const [reports, setReports] = useState<Record<string, RiverOutlookResponse | null>>({});
  // Bumped by pull-to-refresh, which is the only thing that re-reads a report
  // for a river already answered for.
  const [reportEpoch, setReportEpoch] = useState(0);

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
    setReportEpoch((epoch) => epoch + 1);
    await load();
    setRefreshing(false);
  }, [load]);

  /**
   * Which rivers need a report, as a string so the effect below has one
   * primitive to compare rather than an array identity that changes on every
   * render of the store.
   */
  const starredRiverSlugs = useMemo(
    () =>
      starred
        .filter((item) => item.kind === 'river' && item.slug)
        .map((item) => item.slug)
        .join(','),
    [starred],
  );

  /**
   * Which slugs this epoch has already answered for.
   *
   * A ref rather than reading `reports`, which would have to be a dependency
   * and would then restart the effect on its own result. Starring a river on
   * another tab changes the slug list and re-runs this; without the record it
   * would re-fetch every card to add one.
   */
  const answered = useRef({ epoch: 0, slugs: new Set<string>() });

  // Reports, fetched per starred river and never blocking anything. Failures
  // are recorded as "no report" rather than retried: the card without one is
  // the row this screen used to show, which is a perfectly good answer, and a
  // retry loop on a screen whose whole promise is working offline is a battery
  // drain nobody asked for. Pull-to-refresh is the way back.
  useEffect(() => {
    if (answered.current.epoch !== reportEpoch) {
      answered.current = { epoch: reportEpoch, slugs: new Set() };
    }
    const pending = (starredRiverSlugs ? starredRiverSlugs.split(',') : []).filter(
      (slug) => !answered.current.slugs.has(slug),
    );
    if (pending.length === 0) return;

    const controller = new AbortController();

    (async () => {
      for (let i = 0; i < pending.length; i += REPORT_CONCURRENCY) {
        const batch = pending.slice(i, i + REPORT_CONCURRENCY);
        const settled = await Promise.all(
          batch.map(async (slug) => {
            const report = await fetchRiverOutlook(slug, controller.signal).catch(() => null);
            return [slug, report] as const;
          }),
        );
        // An aborted batch is NOT recorded as answered — the next run retries
        // it, which is what makes unstarring one river mid-load harmless.
        if (controller.signal.aborted) return;
        for (const [slug] of settled) answered.current.slugs.add(slug);
        // Merged rather than replaced, so a river answered in an earlier batch
        // keeps its card while this walks the rest.
        setReports((prev) => ({ ...prev, ...Object.fromEntries(settled) }));
      }
    })();

    return () => controller.abort();
  }, [starredRiverSlugs, reportEpoch]);

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
                // Everything in this list is starred; the row is what unstars it.
                starred
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
              <FavoriteRiverCard
                river={river}
                report={reports[item.slug] ?? null}
                // Absent from the map means "not asked yet". A slug present
                // with a null value has been asked and has no report, and must
                // not spin forever.
                reportLoading={!(item.slug in reports)}
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
