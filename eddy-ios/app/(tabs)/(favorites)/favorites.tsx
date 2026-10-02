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
import { ActionSheetIOS, Platform, Alert, AccessibilityInfo, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LazyTabScreen } from '@/components/LazyTabScreen';
import { ControlIcon } from '@/components/ControlIcon';
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
import { useAlertRules } from '@/hooks/useAlertRules';
import { gaugeSharePath, shareLink } from '@/lib/share';
import { favoriteAlerts } from '@/lib/favoriteAlerts';
import { checkedTimeAgo } from '@/lib/alertFreshness';
import { useStarredRivers } from '@/hooks/useStarredRivers';
import { useEddyUpdates } from '@/hooks/useEddyUpdates';
import { selectEddySays } from '@/lib/eddySays';
import { useSavedFloats } from '@/hooks/useSavedFloats';
import { useRouter, useFocusEffect } from 'expo-router';
import { agedIndex, envelope, effectiveReadingAgeHours, type CacheEnvelope } from '@/lib/offline-cache';
import { onForeground } from '@/lib/foreground';
import { createLatestRequest } from '@/lib/latestRequest';

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
  const { starred, removeStar, ready } = useStarredRivers();
  const { rules } = useAlertRules();
  const [removed, setRemoved] = useState<{ name: string; undo: () => void } | null>(null);
  useEffect(() => {
    if (!removed) return;
    // Leave Undo available for VoiceOver rather than racing its announcement.
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    void AccessibilityInfo.isScreenReaderEnabled().then(enabled => {
      if (!cancelled && !enabled) timer = setTimeout(() => setRemoved(null), 8000);
    });
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [removed]);
  const removeFavorite = (item: (typeof starred)[number]) => {
    const undo = removeStar(item);
    if (undo) {
      setRemoved({ name: item.name, undo });
      AccessibilityInfo.announceForAccessibility(`Removed ${item.name}. Undo available at the top of Favorites.`);
    }
  };
  const { floats: savedFloats } = useSavedFloats();
  const { colors, elevation } = useTheme();
  const router = useRouter();

  const [riverSnapshot, setRiverSnapshot] = useState<CacheEnvelope<RiverListItem[]> | null>(null);
  const [gaugeSnapshot, setGaugeSnapshot] = useState<CacheEnvelope<MapGauge[]> | null>(null);
  const [now, setNow] = useState(Date.now);
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const [damsCheckedAt, setDamsCheckedAt] = useState<number | null>(null);
  const requests = useRef(createLatestRequest());
  const lastAttempt = useRef(0);
  const rivers = useMemo(() => riverSnapshot ? agedIndex(riverSnapshot, now) : null, [riverSnapshot, now]);
  const gauges = useMemo(() => gaugeSnapshot?.payload.map((gauge) => ({
    ...gauge,
    readingAgeHours: effectiveReadingAgeHours(gauge.readingAgeHours, gaugeSnapshot.fetchedAt, now),
  })) ?? null, [gaugeSnapshot, now]);
  // Retain useful dam rows after a failed refresh; report the failed source
  // separately instead of replacing its conditions with an empty snapshot.
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
        if (request.isCurrent()) { setDams(live); setDamsCheckedAt(Date.now()); }
        return false;
      }).catch(() => true),
    ]);
    if (request.isCurrent()) {
      setFailedSources(['rivers', 'gauges', 'dams'].filter((_, index) => failures[index]));
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
      <View style={styles.listArea}>
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
            <Text style={[styles.title, { color: colors.text }]}>Favorites</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              {starred.length === 0
                ? 'Favorites are saved on this device'
                : favoritesSummary}
            </Text>

            {failedSources.length > 0 || riversFromCache ? (
              <View style={styles.offlineRow}>
                <ControlIcon name="cloud-offline-outline" size={14} color={colors.textMuted} />
                <Text style={[styles.offlineText, { color: colors.textMuted }]}>
                  {failedSources.length ? `Couldn’t update ${failedSources.join(', ')}.` : 'Showing saved conditions.'}
                  {' '}{[
                    riverSnapshot ? `Rivers checked ${checkedTimeAgo(Date.parse(riverSnapshot.fetchedAt), now)}` : null,
                    gaugeSnapshot ? `Gauges checked ${checkedTimeAgo(Date.parse(gaugeSnapshot.fetchedAt), now)}` : null,
                    damsCheckedAt ? `Dams checked ${checkedTimeAgo(damsCheckedAt, now)}` : null,
                  ].filter(Boolean).join(' · ')}
                </Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Retry loading favorite conditions" disabled={refreshing} onPress={() => void onRefresh()} style={styles.smallAction}>
                  <Text style={[t.sm, { color: colors.interactive }]}>{refreshing ? 'Checking…' : 'Retry'}</Text>
                </Pressable>
              </View>
            ) : null}

            {/* Keep saved floats discoverable before the first save. */}
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
              <ControlIcon name="navigate-outline" size={18} color={colors.interactive} />
              <Text style={[styles.floatsText, { color: colors.text }]}>Saved floats</Text>
              <Text style={[styles.floatsCount, { color: colors.textSubtle }]}>
                {savedFloats.length}
              </Text>
              <ControlIcon name="chevron-forward" size={16} color={colors.textSubtle} />
            </Pressable>

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
              <EddyScene name="heart" size={128} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {starred.length > 0 ? 'Nothing of that kind' : 'No favorites yet'}
              </Text>
              <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
                {starred.length > 0
                  ? 'Tap the live chip again to see everything you have saved.'
                  : 'Tap the star on any river, gauge or dam to add it to your favorites. No account needed — favorites are kept on this device and will sync when you sign in.'}
              </Text>
              {starred.length === 0 ? <Pressable accessibilityRole="button" style={styles.smallAction} onPress={() => router.navigate('/')}>
                <Text style={[t.base, { color: colors.interactive }]}>Browse rivers and gauges</Text>
              </Pressable> : null}
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <SwipeRow
            onAction={() => removeFavorite(item)}
            actionLabel="Remove"
            accessibilityActionLabel={`Remove ${item.name} from favorites`}
            bottomInset={item.kind === 'dam' ? 8 : item.kind === 'gauge' ? 9 : 10}
          >
            {favoriteRow(item)}
          </SwipeRow>
        )}
      />
      {removed ? <View pointerEvents="box-none" style={styles.undoOverlay}>
        <View style={[styles.undoBar, { backgroundColor: colors.card, borderColor: colors.border }, elevation(1)]}>
          <Text style={[t.sm, styles.undoText, { color: colors.text }]}>Removed {removed.name}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Undo removing ${removed.name}`} style={styles.smallAction} onPress={() => { removed.undo(); setRemoved(null); }}>
            <Text style={[t.base, { color: colors.interactive }]}>Undo</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss removal message" style={styles.smallAction} onPress={() => setRemoved(null)}>
            <ControlIcon name="close" size={20} color={colors.textMuted} />
          </Pressable>
        </View>
      </View> : null}
      </View>
    </SafeAreaView>
  );

  function actions(item: (typeof starred)[number]) {
    const dam = item.kind === 'dam' ? damById.get(item.entityId) : null;
    const rated = item.kind === 'river' ? gaugeForRiver(gauges, item.entityId) : null;
    const siteId = item.kind === 'dam' ? dam?.tailwater?.gaugeSiteId : item.kind === 'gauge' ? item.usgsSiteId : rated?.gauge.usgsSiteId;
    const gauge = item.kind === 'gauge' ? gaugeById.get(item.entityId) : null;
    const sharePath = item.kind === 'river' ? byId.get(item.entityId)?.path
      : item.kind === 'dam' ? `/dams/${encodeURIComponent(item.entityId)}`
      : gaugeSharePath(gauge?.provider ?? item.provider, siteId);
    const { matches, active } = favoriteAlerts(rules ?? [], item.kind, item.entityId, siteId);
    const open = () => {
      if (item.kind === 'dam') router.push(`/dam/${item.entityId}`);
      else if (item.kind === 'river') router.push(`/river/${item.slug}`);
      else if (siteId) {
        rememberGauge(gaugeById.get(item.entityId) ? seedFromMapGauge(gaugeById.get(item.entityId)!) : seedFromStar(item));
        router.push(`/gauge/${encodeURIComponent(siteId)}`);
      }
    };
    const configure = () => router.push({ pathname: '/alerts/configure', params: item.kind === 'river'
      ? { scope: 'river', riverId: item.entityId, riverSlug: item.slug, riverName: item.name }
      : { scope: 'gauge', siteId: siteId!, gaugeName: item.kind === 'dam' ? `Tailwater below ${item.name}` : item.name, ...(item.kind === 'gauge' ? { gaugeId: item.entityId } : {}) } });
    const manage = () => {
      if (matches.length === 1) router.push({ pathname: '/alerts/[id]', params: { id: matches[0].id, source: matches[0].source } });
      else router.navigate({ pathname: '/alerts', params: { segment: 'rules' } });
    };
    const showMenu = () => {
      const buttons = [
        ...(item.kind !== 'gauge' || siteId ? [{ text: 'Open', onPress: open }] : []),
        ...(item.kind !== 'gauge' && siteId ? [{ text: 'Open gauge', onPress: () => router.push(`/gauge/${encodeURIComponent(siteId)}`) }] : []),
        ...(matches.length ? [{ text: 'Manage alerts', onPress: manage }] : item.kind === 'river' || siteId ? [{ text: 'Create alert', onPress: configure }] : []),
        ...(sharePath ? [{ text: 'Share', onPress: () => { void shareLink(item.name, sharePath); } }] : []),
        { text: 'Remove favorite', style: 'destructive' as const, onPress: () => removeFavorite(item) },
        { text: 'Cancel', style: 'cancel' as const },
      ];
      if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({
        title: item.name, options: buttons.map(button => button.text),
        cancelButtonIndex: buttons.length - 1, destructiveButtonIndex: buttons.length - 2,
      }, index => buttons[index]?.onPress?.());
      else Alert.alert(item.name, undefined, buttons);
    };
    return <Pressable accessibilityRole="button"
      accessibilityLabel={`Actions for ${item.name}${matches.length ? active ? ', active alerts' : ', alerts inactive' : ''}`}
      style={styles.cardActions} onPress={showMenu} onLongPress={showMenu}>
      {matches.length ? <ControlIcon name={active ? 'notifications' : 'notifications-off-outline'} size={16} color={active ? colors.interactive : colors.textMuted} /> : null}
      <ControlIcon name="ellipsis-horizontal" size={22} color={colors.textMuted} />
    </Pressable>;
  }

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
        return <UnavailableFavorite name={item.name} onPress={() => router.push(`/dam/${item.entityId}`)} accessory={actions(item)} />;
      }
      return (
        <DamRow
          dam={dam}
          onPress={() => router.push(`/dam/${dam.id}`)}
          // Favorites supplies its own actions menu in place of the star.
          starred
          accessory={actions(item)}
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
          // Favorites supplies its own actions menu in place of the star.
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
          accessory={actions(item)}
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
          accessory={actions(item)}
        />
      );
    }

    // Store-only fallback: named, tappable, honest about what's missing.
    return <UnavailableFavorite name={item.name} onPress={() => router.push(`/river/${item.slug}`)} accessory={actions(item)} />;
  }
}

function UnavailableFavorite({ name, onPress, accessory }: { name: string; onPress: () => void; accessory: React.ReactNode }) {
  const { colors, elevation } = useTheme();
  return <View style={[styles.row, { backgroundColor: colors.card }, elevation(1)]}>
    <Pressable onPress={onPress} style={styles.rowBody} accessibilityRole="button" accessibilityLabel={`${name} details, conditions unavailable`}>
      <Text style={[styles.riverName, { color: colors.text }]}>{name}</Text>
      <Text style={[styles.riverMeta, { color: colors.textSubtle }]}>Conditions unavailable</Text>
    </Pressable>
    {accessory}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  // Overlay coordinates are relative to content BELOW the top safe-area inset.
  listArea: { flex: 1 },
  undoOverlay: { position: 'absolute', top: 8, left: 12, right: 12, zIndex: 1 },
  cardActions: { minWidth: 44, minHeight: 44, paddingVertical: 6, gap: 2, alignItems: 'center', justifyContent: 'center' },
  smallAction: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  undoBar: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  undoText: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  title: { ...textStyles.pageTitle },
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
