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
// ── Three scopes, because they are three different questions ────────────────
// The tab searches rivers, gauges and access points, and a segmented control
// picks which. That is not a tidier arrangement of one list — it is the only
// arrangement in which the filters can be honest.
//
// This screen used to append gauges under a heading below the rivers, with a
// standing note that the chips deliberately did NOT narrow them: every chip is
// a question about rivers ("Floatable now"), and their counts are river counts,
// so applying them to a second kind of thing would have made those numbers
// describe one set while filtering another. That was the right call and it left
// gauges as second-class rows nothing could narrow.
//
// With a scope, each kind gets the filters that mean something for it. Rivers
// keep the condition chips. Gauges get FLOW BANDS — a comparison to a station's
// own history, never a verdict about floating — which could not have shared a
// row with "Floatable now" without implying the two are the same kind of answer.
// See src/theme/flow.ts and GaugeFilterBar for the longer version of why those
// vocabularies stay apart.
//
// ── Gauges now means ALL of them ────────────────────────────────────────────
// It used to mean the ~46 Eddy has rated, matched locally out of /api/gauges.
// Everything else — the ~14,000 national stations the map has drawn since the
// reference layer shipped — was unfindable by name from the one screen called
// Search. /api/search has covered the whole set, curated-first, the entire time;
// this tab simply was not asking it.
//
// So the gauge scope goes through useEddySearch, the same hook the map's field
// uses, which layers local hits (instant, no request) under the server's fuller
// list. A rated station renders as GaugeRow and an unrated one as
// ReferenceGaugeRow — two rows because they speak two vocabularies, not because
// they come from two endpoints.
//
// The river filters are single-select and phrased as questions someone actually
// asks ("what's floatable?", "what am I following?"), not as a taxonomy of every
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
import type { MapGauge, RiverListItem, SearchResult } from '@eddy/types';
import { hasCoordinates } from '@eddy/types';
import { FLOW_BAND_ORDER, flowBand, type FlowBand } from '@eddy/conditions/flow-band';
import { ApiError, fetchGauges, fetchRivers } from '@/api/client';
import { floatableRank, isFloatableNow } from '@/theme/conditions';
import { flowBandColor, flowBandLabel } from '@/theme/flow';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { EddySymbol } from '@/components/EddySymbol';
import { RiverRow } from '@/components/RiverRow';
import { GaugeRow } from '@/components/GaugeRow';
import { ReferenceGaugeRow } from '@/components/ReferenceGaugeRow';
import { ScopeSwitch, type ScopeOption } from '@/components/ScopeSwitch';
import { SearchBar } from '@/components/SearchBar';
import { FilterChips, type FilterChip } from '@/components/FilterChips';
import { useEddySearch } from '@/hooks/useEddySearch';
import { useStarredRivers } from '@/hooks/useStarredRivers';
import { milesBetween, useLocation, type Coords } from '@/hooks/useLocation';
import { gaugeLink } from '@/lib/gaugeCondition';
import { rememberGauge, seedFromSearchResult } from '@/lib/gaugeSeed';
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
 * Same floor the map's search and the server both use, so nothing behaves
 * differently depending on which half answered.
 */
const MIN_GAUGE_QUERY = 2;

const FILTER_LABELS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All rivers' },
  { key: 'floatable', label: 'Floatable now' },
  { key: 'starred', label: 'Following' },
  { key: 'low', label: 'Low water' },
  { key: 'high', label: 'High water' },
];

/** Which kind of thing the field is searching. Exactly one at a time. */
type ScopeKey = 'rivers' | 'gauges' | 'access';

const SCOPES: ScopeOption<ScopeKey>[] = [
  { key: 'rivers', label: 'Rivers' },
  { key: 'gauges', label: 'Gauges' },
  { key: 'access', label: 'Access' },
];

/**
 * The gauge scope's filters.
 *
 * 'all' and 'starred' are questions about the SET; the five bands are a scale.
 * Both live in one single-select row, which is honest here in a way it would not
 * be in the river strip — the bands are mutually exclusive answers to "how does
 * this station compare to its own history", and Following is a different cut of
 * the same list rather than a sixth band.
 *
 * The vocabulary is FLOW_BAND_ORDER, not the condition ladder, and that is the
 * whole reason this scope exists as a scope. Eddy grades ~46 stations; the rest
 * get a comparison and never a verdict.
 */
