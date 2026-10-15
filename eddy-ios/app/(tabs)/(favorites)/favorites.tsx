// Favorites are local-first: stored names remain usable when conditions
// cannot load. River cards use the existing /api/gauges catalog for compact
// reading pills at every linked station, without per-river request fan-out.
// Until that catalog arrives, /api/rivers supplies the headline fallback.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LazyTabScreen } from '@/components/LazyTabScreen';
import { ControlIcon } from '@/components/ControlIcon';
import { AccountIconButton } from '@/components/AccountButton';
import type { DamSnapshot, MapGauge, RiverListItem } from '@eddy/types';
import { fetchGauges, fetchRivers } from '@/api/client';
import { getSharedDams } from '@/hooks/useDams';
import { readIndex } from '@/lib/riverCache';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, textStyles, type as t } from '@/theme/typography';
import { EddyScene } from '@/components/EddyScene';
import { FilterChips, type FilterChip } from '@/components/FilterChips';
import { FavoriteRiverCard, type GaugeThresholds } from '@/components/FavoriteRiverCard';
import { GaugeRow } from '@/components/GaugeRow';
import { DamRow } from '@/components/dam/DamRow';
import { SwipeRow } from '@/components/SwipeRow';
import { rememberGauge, seedFromMapGauge, seedFromStar } from '@/lib/gaugeSeed';
import { useStarredRivers } from '@/hooks/useStarredRivers';
import { useRouter, useFocusEffect } from 'expo-router';
import { agedIndex, envelope, effectiveReadingAgeHours, type CacheEnvelope } from '@/lib/offline-cache';
import { onForeground } from '@/lib/foreground';
import { createLatestRequest } from '@/lib/latestRequest';
import { favoriteGaugeReadings } from '@/lib/favoriteGaugeReadings';

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
function gaugeForRiver(
  gauges: MapGauge[] | null,
  riverId: string,
): { gauge: MapGauge; link: GaugeThresholds } | null {
  if (!gauges) return null;

  let fallback: { gauge: MapGauge; link: GaugeThresholds } | null = null;
  for (const gauge of gauges) {
    for (const link of gauge.thresholds ?? []) {
      if (link.riverId !== riverId) continue;
      if (link.isPrimary) return { gauge, link };
      fallback ??= { gauge, link };
    }
  }
  return fallback;
}

/**
 * Which kinds a favourite list can be narrowed to.
 *
 * ── Why a filter at all, and why THIS one ───────────────────────────────────
 *
 * Favorites is the one list in the app the user built by hand, and it is
 * heterogeneous by design: rivers, individual stations and dam releases sit in
 * one scroll because they are all "things I check". Past a dozen that becomes a
 * scroll rather than a dashboard, and the cut people actually want is by kind —
 * "just show me my gauges" — because the three kinds answer different questions
 * and are read at different sizes.
 *
 * Not a condition filter. Two of the three kinds have no condition at all (a
 * national gauge has a percentile, a dam has a schedule), so a chip row of
 * floatability verdicts would narrow one third of the list and silently drop
 * the rest — the same mistake the Today tab's scopes exist to avoid. See the
 * header of app/(tabs)/reports.tsx on why vocabularies must not be mixed.
 *
 * The row hides itself below two kinds: a filter offering one real choice is a
 * control pretending to be a decision, and this screen is small by nature.
 */
type FavoriteKind = 'river' | 'gauge' | 'dam';
type FavoriteFilter = 'all' | FavoriteKind;

const FAVORITE_FILTERS: { key: FavoriteKind; label: string }[] = [
  { key: 'river', label: 'Rivers' },
  { key: 'gauge', label: 'Gauges' },
  { key: 'dam', label: 'Dams' },
];

export default function FavoritesScreen() {
  return <LazyTabScreen><FavoritesContent /></LazyTabScreen>;
}

