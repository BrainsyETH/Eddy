import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { HighWaterEntry, RiverAlert } from '@eddy/types';
import { fetchHighWater, fetchRiverAlerts } from '@/api/client';
import { BackButton } from '@/components/BackButton';
import { HighWaterAlertRow, PublicNoticeRow } from '@/components/CurrentAlertRows';
import { currentAlertsScopeLabel, currentAlertsSummary, decodeCurrentAlertsScope } from '@/lib/todaySafety';
import { goBack } from '@/lib/nav';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, textStyles, type as t } from '@/theme/typography';

type Row = { kind: 'high'; entry: HighWaterEntry } | { kind: 'notice'; alert: RiverAlert };
type Section = { key: 'high' | 'notices'; title: string; caption: string; empty: string; data: Row[] };

export default function CurrentAlertsScreen() {
  const params = useLocalSearchParams<{ scope?: string | string[] }>();
  const selection = useMemo(() => decodeCurrentAlertsScope(params.scope), [params.scope]);
  const [viewAll, setViewAll] = useState(false);
  const [high, setHigh] = useState<HighWaterEntry[] | null>(null);
  const [notices, setNotices] = useState<RiverAlert[] | null>(null);
  const [failed, setFailed] = useState({ high: false, notices: false });
  const [refreshing, setRefreshing] = useState(true);
  const request = useRef<AbortController | null>(null);
  const { colors } = useTheme();
  const router = useRouter();

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
      if (!controller.signal.aborted) setRefreshing(false);
    });
  }, []);

  const refresh = () => {
    setRefreshing(true);
    void load();
  };

  useEffect(() => {
    void load();
    return () => request.current?.abort();
  }, [load]);

  const summary = currentAlertsSummary(high, notices, selection, failed);
  const highRows = [...(viewAll ? high ?? [] : summary.high)]
    .sort((a, b) => Number(b.conditionCode === 'dangerous') - Number(a.conditionCode === 'dangerous'));
  const severityOrder = { warning: 0, watch: 1, notice: 2 };
  const noticeRows = [...(viewAll ? notices ?? [] : summary.notices)]
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  const sections: Section[] = [
    { key: 'high', title: 'Running high', caption: 'Conditions graded by Eddy from gauge readings.',
      empty: 'Nothing running high in this scope.', data: highRows.map((entry) => ({ kind: 'high', entry })) },
    { key: 'notices', title: 'Public notices', caption: 'Closures and weather warnings from the National Park Service and National Weather Service.',
      empty: 'No public notices in this scope.', data: noticeRows.map((alert) => ({ kind: 'notice', alert })) },
  ];

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
      <View style={styles.navigation}>
        <BackButton onPress={() => goBack(router)} />
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Current alerts</Text>
      </View>
      <SectionList<Row, Section>
        sections={sections}
        keyExtractor={(item) => item.kind === 'high' ? `high:${item.entry.id}` : `notice:${item.alert.id}`}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.interactive} />}
        ListHeaderComponent={
          <View style={styles.summary}>
            <Text style={[styles.scope, { color: colors.text }]}>{viewAll ? 'All current alerts statewide' : currentAlertsScopeLabel(selection)}</Text>
            {selection.fallback && !viewAll ? <Text style={[styles.caption, { color: colors.textMuted }]}>No valid river scope was provided. Showing statewide warnings.</Text> : null}
            <Pressable accessibilityRole="button" onPress={() => setViewAll((value) => !value)} style={styles.action}>
              <Text style={[styles.actionText, { color: colors.interactive }]}>{viewAll ? 'Return to scoped alerts' : 'View all current alerts'}</Text>
            </Pressable>
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
              {error ? (
                <>
                  <Text accessibilityRole="alert" style={[styles.caption, { color: colors.error }]}>
                    {data === null ? `Couldn’t load ${section.title.toLowerCase()}.` : `Couldn’t refresh ${section.title.toLowerCase()}. Previous results may be outdated.`}
                  </Text>
                  <Pressable onPress={refresh} accessibilityRole="button" accessibilityLabel={`Retry ${section.title.toLowerCase()}`} style={styles.action}>
                    <Text style={[styles.actionText, { color: colors.interactive }]}>Retry</Text>
                  </Pressable>
                </>
              ) : data === null ? (
                <View style={styles.loading}>
                  <ActivityIndicator color={colors.interactive} />
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
  navigation: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 },
  title: { ...textStyles.pageTitle, flex: 1 },
  content: { paddingBottom: 24 },
  summary: { paddingHorizontal: 20, paddingTop: 12 },
  scope: { ...t.base, fontFamily: fonts.semibold },
  caption: { ...t.sm },
  action: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignSelf: 'flex-start', paddingVertical: 8 },
  actionText: { ...t.sm, fontFamily: fonts.semibold },
  sectionHeading: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, gap: 4 },
  sectionTitle: { ...textStyles.sectionTitle },
  sectionFooter: { paddingHorizontal: 20 },
  loading: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  disclaimer: { ...t.sm, paddingHorizontal: 20, paddingTop: 24 },
});