type GaugeFilterKey = 'all' | 'starred' | FlowBand;

/**
 * One row of the list.
 *
 * A tagged union rather than several lists stacked in a ScrollView: the river
 * scope carries every river in the state, and this stays a FlatList.
 */
type SearchRow =
  | { kind: 'river'; key: string; river: RiverListItem }
  | { kind: 'gauge'; key: string; gauge: MapGauge; result: SearchResult }
  | { kind: 'refgauge'; key: string; result: SearchResult }
  | { kind: 'access'; key: string; result: SearchResult };

export default function ReportsScreen() {
  const [rivers, setRivers] = useState<RiverListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [scope, setScope] = useState<ScopeKey>('rivers');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [gaugeFilter, setGaugeFilter] = useState<GaugeFilterKey>('all');
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

  /**
   * The server search, for the two scopes that need it.
   *
   * The SAME hook the map's field runs on, so the two fields cannot find
   * different things — which was the state this screen was in until now: the map
   * has searched all ~14,300 stations and every access point since /api/search
   * shipped, and the tab actually named Search matched ~46 gauges out of local
   * memory and no access points at all.
   *
   * It is fed the local lists too, so a rated station appears on the keystroke
   * and the national tier fills in behind it. `rivers` is passed as null: the
   * river scope below does its own local matching with its own filters and
   * sorts, and duplicating those rows into this hook's output would put an
   * unsorted, unfiltered copy of the river list under the gauge scope.
   */
  const search = useEddySearch({ rivers: null, gauges });

  // THE HOOK OWNS THE FIELD, rather than this screen holding a second copy and
  // mirroring it in. One string, so switching scope with a word already typed
  // shows that word's results in the new scope instead of an empty list — and
  // so nothing can render the river list against one query while the gauge
  // scope is still answering an older one.
  const { query, setQuery } = search;

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
   * The gauge results, split by tier.
   *
   * `curatedById` is the local /api/gauges list keyed by station id, so a rated
   * hit can be rendered with its LADDER — GaugeRow grades from the thresholds
   * that only that endpoint carries, and a search result has none. A hit with no
   * local match is a reference station and renders in the band vocabulary.
   *
   * The tier flag is the server's `curated`, not "did we find it locally". Those
   * agree today and would diverge the moment /api/gauges is narrowed again, and
   * the wrong one of the two would silently start grading national stations
   * against ladders they do not have.
   */
  const curatedById = useMemo(
    () => new Map((gauges ?? []).map((gauge) => [gauge.id, gauge])),
    [gauges],
  );

  const gaugeResults = useMemo(
    () => search.results.filter((r) => r.kind === 'gauge'),
    [search.results],
  );

  /**
   * Those results, narrowed by the band chips.
   *
   * A rated station has no percentile on the wire — /api/gauges answers with the
   * ladder instead — so it lands in the null band and is kept by 'all' and by
   * 'starred' and by no band chip. That is correct rather than a gap: a band is
   * a claim about where a reading sits in ITS OWN history, and we do not hold
   * that history for the curated tier through this endpoint.
   */
  const visibleGauges = useMemo(() => {
    if (gaugeFilter === 'all') return gaugeResults;
    if (gaugeFilter === 'starred') {
      return gaugeResults.filter((r) => isStarred('gauge', r.id));
    }
    return gaugeResults.filter((r) => flowBand(r.gauge?.flowPercentile) === gaugeFilter);
  }, [gaugeResults, gaugeFilter, isStarred]);

  const accessResults = useMemo(
    () => search.results.filter((r) => r.kind === 'access_point'),
    [search.results],
  );

  const rows = useMemo<SearchRow[]>(() => {
    if (scope === 'rivers') {
      return visible.map((river) => ({
        kind: 'river' as const,
        key: `river:${river.id}`,
        river,
      }));
    }

    if (scope === 'gauges') {
      return visibleGauges.map((result) => {
        const local = curatedById.get(result.id);
        return result.gauge?.curated && local
          ? { kind: 'gauge' as const, key: `gauge:${result.id}`, gauge: local, result }
          : { kind: 'refgauge' as const, key: `refgauge:${result.id}`, result };
      });
    }

    return accessResults.map((result) => ({
      kind: 'access' as const,
      key: `access:${result.id}`,
      result,
    }));
  }, [scope, visible, visibleGauges, curatedById, accessResults]);

  /**
   * Counts for the band chips, off the UNFILTERED gauge results.
   *
   * Same rule the river chips follow: a count computed off the filtered set
   * would read 0 on every chip but the live one, which tells nobody anything.
   */
  const gaugeChips: FilterChip[] = useMemo(
    () => [
      { key: 'all', label: 'All gauges', count: gaugeResults.length },
      {
        key: 'starred',
        label: 'Following',
        count: gaugeResults.filter((r) => isStarred('gauge', r.id)).length,
      },
      ...FLOW_BAND_ORDER.map((band) => ({
        key: band,
        label: flowBandLabel(band),
        // The chip wears its own band colour when live — a legend and a control
        // in one object, the same thing the map's layer chips do.
        activeColor: flowBandColor(band),
        count: gaugeResults.filter((r) => flowBand(r.gauge?.flowPercentile) === band).length,
      })),
    ],
    [gaugeResults, isStarred],
  );

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

  const riverScope = scope === 'rivers';
  const filtering =
    query.trim().length > 0 || (riverScope ? filter !== 'all' : gaugeFilter !== 'all');
  const shortQuery = query.trim().length < MIN_GAUGE_QUERY;

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
          // Names the live scope rather than listing all three. A field that
          // says "rivers and gauges" while a switch above it says Gauges is two
          // controls disagreeing about what is about to happen.
          placeholder={
            riverScope
              ? 'Search rivers'
              : scope === 'gauges'
                ? 'Search gauges by name or site id'
                : 'Search access points'
          }
          // Rated gauges are matched locally so they land on the keystroke, and
          // the list has to exist before the first one — the same reason the
          // map's field warms it on focus.
          onFocus={ensureGauges}
          trailing={
            // Inside the field rather than as a sixth filter chip: this changes
            // the ORDER, and the chips all change which rivers appear. Mixing
            // the two in one row would make "Near me" look mutually exclusive
            // with "Floatable now", which it is not — they compose.
            // Rivers only. Every ordering here is a question about rivers —
            // "most water" compares readings across rated units, "near me"
            // measures to a river's own gauge — and offering them over a list
            // of national stations would be five orderings that do nothing.
            !riverScope ? null : (
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
            )
          }
        />
      </View>

      {/* ── Which kind of thing ──────────────────────────────────
          Above the filters, below the field, because it governs both: the chips
          under it change with it, and so does what the field is asking for. */}
      <ScopeSwitch options={SCOPES} value={scope} onChange={setScope} />

      {/* A menu, not a chip row. Five orderings would double the width of the
          filter strip and read as ten filters; and unlike the filters, only one
          ordering is ever live, which is what a menu says and a chip row does
          not. Collapsed by default — the default order is the right one for
          most visits. */}
      {sortOpen && riverScope ? (
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
      {nearest && riverScope ? (
        <Text style={[styles.sortNote, { color: colors.textSubtle }]}>
          Nearest first, straight-line to each river&apos;s gauge — not drive time.
        </Text>
      ) : riverScope && location.status === 'denied' ? (
        <Text style={[styles.sortNote, { color: colors.textSubtle }]}>
          Location is off for Eddy. Turn it on in Settings to sort by what is closest.
        </Text>
      ) : null}

      {/* ── The filters, per scope ───────────────────────────────
          The whole reason the switch above exists. Rivers are narrowed by a
          floatability VERDICT and gauges by a comparison to their own history,
          and the two vocabularies must never appear in one row implying they
          are the same kind of answer — see src/theme/flow.ts.

          Access points get no strip at all rather than a token one. Every cut
          worth making over them (by type, by river, by public/private) is a
          filter over a set the server returns pre-narrowed to a query, and a
          chip row that could only ever say "All" is a control pretending to be
          a choice. */}
      {riverScope ? (
        <FilterChips
          chips={chips}
          active={[filter]}
          // Single-select: tapping the live chip returns to All rather than
          // leaving the screen with nothing selected and no rivers shown.
          onToggle={(key) => setFilter((prev) => (prev === key ? 'all' : (key as FilterKey)))}
          paddingHorizontal={16}
        />
      ) : scope === 'gauges' ? (
        <FilterChips
          chips={gaugeChips}
          active={[gaugeFilter]}
          onToggle={(key) =>
            setGaugeFilter((prev) => (prev === key ? 'all' : (key as GaugeFilterKey)))
          }
          paddingHorizontal={16}
        />
      ) : null}

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
            {/* A query too short to have been ASKED must not be reported as
                having found nothing — below two characters neither this screen
                nor the server has run a search, and "nothing matches" would be
                a claim about the database. */}
            {!riverScope && shortQuery && !error ? (
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                {scope === 'gauges'
                  ? 'Search every USGS gauge by station name or site id.'
                  : 'Search every access point on Eddy\u2019s rivers by name.'}
              </Text>
            ) : search.searching && !riverScope ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                {error ??
                  (filtering
                    ? 'Nothing matches that. Try another name, or clear the filter.'
                    : riverScope
                      ? 'No rivers found'
                      : 'Nothing found')}
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => {
          if (item.kind === 'gauge') {
            const gauge = item.gauge;
            // The gauge's own primary association names the river. It no longer
            // decides whether the row goes anywhere: every gauge has a screen
            // now, so a station that rates nothing is still a destination
            // rather than the dead row this used to render.
            const link = gaugeLink(gauge);
            return (
              <GaugeRow
                name={gauge.name}
                riverName={link?.riverName ?? null}
                gauge={gauge}
                starred={isStarred('gauge', gauge.id)}
                onPress={
                  gauge.usgsSiteId
                    ? () => {
                        rememberGauge(seedFromSearchResult(item.result));
                        router.push(`/gauge/${encodeURIComponent(gauge.usgsSiteId!)}`);
                      }
                    : null
                }
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

          if (item.kind === 'refgauge') {
            const result = item.result;
            return (
              <ReferenceGaugeRow
                name={result.name}
                siteId={result.siteId ?? null}
                reading={result.gauge ?? null}
                starred={isStarred('gauge', result.id)}
                onPress={
                  result.siteId
                    ? () => {
                        rememberGauge(seedFromSearchResult(result));
                        router.push(`/gauge/${encodeURIComponent(result.siteId!)}`);
                      }
                    : null
                }
                // A reference gauge is starrable like any other — the store
                // keys on the station id, which this row has. It then appears
                // in Favorites with a live reading, which is the point.
                onToggleStar={() =>
                  toggleStar({
                    kind: 'gauge',
                    entityId: result.id,
                    name: result.name,
                    // It rates no river, so there is no slug. Empty rather than
                    // a guess — the store treats it as "nowhere to tap through".
                    slug: result.riverSlug ?? '',
                    usgsSiteId: result.siteId ?? null,
                  })
                }
              />
            );
          }

          if (item.kind === 'access') {
            const result = item.result;
            const target =
              result.riverSlug && result.accessSlug
                ? `/river/${result.riverSlug}/access/${encodeURIComponent(result.accessSlug)}`
                : null;
            return (
              <Pressable
                onPress={
                  // A result without both halves of its route cannot be opened.
                  // Older deployments of /api/search send no accessSlug, and a
                  // row that navigates nowhere is better than one that 404s.
                  target ? () => router.push(target) : undefined
                }
                disabled={!target}
                style={({ pressed }) => [
                  styles.accessRow,
                  { backgroundColor: colors.card, opacity: pressed && target ? 0.6 : 1 },
                ]}
                accessibilityRole={target ? 'button' : undefined}
                accessibilityLabel={[result.name, result.subtitle].filter(Boolean).join(', ')}
              >
                <EddySymbol name="accessPoint" size={18} />
                <View style={styles.accessBody}>
                  <Text style={[styles.accessName, { color: colors.text }]} numberOfLines={1}>
                    {result.name}
                  </Text>
                  {result.subtitle ? (
                    <Text
                      style={[styles.accessMeta, { color: colors.textMuted }]}
                      numberOfLines={1}
                    >
                      {result.subtitle}
                    </Text>
                  ) : null}
                </View>
                {target ? (
                  <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
                ) : null}
              </Pressable>
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
  accessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 9,
    paddingVertical: 12,
    paddingHorizontal: 13,
    borderRadius: 14,
  },
  accessBody: { flex: 1 },
  accessName: { ...t.sm, fontFamily: fonts.semibold },
  accessMeta: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
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
