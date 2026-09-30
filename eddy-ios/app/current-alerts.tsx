import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import type { HighWaterEntry, RiverAlert } from '@eddy/types';
import { fetchHighWater, fetchRiverAlerts } from '@/api/client';
import { NativeHeaderHome } from '@/components/NativeHeaderHome';
import { HighWaterAlertRow, PublicNoticeRow } from '@/components/CurrentAlertRows';
import { ScopeSwitch, type ScopeOption } from '@/components/ScopeSwitch';
import { useStarredRivers } from '@/hooks/useStarredRivers';
import { currentAlertsSummary, decodeCurrentAlertsFilter, type CurrentAlertsFilter } from '@/lib/todaySafety';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, textStyles, type as t } from '@/theme/typography';

type Row = { kind: 'high'; entry: HighWaterEntry } | { kind: 'notice'; alert: RiverAlert };
type Section = { key: 'high' | 'notices'; title: string; caption: string; empty: string; data: Row[] };

const FILTERS: ScopeOption<CurrentAlertsFilter>[] = [
  { key: 'favorites', label: 'Favorites', accessibilityLabel: 'Favorites' },
  { key: 'all', label: 'All Alerts', accessibilityLabel: 'All Alerts' },
];

export default function CurrentAlertsScreen() {
  const params = useLocalSearchParams<{ filter?: string | string[] }>();
  const [selectedFilter, setSelectedFilter] = useState<CurrentAlertsFilter | null>(null);
  const filter = selectedFilter ?? decodeCurrentAlertsFilter(params.filter);
  const { starred, ready: starsReady } = useStarredRivers();
  const favoritesLoading = filter === 'favorites' && !starsReady;
  const [high, setHigh] = useState<HighWaterEntry[] | null>(null);
  const [notices, setNotices] = useState<RiverAlert[] | null>(null);
  const [failed, setFailed] = useState({ high: false, notices: false });
  const [refreshing, setRefreshing] = useState(false);
  const [checking, setChecking] = useState(true);
  const request = useRef<AbortController | null>(null);
  const { colors } = useTheme();

  const load = useCallback(() => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    return Promise.all([
      fetchHighWater(controller.signal).then((entries) => {
        if (controller.signal.aborted) return;
        setHigh(entries);
        setFailed((current) => ({ ...current, high: false }));
      }).catch(() => {
        if (!controller.signal.aborted) setFailed((current) => ({ ...current, high: true }));
      }),
      fetchRiverAlerts(undefined, controller.signal).then((entries) => {
        if (controller.signal.aborted) return;
        setNotices(entries);
        setFailed((current) => ({ ...current, notices: false }));
      }).catch(() => {
        if (!controller.signal.aborted) setFailed((current) => ({ ...current, notices: true }));
      }),
    ]).then(() => {
      if (!controller.signal.aborted) {
        setRefreshing(false);
        setChecking(false);
      }
    });
  }, []);

  const retry = () => {
    setFailed({ high: false, notices: false });
    setChecking(true);
    void load();
  };
  const refresh = () => {
    setRefreshing(true);
    retry();
  };

  useEffect(() => {
    void load();
    return () => request.current?.abort();
  }, [load]);

  const summary = currentAlertsSummary(favoritesLoading ? null : high, favoritesLoading ? null : notices, filter, starred, failed);
  const highRows = [...summary.high]
    .sort((a, b) => Number(b.conditionCode === 'dangerous') - Number(a.conditionCode === 'dangerous'));
  const severityOrder = { warning: 0, watch: 1, notice: 2 };
  const noticeRows = [...summary.notices]
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  const sections: Section[] = [
    { key: 'high', title: 'Running high', caption: 'Conditions graded by Eddy from gauge readings.',
      empty: 'No Eddy-rated rivers or gauges running high right now.', data: highRows.map((entry) => ({ kind: 'high', entry })) },
    { key: 'notices', title: 'Public notices', caption: 'Closures and weather warnings from the National Park Service and National Weather Service.',
      empty: 'No public notices right now.', data: noticeRows.map((alert) => ({ kind: 'notice', alert })) },
  ];

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['left', 'right']}>
      <NativeHeaderHome destination="today" />
      <SectionList<Row, Section>
        contentInsetAdjustmentBehavior="automatic"
        sections={sections}
        keyExtractor={(item) => item.kind === 'high' ? `high:${item.entry.id}` : `notice:${item.alert.id}`}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.interactive} />}
        ListHeaderComponent={
          <View>
            <ScopeSwitch options={FILTERS} value={filter} onChange={setSelectedFilter} />
            {filter === 'favorites' ? (
              <Text style={[styles.filterCaption, { color: colors.textMuted }]}>
                {favoritesLoading ? 'Loading favorites…' : starred.length === 0
                  ? 'Save rivers, gauges, or dams to Favorites to see their alerts here.'
                  : 'Showing alerts for your favorites.'}
              </Text>
            ) : null}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeading}>
            <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text }]}>{section.title}</Text>
            <Text style={[styles.caption, { color: colors.textMuted }]}>{section.caption}</Text>
          </View>
        )}
        renderItem={({ item }) => item.kind === 'high' ? <HighWaterAlertRow entry={item.entry} /> : <PublicNoticeRow alert={item.alert} />}
        renderSectionFooter={({ section }) => {
          const data = section.key === 'high' ? high : notices;
          const error = failed[section.key];
          return (
            <View style={styles.sectionFooter}>
              {favoritesLoading ? null : error ? (
                <>
                  <Text accessibilityRole="alert" style={[styles.caption, { color: colors.error }]}>
                    {data === null ? `Couldn’t load ${section.title.toLowerCase()}.` : `Couldn’t refresh ${section.title.toLowerCase()}. Previous results may be outdated.`}
                  </Text>
                  <Pressable onPress={retry} accessibilityRole="button" accessibilityLabel={`Retry ${section.title.toLowerCase()}`} style={styles.action}>
                    <Text style={[styles.actionText, { color: colors.interactive }]}>Retry</Text>
                  </Pressable>
                </>
              ) : data === null || checking ? (
                <View style={styles.loading}>
                  {!refreshing ? <ActivityIndicator color={colors.interactive} /> : null}
                  <Text style={[styles.caption, { color: colors.textMuted }]}>Checking {section.title.toLowerCase()}…</Text>
                </View>
              ) : section.data.length === 0 ? <Text style={[styles.caption, { color: colors.textMuted }]}>{section.empty}</Text> : null}
            </View>
          );
        }}
        ListFooterComponent={<Text style={[styles.disclaimer, { color: colors.textMuted }]}>Readings can lag, and agency notices don’t cover every hazard. Check local conditions before getting on the water.</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingBottom: 24 },
  filterCaption: { ...t.sm, paddingHorizontal: 20, paddingTop: 12 },
  caption: { ...t.sm },
  action: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignSelf: 'flex-start', paddingVertical: 8 },
  actionText: { ...t.sm, fontFamily: fonts.semibold },
  sectionHeading: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, gap: 4 },
  sectionTitle: { ...textStyles.sectionTitle },
  sectionFooter: { paddingHorizontal: 20 },
  loading: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  disclaimer: { ...t.sm, paddingHorizontal: 20, paddingTop: 24 },
});
