// eddy-ios/app/(tabs)/reports.tsx
// Search — the list view: every curated river ranked by how floatable it is
// right now. This is the tab that answers "what can I float today?".
//
// The file keeps its `reports` route name; only the labels say "Search". See
// app/(tabs)/_layout.tsx for why the filename was left alone.
//
// Ordering and the floatable count both come from the canonical condition
// system rather than local logic, so the app's headline number always matches
// the website's. See src/theme/conditions.ts for why the two severity orderings
// must not be conflated.
//
// ── Search and filters ──────────────────────────────────────────────────────
// Both are LOCAL. The whole list is already in memory — it arrives in one
// CDN-cached request — so matching a name here costs nothing and works with no
// signal, which is the state this app is designed around. Nothing on this
// screen should ever wait on a network round trip to filter data it holds.
//
// ── Gauges are searchable here too ──────────────────────────────────────────
// The tab is called Search, and until now it could only find rivers. But a
// gauge is what half the questions are actually about — people know "Van
// Buren" and "07067000" the way they know a river's name, and the map's own
// search field has found gauges since it replaced the river chips. A search
// field that finds fewer things than the one on the next tab is a search field
// people learn not to trust.
//
// The gauges come from the same statewide /api/gauges the map uses, fetched on
// the first keystroke rather than on mount: it is ~40 rows nobody who only ever
// scrolls the river list should pay for. They are matched locally like
// everything else, and they render as GaugeRow — the same row Favorites uses,
// so a gauge cannot read one way here and another there.
//
// THE CHIPS DO NOT NARROW THEM, deliberately. Every chip is a question about
// rivers ("All rivers", "Floatable now"), and their counts are river counts
// computed off the whole list rather than off the query. Silently applying them
// to a second kind of thing would make those numbers describe one set while
// filtering another. Gauges sit under their own heading instead, which says
// what they are and what narrowed them.
//
// The filters are single-select and phrased as questions someone actually asks
// ("what's floatable?", "what am I following?"), not as a taxonomy of every
// condition code. A picker with seven mutually exclusive states is a database
// query wearing a UI.
//
// ── "Near me" measures to the river's GAUGE ─────────────────────────────────
// /api/rivers carries no coordinate — a river is a line, and the list endpoint
// has never needed to say where that line is. Rather than change a CDN-cached
// endpoint the website depends on, distance is measured to the river's primary
// gauge, which is by definition a point ON the river. It is a proxy, and the UI
// says so: "≈" and "to its gauge", never a drive time. A river with no gauge
// sorts last rather than pretending to a distance of zero.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import type { MapGauge, RiverListItem } from '@eddy/types';
import { hasCoordinates } from '@eddy/types';
import { ApiError, fetchGauges, fetchRivers } from '@/api/client';
import { floatableRank, isFloatableNow } from '@/theme/conditions';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { RiverRow } from '@/components/RiverRow';
import { GaugeRow } from '@/components/GaugeRow';
import { SearchBar } from '@/components/SearchBar';
import { FilterChips, type FilterChip } from '@/components/FilterChips';
import { useStarredRivers } from '@/hooks/useStarredRivers';
import { milesBetween, useLocation, type Coords } from '@/hooks/useLocation';
import { gaugeLink } from '@/lib/gaugeCondition';
import { primaryReading } from '@/lib/readingCopy';
import { useRouter } from 'expo-router';

type FilterKey = 'all' | 'floatable' | 'starred' | 'low' | 'high';

/**
 * How the list is ordered.
 *
 * SEPARATE FROM THE FILTERS, and deliberately so: a filter answers "which
 * rivers", a sort answers "in what order", and folding them into one chip row
 * would make picking an order silently drop rivers.
 *
 * 'nearest' lives here rather than staying a lone toggle in the search field
 * because it was always an ordering — it replaced the ranking outright — and
 * having one ordering hidden behind a navigate icon while the others sat in a
 * menu is two controls for one decision.
 */
type SortKey = 'condition' | 'reading' | 'updated' | 'name' | 'nearest';

const SORT_LABELS: { key: SortKey; label: string }[] = [
  { key: 'condition', label: 'Floatable first' },
  { key: 'reading', label: 'Most water' },
  { key: 'updated', label: 'Recently updated' },
  { key: 'name', label: 'Name' },
  { key: 'nearest', label: 'Near me' },
];

