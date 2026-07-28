// eddy-ios/app/alerts/new.tsx
// Step one of creating an alert: what do you want to watch?
//
// Rivers AND gauges in one field, because the answer to "what do I want to be
// told about" is sometimes a river ("the Huzzah") and sometimes a specific
// station ("the gauge at Steelville"), and making people choose a category
// before they have typed anything asks them to know how Eddy is modelled.
//
// Reuses useEddySearch with no local data. That hook layers in-memory rivers
// and gauges under the server's results for the Map tab, which has both loaded
// already; this screen has neither, and fetching ~46 gauges to speed up a search
// somebody reaches once would be a request paid at a put-in for a saving nobody
// notices.

import { useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import type { SearchResult } from '@eddy/types';
import { useEddySearch } from '@/hooks/useEddySearch';
import { useStarredRivers } from '@/hooks/useStarredRivers';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

/** What the configure screen needs to describe and create a rule. */
interface Target {
  key: string;
  scope: 'river' | 'gauge';
  name: string;
  subtitle: string | null;
  params: Record<string, string>;
}

function targetFromResult(result: SearchResult): Target | null {
  if (result.kind === 'river') {
    return {
      key: `river:${result.id}`,
      scope: 'river',
      name: result.name,
      subtitle: result.subtitle,
      params: {
        scope: 'river',
        riverId: result.id,
        riverSlug: result.riverSlug ?? '',
        riverName: result.name,
      },
    };
  }

  if (result.kind === 'gauge') {
    // siteId is documented as optional because it postdates the endpoint, and
    // every per-gauge route keys off it rather than the uuid. A row without one
    // cannot be configured, so it is dropped rather than shown as a dead end.
    if (!result.siteId) return null;
    return {
      key: `gauge:${result.id}`,
      scope: 'gauge',
      name: result.name,
      subtitle: result.subtitle,
      params: {
        scope: 'gauge',
        gaugeId: result.id,
        siteId: result.siteId,
        gaugeName: result.name,
        riverId: result.riverId ?? '',
        riverSlug: result.riverSlug ?? '',
        riverName: result.riverName ?? '',
      },
    };
  }

  // Access points have no reading of their own — they are a place on a river,
  // graded by whichever station rates it. There is nothing here to watch.
  return null;
}

export default function NewAlertScreen() {
  const router = useRouter();
  const { colors, elevation } = useTheme();
  const { starred } = useStarredRivers();
  const { query, setQuery, results, searching, active } = useEddySearch({
    rivers: null,
    gauges: null,
  });

  const searchTargets = useMemo(
    () => results.map(targetFromResult).filter((x): x is Target => x !== null),
    [results],
  );

  // The shortcut that matters: almost everyone setting an alert is setting it
  // on water they have already starred.
  const starredTargets = useMemo<Target[]>(
    () =>
      starred
        .map((item): Target | null => {
          if (item.kind === 'river') {
            return {
              key: `river:${item.entityId}`,
              scope: 'river' as const,
              name: item.name,
              subtitle: 'Starred river',
              params: {
                scope: 'river',
                riverId: item.entityId,
                riverSlug: item.slug,
                riverName: item.name,
              },
            };
          }
          if (!item.usgsSiteId) return null;
          return {
            key: `gauge:${item.entityId}`,
            scope: 'gauge' as const,
            name: item.name,
            subtitle: 'Starred gauge',
            params: {
              scope: 'gauge',
              gaugeId: item.entityId,
              siteId: item.usgsSiteId,
              gaugeName: item.name,
              riverId: '',
              riverSlug: item.slug,
              riverName: '',
            },
          };
        })
        .filter((x): x is Target => x !== null),
    [starred],
  );

  const data = active ? searchTargets : starredTargets;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.navRow}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={[styles.navTitle, { color: colors.text }]}>New alert</Text>
        <View style={styles.navSpacer} />
      </View>

      <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="search" size={18} color={colors.textSubtle} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search rivers and gauges"
          placeholderTextColor={colors.textSubtle}
          style={[styles.searchInput, { color: colors.text }]}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          accessibilityLabel="Search rivers and gauges"
        />
        {searching ? <ActivityIndicator size="small" color={colors.accent} /> : null}
      </View>

      <FlatList
        data={data}
        keyExtractor={(item) => item.key}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <Text style={[styles.sectionLabel, { color: colors.textSubtle }]}>
            {active ? 'Results' : starredTargets.length > 0 ? 'Your starred water' : ''}
          </Text>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
              {active && !searching
                ? 'Nothing matched. Try a river name, a gauge name, or a USGS site number.'
                : active
                  ? ''
                  : 'Search for any river or USGS gauge — including gauges outside Missouri.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/alerts/configure', params: item.params })}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
              elevation(1),
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Set an alert on ${item.name}`}
          >
            <View style={[styles.icon, { backgroundColor: colors.cardRaised }]}>
              <Ionicons
                name={item.scope === 'gauge' ? 'speedometer-outline' : 'water-outline'}
                size={16}
                color={colors.textMuted}
              />
            </View>
            <View style={styles.rowBody}>
              <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
                {item.name}
              </Text>
              {item.subtitle ? (
                <Text style={[styles.rowSubtitle, { color: colors.textMuted }]} numberOfLines={1}>
                  {item.subtitle}
                </Text>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  navTitle: { ...t.base, fontFamily: fonts.semibold },
  navSpacer: { width: 26 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  searchInput: { flex: 1, ...t.base, fontFamily: fonts.body, padding: 0 },
  sectionLabel: {
    ...t.xs,
    fontFamily: fonts.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginHorizontal: 20,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 14,
    borderRadius: 14,
  },
  icon: { width: 32, height: 32, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1 },
  rowTitle: { ...t.base, fontFamily: fonts.semibold },
  rowSubtitle: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  empty: { paddingHorizontal: 40, paddingTop: 24 },
  emptyBody: { ...t.sm, fontFamily: fonts.body, textAlign: 'center' },
});
