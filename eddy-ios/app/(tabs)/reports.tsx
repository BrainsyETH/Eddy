// eddy-ios/app/(tabs)/reports.tsx
// River Reports — the list view: every curated river ranked by how floatable it
// is right now. This is the tab that answers "what can I float today?".
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
// The filters are single-select and phrased as questions someone actually asks
// ("what's floatable?", "what am I following?"), not as a taxonomy of every
// condition code. A picker with seven mutually exclusive states is a database
// query wearing a UI.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RiverListItem } from '@eddy/types';
import { ApiError, fetchRivers } from '@/api/client';
import { floatableRank, isFloatableNow } from '@/theme/conditions';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { RiverRow } from '@/components/RiverRow';
import { SearchBar } from '@/components/SearchBar';
import { FilterChips, type FilterChip } from '@/components/FilterChips';
import { useStarredRivers } from '@/hooks/useStarredRivers';
import { useRouter } from 'expo-router';

type FilterKey = 'all' | 'floatable' | 'starred' | 'low' | 'high';

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
  // this screen wants somewhere to go, not an index.
  const sorted = useMemo(() => {
    if (!rivers) return [];
    return [...rivers].sort((a, b) => {
      const aCode = a.currentCondition?.code ?? 'unknown';
      const bCode = b.currentCondition?.code ?? 'unknown';
      const byRank = floatableRank(aCode) - floatableRank(bCode);
      if (byRank !== 0) return byRank;
      return a.name.localeCompare(b.name);
    });
  }, [rivers]);

  // Uses the strict flowing/good bucket, matching every public floatable count.
  // Computed over ALL rivers, not the filtered view: "4 of 24 floatable" is a
  // fact about Missouri, and it would be nonsense as "4 of 4" under a filter
  // that already selected for it.
  const floatableCount = sorted.filter((r) =>
    isFloatableNow(r.currentCondition?.code ?? 'unknown')
  ).length;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sorted.filter((river) => {
      if (!FILTERS[filter](river, isStarred(river.id))) return false;
      if (!needle) return true;
      // Region and gauge label are matched as well as the name: people search
      // for "Ozark" and for the condition word they can see on the row.
      return (
        river.name.toLowerCase().includes(needle) ||
        (river.region ?? '').toLowerCase().includes(needle) ||
        (river.currentCondition?.label ?? '').toLowerCase().includes(needle)
      );
    });
  }, [sorted, filter, query, isStarred]);

  const chips: FilterChip[] = useMemo(
    () =>
      FILTER_LABELS.map(({ key, label }) => ({
        key,
        label,
        // A count on every chip is what keeps an empty result explainable: a
        // person tapping "Low water" on a chip reading 0 already knows why the
        // list is empty before it renders.
        count: sorted.filter((river) => FILTERS[key](river, isStarred(river.id))).length,
      })),
    [sorted, isStarred],
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
        <Text style={[styles.title, { color: colors.text }]}>River Reports</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          {error ? error : `${floatableCount} of ${sorted.length} rivers floatable right now`}
        </Text>
      </View>

      {/* Header and controls sit OUTSIDE the FlatList rather than in
          ListHeaderComponent. Inside, the search field is unmounted and
          remounted as the list re-renders, which drops the keyboard mid-word. */}
      <View style={styles.searchRow}>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder="Search rivers"
        />
      </View>

      <FilterChips
        chips={chips}
        active={[filter]}
        // Single-select: tapping the live chip returns to All rather than
        // leaving the screen with nothing selected and no rivers shown.
        onToggle={(key) => setFilter((prev) => (prev === key ? 'all' : (key as FilterKey)))}
        paddingHorizontal={16}
      />

      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
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
                  ? 'No rivers match that. Try another name or clear the filter.'
                  : 'No rivers found')}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <RiverRow
            river={item}
            starred={isStarred(item.id)}
            starDisabled={!starsReady}
            onPress={() => router.push(`/river/${item.slug}`)}
            onToggleStar={() =>
              toggleStar({ riverId: item.id, name: item.name, slug: item.slug })
            }
          />
        )}
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
  listContent: { paddingTop: 4, paddingBottom: 16 },
  empty: { padding: 32, alignItems: 'center' },
  emptyText: { ...t.sm, fontFamily: fonts.body, textAlign: 'center' },
});