/**
 * Which rivers a filter keeps.
 *
 * `floatable` uses the strict flowing/good bucket, the same one behind every
 * public floatable count — deliberately NARROWER than "conditions someone
 * experienced could paddle", which would include high water. A chip that says
 * "Floatable" and includes a river in flood is a chip that gets somebody hurt.
 *
 * `low` folds too_low in with low, and `high` folds dangerous in with high,
 * because the question behind each chip is "is there enough water" and "is
 * there too much" — not which of two adjacent codes the gauge landed on.
 */
const FILTERS: Record<FilterKey, (river: RiverListItem, starred: boolean) => boolean> = {
  all: () => true,
  floatable: (river) => isFloatableNow(river.currentCondition?.code ?? 'unknown'),
  starred: (_river, starred) => starred,
  low: (river) => {
    const code = river.currentCondition?.code ?? 'unknown';
    return code === 'low' || code === 'too_low';
  },
  high: (river) => {
    const code = river.currentCondition?.code ?? 'unknown';
    return code === 'high' || code === 'dangerous';
  },
};

/**
 * Below this a query matches most of the network, which is not a search result.
 * Same floor the map's search uses, so the two fields behave alike.
 */
const MIN_GAUGE_QUERY = 2;

/**
 * One row of the list, which now holds two kinds of thing plus the heading
 * between them.
 *
 * A tagged union rather than two lists stacked in a ScrollView: this screen
 * carries every river in the state, and it stays a FlatList.
 */
type SearchRow =
  | { kind: 'river'; key: string; river: RiverListItem }
  | { kind: 'heading'; key: string; label: string }
  | { kind: 'gauge'; key: string; gauge: MapGauge };

const FILTER_LABELS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All rivers' },
  { key: 'floatable', label: 'Floatable now' },
  { key: 'starred', label: 'Following' },
  { key: 'low', label: 'Low water' },
  { key: 'high', label: 'High water' },
];