function FavoritesContent() {
  const { starred, toggleStar, ready } = useStarredRivers();
  const { colors, elevation } = useTheme();
  const router = useRouter();

  const [riverSnapshot, setRiverSnapshot] = useState<CacheEnvelope<RiverListItem[]> | null>(null);
  const [gaugeSnapshot, setGaugeSnapshot] = useState<CacheEnvelope<MapGauge[]> | null>(null);
  const [now, setNow] = useState(Date.now);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const requests = useRef(createLatestRequest());
  const lastAttempt = useRef(0);
  const rivers = useMemo(() => riverSnapshot ? agedIndex(riverSnapshot, now) : null, [riverSnapshot, now]);
  const gauges = useMemo(() => gaugeSnapshot?.payload.map((gauge) => ({
    ...gauge,
    readingAgeHours: effectiveReadingAgeHours(gauge.readingAgeHours, gaugeSnapshot.fetchedAt, now),
  })) ?? null, [gaugeSnapshot, now]);
  // Not nullable, unlike the two above. fetchDams throws now rather than
  // answering [] — see its header — but this screen still wants the lenient
  // reading: the row renders from the store either way, and the enrichment
  // failing is not a state worth distinguishing here. The `.catch` below is
  // what keeps that true.
  const [dams, setDams] = useState<DamSnapshot[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FavoriteFilter>('all');
  const [riversFromCache, setRiversFromCache] = useState(false);

  // Keep useful readings after failures, but age the original snapshots against
  // the clock. A successful fetch earlier in the session never masks a failure.
  const load = useCallback(async () => {
    const request = requests.current.start();
    lastAttempt.current = Date.now();
    const failures = await Promise.all([
      fetchRivers(request.signal).then((live) => {
        if (!request.isCurrent()) return false;
        setRiverSnapshot(envelope(live, new Date().toISOString()));
        setRiversFromCache(false);
        return false;
      }).catch(async () => {
        const cached = await readIndex();
        if (!request.isCurrent()) return true;
        if (cached?.payload.length) {
          setRiverSnapshot((current) => current ?? cached);
          setRiversFromCache(true);
        }
        return true;
      }),
      fetchGauges(request.signal).then((live) => {
        if (request.isCurrent()) setGaugeSnapshot(envelope(live, new Date().toISOString()));
        return false;
      }).catch(() => true),
      getSharedDams().then((live) => {
        if (request.isCurrent()) setDams(live);
        return false;
      }).catch(() => true),
    ]);
    if (request.isCurrent()) {
      setRefreshFailed(failures.some(Boolean));
      setNow(Date.now());
    }
  }, []);

  useFocusEffect(useCallback(() => {
    setNow(Date.now());
    if (Date.now() - lastAttempt.current >= 5 * 60_000) void load();
  }, [load]));

  useEffect(() => {
    const activeRequests = requests.current;
    const unsubscribe = onForeground(() => {
      setNow(Date.now());
      if (Date.now() - lastAttempt.current >= 5 * 60_000) void load();
    });
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      activeRequests.invalidate();
      unsubscribe();
      clearInterval(timer);
    };
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

  /**
   * The chips, and only the kinds actually held.
   *
   * Counts off the WHOLE starred list rather than the filtered one — the rule
   * every chip row in this app follows, because a count computed after
   * filtering reads 0 on every chip but the live one. See FilterChips.
   *
   * A kind with nothing in it gets no chip at all: on a screen the user
   * assembled themselves, "Dams 0" is the app telling somebody about a feature
   * rather than about their own list.
   */
  const kindChips: FilterChip[] = useMemo(() => {
    const present = FAVORITE_FILTERS.map(({ key, label }) => ({
      key,
      label,
      icon: undefined,
      count: starred.filter((s) => s.kind === key).length,
    })).filter((chip) => chip.count > 0);
    if (present.length < 2) return [];
    return [{ key: 'all', label: 'All', count: starred.length }, ...present];
  }, [starred]);

  const visible = useMemo(
    () => (filter === 'all' ? starred : starred.filter((s) => s.kind === filter)),
    [starred, filter],
  );

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        data={visible}
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
            <View style={styles.titleRow}>
              <Text style={[styles.title, { color: colors.text }]}>Favorites</Text>
              <AccountIconButton />
            </View>
            {refreshFailed || riversFromCache ? (
              <View style={styles.offlineRow}>
                <ControlIcon name="cloud-offline-outline" size={14} color={colors.textMuted} />
                <Text style={[styles.offlineText, { color: colors.textMuted }]}>
                  {refreshFailed ? 'Couldn’t update all conditions.' : 'Showing saved conditions.'}
                  {riverSnapshot ? ` River readings last checked ${new Date(riverSnapshot.fetchedAt).toLocaleString()}.` : ''}
                  {' Pull down to retry.'}
                </Text>
              </View>
            ) : null}

            {/* Full-bleed rather than inside the header's 20pt gutter: the chip
                row scrolls horizontally and has to be able to run to the screen
                edge, which is why it takes its own padding. */}
            {kindChips.length > 0 ? (
              <View style={styles.chipRow}>
                <FilterChips
                  chips={kindChips}
                  active={[filter]}
                  // Single-select, and tapping the live chip returns to All —
                  // the same contract the Today tab's chips have, so the two
                  // rows do not behave differently for looking identical.
                  onToggle={(key) =>
                    setFilter((prev) => (prev === key ? 'all' : (key as FavoriteFilter)))
                  }
                  paddingHorizontal={20}
                />
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          ready ? (
            <View style={styles.empty}>
              {/* "No favorite rivers yet?" — the heart is the screen. */}
              <EddyScene name="heart" size={128} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {starred.length > 0 ? 'Nothing of that kind' : 'No favorite rivers yet?'}
              </Text>
              <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
                {starred.length > 0
                  ? 'Tap the live chip again to see everything you have saved.'
                  : 'Tap the star on any river or gauge to add it to your favorites. No account needed — favorites are kept on this device and will sync when you sign in.'}
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          /* ── Swipe left to unstar ──────────────────────────────────────
             The star inside each row already does this, and it is the third
             control on a card whose first two are "open it" and "open its
             gauge" — findable, but not the gesture anyone reaches for on a
             list of saved things. No confirmation: a favourite is local, and
             putting it back is one tap on the same star.

             bottomInset per kind, because the three row components do not
             share a bottom margin (8, 9 and 10) and the red must end exactly
             where the row does rather than two points short of it. */
          <SwipeRow
            onAction={() => toggleStar(item)}
            actionLabel="Remove"
            accessibilityActionLabel={`Remove ${item.name} from favorites`}
            bottomInset={item.kind === 'dam' ? 8 : item.kind === 'gauge' ? 9 : 10}
          >
            {favoriteRow(item)}
          </SwipeRow>
        )}
      />
    </SafeAreaView>
  );

  function favoriteRow(item: (typeof starred)[number]) {
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
              <ControlIcon name="star" size={21} color={colors.warm} />
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
          showContext
          now={now}
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
      // From the gauge list this screen already fetches — no request of its
      // own. Null when the river has no gauge, when none of its gauges rates
      // IT, or simply when /api/gauges has not landed; all three are ordinary
      // and the card renders without the track or the station name.
      const rated = gaugeForRiver(gauges, river.id);
      return (
        <FavoriteRiverCard
          river={river}
          gaugeReadings={favoriteGaugeReadings(gauges ?? [], river.slug)}
          onOpenGauge={(gauge) => {
            if (!gauge.usgsSiteId) return;
            rememberGauge(seedFromMapGauge(gauge));
            router.push(`/gauge/${encodeURIComponent(gauge.usgsSiteId)}`);
          }}
          thresholds={rated?.link ?? null}
          // WHICH STATION THE NUMBER CAME FROM. See the card.
          gaugeName={rated?.gauge.name ?? null}
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
          <ControlIcon name="star" size={21} color={colors.warm} />
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  title: { ...textStyles.pageTitle },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // The glyph and its sentence on one line, in the caption size: a marker,
  // not a banner. `flex: 1` on the text so a wrap happens under itself rather
  // than pushing the icon to a second line.
  offlineRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  offlineText: { ...t.xs, fontFamily: fonts.body, flex: 1 },
  // Cancels the header's own 20pt gutter so the scrolling chip row is
  // full-bleed; FilterChips re-applies the same 20 as content padding.
  chipRow: { marginHorizontal: -20, marginTop: 6, marginBottom: -6 },
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
