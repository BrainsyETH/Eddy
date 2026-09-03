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
// grades. So the fan-out and all of its machinery are gone.
//
// ── The prose is back, and the count of requests did not change ─────────────
// One LINE of it, from /api/eddy-updates — a single batched call carrying an
// entry for every river, which the Today tab already makes and which is now
// shared through useEddyUpdates. What was expensive was asking per river, not
// asking at all, so nothing about the paragraph above is undone by this.
//
// It is the free summary, never the gated report: the card takes an EddySays,
// whose type has no field the paid quote could arrive in. The long version is
// still on the river screen, one tap away, where there is room for it — and
// after this it is one tap away for everybody rather than for subscribers.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { DamSnapshot, MapGauge, RiverListItem } from '@eddy/types';
import { fetchGauges, fetchRivers } from '@/api/client';
import { getSharedDams } from '@/hooks/useDams';
import { agedIndex, readIndex } from '@/lib/riverCache';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { EddyScene } from '@/components/EddyScene';
import { FilterChips, type FilterChip } from '@/components/FilterChips';
import { FavoriteRiverCard, type GaugeThresholds } from '@/components/FavoriteRiverCard';
import { GaugeRow } from '@/components/GaugeRow';
import { DamRow } from '@/components/dam/DamRow';
import { SwipeRow } from '@/components/SwipeRow';
import { rememberGauge, seedFromMapGauge, seedFromStar } from '@/lib/gaugeSeed';
import { useStarredRivers } from '@/hooks/useStarredRivers';
import { useEddyUpdates } from '@/hooks/useEddyUpdates';
import { selectEddySays } from '@/lib/eddySays';
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
  const { starred, toggleStar, ready } = useStarredRivers();
  const { floats: savedFloats } = useSavedFloats();
  const { colors, elevation } = useTheme();
  const router = useRouter();

  const [rivers, setRivers] = useState<RiverListItem[] | null>(null);
  const [gauges, setGauges] = useState<MapGauge[] | null>(null);
  // Not nullable, unlike the two above. fetchDams throws now rather than
  // answering [] — see its header — but this screen still wants the lenient
  // reading: the row renders from the store either way, and the enrichment
  // failing is not a state worth distinguishing here. The `.catch` below is
  // what keeps that true.
  const [dams, setDams] = useState<DamSnapshot[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FavoriteFilter>('all');
  /**
   * True while the conditions on the cards are the STORED index and no
   * /api/rivers answer has landed this session.
   *
   * agedIndex already greys anything past the trusted window and labels it
   * "Last known", but inside that window a cached reading paints in its full
   * condition colour — and nothing on this screen said it was cached. A green
   * card three hours after the signal dropped is honest only if it says so
   * (offline-cache.ts describes the fresh band as "the ordinary colour, plus
   * an offline glyph"; this is the glyph). Drops the moment the network
   * answers, which is also the only thing that ever replaces the list.
   */
  const [riversFromCache, setRiversFromCache] = useState(false);
  /**
   * Whether a LIVE list has landed this session — a ref, because it is only
   * ever read inside load(). It is what keeps a failed pull over a live list
   * from raising the marker: the cache read below never replaces what is on
   * screen, so the rows in that case are still today's and must not be
   * described as yesterday's.
   */
  const riversLive = useRef(false);

  // Errors are swallowed on purpose. A failed enrichment must not produce an
  // error state on a screen whose whole promise is that it works offline.
  const load = useCallback(async (signal?: AbortSignal) => {
    // Rivers and gauges enrich independently: a starred gauge must still show a
    // live reading when the river list fails, and vice versa.
    await Promise.all([
      fetchRivers(signal)
        .then((live) => {
          setRivers(live);
          riversLive.current = true;
          setRiversFromCache(false);
        })
        .catch(async () => {
          // Disk before nothing, on the screen whose whole promise is that it
          // works offline: the index is written through on every successful
          // fetch, and until now a dead connection left every starred river
          // reading "Conditions unavailable" while its last condition sat on
          // the phone. agedIndex recomputes ages on this clock and withholds
          // any verdict past the trusted window; a live list already shown is
          // never replaced.
          const cached = await readIndex();
          if (cached && cached.payload.length > 0) {
            setRivers((current) => current ?? agedIndex(cached, Date.now()));
            if (!riversLive.current) setRiversFromCache(true);
          }
        }),
      fetchGauges(signal)
        .then(setGauges)
        .catch(() => {}),
      // A third enrichment, on the same terms as the other two: the store holds
      // a dam's slug and name, and this supplies what it is doing right now.
      // Failing is fine — the row still renders from the store.
      getSharedDams()
        .then(setDams)
        .catch(() => {}),
    ]);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  // Shared with every other surface; this screen initiates like the others and
  // pays nothing extra when the Today tab has already filled the cache.
  const { updates: eddyUpdates, refresh: refreshEddyUpdates } = useEddyUpdates();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // The prose one always reaches the server, and never clears what is on
    // screen on its way — a failed pull on a dead connection leaves the lines
    // exactly as they were. See clauses 3 and 4 in useEddyUpdates.ts.
    await Promise.all([load(), refreshEddyUpdates()]);
    setRefreshing(false);
  }, [load, refreshEddyUpdates]);

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
            <Text style={[styles.title, { color: colors.text }]}>Favorites</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              {starred.length === 0
                ? 'Favorites are saved on this device'
                : favoritesSummary}
            </Text>

            {/* The offline marker for cached conditions — see riversFromCache.
                One line under the summary rather than a badge per card: every
                river card below draws from the same stored index, so they are
                all offline together or none are, and each card already prints
                its own "Updated N hours ago" from the aged reading. The same
                sentence the Today tab uses for the same state, so the two tabs
                do not describe one condition of the phone two ways. */}
            {riversFromCache ? (
              <View style={styles.offlineRow}>
                <Ionicons name="cloud-offline-outline" size={14} color={colors.textMuted} />
                <Text style={[styles.offlineText, { color: colors.textMuted }]}>
                  Offline — showing the last conditions Eddy saw. Pull down to retry.
                </Text>
              </View>
            ) : null}

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
      // From the gauge list this screen already fetches — no request of its
      // own. Null when the river has no gauge, when none of its gauges rates
      // IT, or simply when /api/gauges has not landed; all three are ordinary
      // and the card renders without the track or the station name.
      const rated = gaugeForRiver(gauges, river.id);
      return (
        <FavoriteRiverCard
          river={river}
          thresholds={rated?.link ?? null}
          // WHICH STATION THE NUMBER CAME FROM. See the card.
          gaugeName={rated?.gauge.name ?? null}
          says={selectEddySays(eddyUpdates?.[item.slug])}
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
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  title: { ...t['3xl'], fontFamily: fonts.display },
  subtitle: { ...t.sm, fontFamily: fonts.body, marginTop: 4 },
  // The glyph and its sentence on one line, in the caption size: a marker,
  // not a banner. `flex: 1` on the text so a wrap happens under itself rather
  // than pushing the icon to a second line.
  offlineRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  offlineText: { ...t.xs, fontFamily: fonts.body, flex: 1 },
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