export default function ReportsScreen() {
  const [rivers, setRivers] = useState<RiverListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sort, setSort] = useState<SortKey>('condition');
  const [sortOpen, setSortOpen] = useState(false);
  const nearest = sort === 'nearest';
  const [gauges, setGauges] = useState<MapGauge[] | null>(null);
  const location = useLocation();
  const { isStarred, toggleStar, ready: starsReady } = useStarredRivers();
  const { colors } = useTheme();
  const router = useRouter();

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setError(null);
      setRivers(await fetchRivers(signal));
    } catch (err) {
      if (err instanceof ApiError && err.message === 'Request cancelled') return;
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  }, []);

  /**
   * The statewide gauge list, fetched at most once per visit to this screen.
   *
   * Two things want it — searching by station name and sorting by distance —
   * and neither happens on mount, so the request is paid for by whichever asks
   * first. The PROMISE is held rather than a boolean, so the sort path can
   * await the fetch the search field started instead of firing a second one.
   *
   * Never rejects: a failed enrichment is "no gauges to search", not an error
   * banner over a perfectly good river list.
   */
  const gaugesPromise = useRef<Promise<MapGauge[]> | null>(null);
  const ensureGauges = useCallback(() => {
    if (!gaugesPromise.current) {
      gaugesPromise.current = fetchGauges()
        .then((list) => {
          setGauges(list);
          return list;
        })
        .catch(() => {
          setGauges([]);
          return [] as MapGauge[];
        });
    }
    return gaugesPromise.current;
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
  // this screen wants somewhere to go, not an index — so this stays the
  // default, and every other ordering is something the user asked for.
  const sorted = useMemo(() => {
    if (!rivers) return [];
    const byName = (a: RiverListItem, b: RiverListItem) => a.name.localeCompare(b.name);

    if (sort === 'name') return [...rivers].sort(byName);

    if (sort === 'updated') {
      // Freshest first. A river with no reading at all has no age to compare,
      // so it sorts last rather than pretending to be infinitely stale.
      return [...rivers].sort((a, b) => {
        const aAge = a.currentCondition?.readingAgeHours ?? Infinity;
        const bAge = b.currentCondition?.readingAgeHours ?? Infinity;
        return aAge === bAge ? byName(a, b) : aAge - bAge;
      });
    }

    if (sort === 'reading') {
      // GROUPED BY UNIT, because 944 cfs and 3.4 ft are not comparable numbers
      // and a list that interleaves them is sorted by nothing at all. Feet
      // first, then cfs, each descending — "most water" is the question behind
      // sorting by a reading. Rivers with no reading in their rated unit sort
      // last; primaryReading already refuses to substitute the other one.
      const rank = (r: RiverListItem) => {
        const reading = r.currentCondition ? primaryReading(r.currentCondition) : null;
        if (!reading) return 2;
        return reading.unit === 'ft' ? 0 : 1;
      };
      return [...rivers].sort((a, b) => {
        const byUnit = rank(a) - rank(b);
        if (byUnit !== 0) return byUnit;
        const av = a.currentCondition ? primaryReading(a.currentCondition)?.value : null;
        const bv = b.currentCondition ? primaryReading(b.currentCondition)?.value : null;
        if (av == null || bv == null) return byName(a, b);
        return bv - av;
      });
    }

    return [...rivers].sort((a, b) => {
      const aCode = a.currentCondition?.code ?? 'unknown';
      const bCode = b.currentCondition?.code ?? 'unknown';
      const byRank = floatableRank(aCode) - floatableRank(bCode);
      if (byRank !== 0) return byRank;
      return byName(a, b);
    });
  }, [rivers, sort]);

  // Gauge coordinates, keyed by the river each one is primary for. One flat
  // request, fetched only when someone actually taps Near me.
  const distanceByRiver = useMemo(() => {
    if (!nearest || !location.coords || !gauges) return null;
    const here = location.coords as Coords;
    const map = new Map<string, number>();
    for (const gauge of gauges) {
      if (!hasCoordinates(gauge)) continue;
      const miles = milesBetween(here, gauge.coordinates);
      for (const link of gauge.thresholds ?? []) {
        // Primary wins; a secondary association only fills a gap. A gauge two
        // rivers share should measure the river it actually rates.
        const existing = map.get(link.riverId);
        if (existing == null || (link.isPrimary && miles < existing)) {
          map.set(link.riverId, miles);
        }
      }
    }
    return map;
  }, [nearest, location.coords, gauges]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matched = sorted.filter((river) => {
      if (!FILTERS[filter](river, isStarred('river', river.id))) return false;
      if (!needle) return true;
      // Region and gauge label are matched as well as the name: people search
      // for "Ozark" and for the condition word they can see on the row.
      return (
        river.name.toLowerCase().includes(needle) ||
        (river.region ?? '').toLowerCase().includes(needle) ||
        (river.currentCondition?.label ?? '').toLowerCase().includes(needle)
      );
    });

    // Nearest-first REPLACES the condition ranking rather than tie-breaking it.
    // Someone who asked "what is closest" has changed the question, and burying
    // the river twenty minutes away under four floatable ones two hours off
    // would be answering the old one.
    if (!distanceByRiver) return matched;
    return [...matched].sort(
      (a, b) =>
        (distanceByRiver.get(a.id) ?? Infinity) - (distanceByRiver.get(b.id) ?? Infinity),
    );
  }, [sorted, filter, query, isStarred, distanceByRiver]);

  /**
   * Gauges matching what is in the field.
   *
   * Name OR site id: "Van Buren" is how a person searches and "07067000" is
   * what is printed on a bookmark, a USGS page and half the forum posts about
   * a river. Rated stations lead — those are the ones carrying a condition
   * Eddy stands behind, and the rest are reference — and the tie-break is the
   * name so the order is stable between keystrokes.
   *
   * The site id is COALESCED before matching because it is nullable on the
   * wire — a station whose provider gives it neither a USGS number nor an
   * external id has none — and this ran on every keystroke, so reading through
   * that null took the whole tab down with it rather than missing one match.
   */
  const gaugeMatches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length < MIN_GAUGE_QUERY || !gauges) return [];
    return gauges
      .filter(
        (gauge) =>
          gauge.name.toLowerCase().includes(needle) ||
          (gauge.usgsSiteId ?? '').toLowerCase().includes(needle),
      )
      .sort((a, b) => {
        const rank = (g: MapGauge) => (g.thresholds?.length ? 0 : 1);
        return rank(a) - rank(b) || a.name.localeCompare(b.name);
      });
  }, [query, gauges]);

  // Rivers, then the gauges, under a heading that says what narrowed them.
  const rows = useMemo<SearchRow[]>(() => {
    const out: SearchRow[] = visible.map((river) => ({
      kind: 'river',
      key: `river:${river.id}`,
      river,
    }));
    if (gaugeMatches.length > 0) {
      out.push({
        kind: 'heading',
        key: 'heading:gauges',
        label: `${gaugeMatches.length} ${gaugeMatches.length === 1 ? 'gauge' : 'gauges'} matching “${query.trim()}”`,
      });
      for (const gauge of gaugeMatches) {
        out.push({ kind: 'gauge', key: `gauge:${gauge.id}`, gauge });
      }
    }
    return out;
  }, [visible, gaugeMatches, query]);

  const chips: FilterChip[] = useMemo(
    () =>
      FILTER_LABELS.map(({ key, label }) => ({
        key,
        label,
        // A count on every chip is what keeps an empty result explainable: a
        // person tapping "Low water" on a chip reading 0 already knows why the
        // list is empty before it renders.
        count: sorted.filter((river) => FILTERS[key](river, isStarred('river', river.id))).length,
      })),
    [sorted, isStarred],
  );

  // Two things have to arrive before this list can be sorted: permission, and
  // the gauge coordinates to measure against. Both are fetched here, on the
  // tap, and never on mount — see useLocation for why the prompt is never spent
  // on launch, and /api/gauges is a request nobody who ignores this chip should
  // pay for.
  const onPickSort = useCallback(
    async (key: SortKey) => {
      setSortOpen(false);
      if (key !== 'nearest') {
        setSort(key);
        return;
      }
      if (nearest) return;
      const [coords] = await Promise.all([location.request(), ensureGauges()]);
      // Only commit to the ordering if a position actually arrived. Selecting
      // "Near me" and then being shown an unchanged list with no explanation is
      // worse than the selection not sticking.
      if (coords) setSort('nearest');
    },
    [nearest, location, ensureGauges],
  );

  if (!rivers && !error) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.bg }]} edges={['top']}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  const filtering = query.trim().length > 0 || filter !== 'all';

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Search</Text>
        {/* ERROR ONLY. This slot used to fall back to "N of 24 rivers floatable
            right now", which is a fact the "Floatable now" chip already carries
            with its own count. What the slot cannot lose is the error: a failed
            pull-to-refresh leaves the stale list on screen, so ListEmptyComponent
            never renders and this is the only thing that says the refresh
            failed. Collapses to nothing when there is no error. */}
        {error ? (
          <Text style={[styles.subtitle, { color: colors.error }]}>{error}</Text>
        ) : null}
      </View>

      {/* Header and controls sit OUTSIDE the FlatList rather than in
          ListHeaderComponent. Inside, the search field is unmounted and
          remounted as the list re-renders, which drops the keyboard mid-word. */}
      <View style={styles.searchRow}>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder="Search rivers and gauges"
          // Gauges are matched locally, so the list has to exist before the
          // first keystroke rather than after it — the same reason the map's
          // field warms it on focus.
          onFocus={ensureGauges}
          trailing={
            // Inside the field rather than as a sixth filter chip: this changes
            // the ORDER, and the chips all change which rivers appear. Mixing
            // the two in one row would make "Near me" look mutually exclusive
            // with "Floatable now", which it is not — they compose.
            <Pressable
              onPress={() => setSortOpen((open) => !open)}
              disabled={location.status === 'locating'}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityState={{ expanded: sortOpen }}
              accessibilityLabel={`Sort: ${SORT_LABELS.find((s) => s.key === sort)?.label}`}
            >
              {location.status === 'locating' ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Ionicons
                  name={sort === 'nearest' ? 'navigate' : 'swap-vertical-outline'}
                  size={17}
                  color={sort === 'condition' ? colors.textMuted : colors.accent}
                />
              )}
            </Pressable>
          }
        />
      </View>

      {/* A menu, not a chip row. Five orderings would double the width of the
          filter strip and read as ten filters; and unlike the filters, only one
          ordering is ever live, which is what a menu says and a chip row does
          not. Collapsed by default — the default order is the right one for
          most visits. */}
      {sortOpen ? (
        <View style={[styles.sortMenu, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {SORT_LABELS.map(({ key, label }) => {
            const on = sort === key;
            return (
              <Pressable
                key={key}
                onPress={() => void onPickSort(key)}
                style={({ pressed }) => [styles.sortItem, { opacity: pressed ? 0.6 : 1 }]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.sortItemText, { color: on ? colors.accent : colors.text }]}>
                  {label}
                </Text>
                {on ? <Ionicons name="checkmark" size={16} color={colors.accent} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {/* Stated once, above the list, rather than repeated on every row. The
          proxy is worth admitting exactly as loudly as it deserves. */}
      {nearest ? (
        <Text style={[styles.sortNote, { color: colors.textSubtle }]}>
          Nearest first, straight-line to each river&apos;s gauge — not drive time.
        </Text>
      ) : location.status === 'denied' ? (
        <Text style={[styles.sortNote, { color: colors.textSubtle }]}>
          Location is off for Eddy. Turn it on in Settings to sort by what is closest.
        </Text>
      ) : null}

      <FilterChips
        chips={chips}
        active={[filter]}
        // Single-select: tapping the live chip returns to All rather than
        // leaving the screen with nothing selected and no rivers shown.
        onToggle={(key) => setFilter((prev) => (prev === key ? 'all' : (key as FilterKey)))}
        paddingHorizontal={16}
      />

      <FlatList
        data={rows}
        keyExtractor={(item) => item.key}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              {error ??
                (filtering
                  ? 'Nothing matches that. Try another name, a gauge, or clear the filter.'
                  : 'No rivers found')}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          if (item.kind === 'heading') {
            return (
              <Text style={[styles.rowsHeading, { color: colors.textSubtle }]}>{item.label}</Text>
            );
          }

          if (item.kind === 'gauge') {
            const gauge = item.gauge;
            // The gauge's own primary association names the river, which is
            // also the only river it can honestly tap through to — a station
            // that rates nothing has nowhere to go, and GaugeRow renders a
            // dead row rather than a dead tap.
            const link = gaugeLink(gauge);
            return (
              <GaugeRow
                name={gauge.name}
                riverName={link?.riverName ?? null}
                gauge={gauge}
                starred={isStarred('gauge', gauge.id)}
                onPress={link?.riverSlug ? () => router.push(`/river/${link.riverSlug}`) : null}
                onToggleStar={() =>
                  toggleStar({
                    kind: 'gauge',
                    entityId: gauge.id,
                    name: gauge.name,
                    slug: link?.riverSlug ?? '',
                    usgsSiteId: gauge.usgsSiteId,
                  })
                }
              />
            );
          }

          const river = item.river;
          return (
            <RiverRow
              river={river}
              starred={isStarred('river', river.id)}
              starDisabled={!starsReady}
              distanceMiles={distanceByRiver?.get(river.id) ?? null}
              // This is the tab people come to to read gauges, so the row shows
              // every number the station published rather than only the rated
              // one. Favorites keeps the single-number row.
              showGauge
              onPress={() => router.push(`/river/${river.slug}`)}
              onToggleStar={() =>
                toggleStar({ kind: 'river', entityId: river.id, name: river.name, slug: river.slug })
              }
            />
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: { paddingHorizontal: 20, paddingTop: 12 },
  // Fredoka, the brand display face. It previously appeared nowhere in the
  // product — only inside the paywall — so the app looked generic on every
  // screen a user actually spends time on.
  title: { ...t['3xl'], fontFamily: fonts.display },
  subtitle: { ...t.sm, fontFamily: fonts.body, marginTop: 4 },
  searchRow: { paddingHorizontal: 16, paddingTop: 12 },
  sortMenu: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  sortItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    // 44 is the touch-target floor and is not negotiable.
    minHeight: 44,
  },
  sortItemText: { ...t.sm, fontFamily: fonts.medium },
  sortNote: { ...t.xs, fontFamily: fonts.body, paddingHorizontal: 20, paddingTop: 8 },
  listContent: { paddingTop: 4, paddingBottom: 16 },
  // Aligned with the row cards below it (16pt margin + 4pt of optical inset),
  // so the heading reads as the label on the group rather than as a stray line.
  rowsHeading: {
    ...t.xs,
    fontFamily: fonts.heading,
    letterSpacing: 0.4,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 8,
  },
  empty: { padding: 32, alignItems: 'center' },
  emptyText: { ...t.sm, fontFamily: fonts.body, textAlign: 'center' },
});
