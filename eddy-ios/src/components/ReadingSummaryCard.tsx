import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { buildZones, type ThresholdValues } from '@eddy/conditions/threshold-zones';
import { conditionText } from '@/theme/conditions';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { formatReading } from '@/lib/readingCopy';
import { readingSummaryVerdict } from '@/lib/readingSummary';
import { Otter, otterForCondition } from './Otter';
import { ReadingScale } from './ReadingScale';
import { TREND_ICON, type TrendDirection } from './TrendPill';

export interface ReadingInfoItem { label: string; value: string | null | undefined }

interface Props {
  reading: { value: number; unit: 'ft' | 'cfs' } | null;
  /** Omitted for an unrated gauge: its measurement is the headline. */
  verdict?: { code: string; lastKnown?: boolean } | null;
  resolving?: boolean;
  trend?: { direction: TrendDirection; label?: string | null } | null;
  thresholds?: (ThresholdValues & { thresholdUnit?: 'ft' | 'cfs' }) | null;
  context?: string | null;
  age: string | null;
  ageWarning?: boolean;
  offline?: boolean;
  stationName?: string | null;
  /** Only when a picker or the page heading doesn't already identify it. */
  stationLabel?: string | null;
  details?: readonly ReadingInfoItem[];
  /** Accuracy caveats and current NWS status stay visible. */
  children?: ReactNode;
}

export function ReadingSummaryCard({ reading, verdict, resolving, trend, thresholds, context, age, ageWarning, offline, stationName, stationLabel, details = [], children }: Props) {
  const { colors, elevation, isDark } = useTheme();
  const [infoOpen, setInfoOpen] = useState(false);
  const close = () => setInfoOpen(false);
  const code = verdict?.lastKnown ? 'unknown' : verdict?.code;
  const mutedScale = Boolean(verdict?.lastKnown || code === 'unknown');
  const hasScale = Boolean(reading && thresholds
    && (!thresholds.thresholdUnit || thresholds.thresholdUnit === reading.unit)
    && buildZones(thresholds).length >= 2);
  const rows: ReadingInfoItem[] = [
    { label: 'Station', value: stationName },
    { label: 'Reading', value: reading ? formatReading(reading.value, reading.unit) : 'No reading available' },
    ...details,
    ...(hasScale ? [{ label: 'Condition strip', value: 'Equal-width condition bands. The marker shows where the reading sits within its band.' }] : []),
  ];

  return (
    <>
      {stationLabel ? <Text style={[styles.station, { color: colors.textMuted }]}>{stationLabel}</Text> : null}
      <View style={[styles.card, { backgroundColor: colors.card }, elevation(2)]}>
        <View style={styles.header}>
          {verdict ? <Otter mood={otterForCondition(code ?? 'unknown')} size={52} /> : null}
          <View style={styles.headerCopy}>
            {verdict ? (
              <Text accessibilityRole="header" style={[styles.verdict, { color: verdict.lastKnown ? colors.textMuted : conditionText(code ?? 'unknown', isDark) }]}>
                {readingSummaryVerdict(verdict.code, verdict.lastKnown)}
              </Text>
            ) : resolving ? (
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.resolving, { backgroundColor: colors.cardRaised }]} />
            ) : null}
            <View style={styles.readingRow}>
              <Text style={[reading ? styles.reading : styles.noReading, { color: reading ? colors.text : colors.textMuted }]}>
                {reading ? formatReading(reading.value, reading.unit) : 'No reading available'}
              </Text>
              {trend ? (
                <View style={styles.trend}>
                  <Ionicons name={TREND_ICON[trend.direction]} size={13} color={colors.textMuted} />
                  {trend.label ? <Text style={[styles.trendText, { color: colors.textMuted }]}>{trend.label}</Text> : null}
                </View>
              ) : null}
            </View>
          </View>
        </View>
        {hasScale && thresholds && reading ? (
          <ReadingScale thresholds={thresholds} value={verdict?.code === 'unknown' ? null : reading.value} unit={reading.unit} summary muted={mutedScale} />
        ) : null}
        {context ? <Text style={[styles.context, { color: colors.textMuted, borderTopColor: colors.border }]}>{context}</Text> : null}
        {children}
        <View style={styles.footer}>
          <View style={styles.ageRow}>
            {ageWarning || offline ? <Ionicons name={ageWarning ? 'alert-circle-outline' : 'cloud-offline-outline'} size={14} color={ageWarning ? colors.text : colors.textMuted} /> : null}
            <Text style={[styles.age, { color: ageWarning ? colors.text : colors.textSubtle }]}>{age ?? 'Observation time unavailable'}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="About this reading" accessibilityHint="Opens station and reading details" onPress={() => setInfoOpen(true)} style={({ pressed }) => [styles.info, { opacity: pressed ? 0.6 : 1 }]}>
            <Ionicons name="information-circle-outline" size={20} color={colors.textMuted} />
          </Pressable>
        </View>
      </View>
      <Modal visible={infoOpen} animationType="slide" presentationStyle="pageSheet" allowSwipeDismissal onRequestClose={close}>
        <SafeAreaView style={[styles.sheet, { backgroundColor: colors.bg }]} edges={['top', 'bottom']} onAccessibilityEscape={close}>
          <View style={styles.sheetHeader}>
            <Text accessibilityRole="header" style={[styles.sheetTitle, { color: colors.text }]}>About this reading</Text>
            <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close reading information" style={styles.info}>
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.sheetContent}>
            {rows.filter((row) => row.value).map((row, index) => (
              <View key={`${row.label}-${index}`} style={[styles.detail, { borderBottomColor: colors.border }]}>
                <Text style={[styles.detailLabel, { color: colors.textMuted }]}>{row.label}</Text>
                <Text selectable style={[styles.detailValue, { color: colors.text }]}>{row.value}</Text>
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  station: { ...t.xs, fontFamily: fonts.body, marginHorizontal: 4, marginBottom: 6 },
  card: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6, borderRadius: 16, marginBottom: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerCopy: { flex: 1, minWidth: 0 },
  verdict: { ...t.lg, fontFamily: fonts.semibold },
  resolving: { width: 140, height: 20, borderRadius: 6, marginBottom: 4 },
  readingRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, rowGap: 2 },
  reading: { ...t['2xl'], fontFamily: fonts.mono, flexShrink: 1 },
  noReading: { ...t.sm, fontFamily: fonts.body, flexShrink: 1 },
  trend: { flexDirection: 'row', alignItems: 'center', gap: 3, maxWidth: '100%' },
  trendText: { ...t.xs, fontFamily: fonts.medium, flexShrink: 1 },
  context: { ...t.sm, fontFamily: fonts.body, marginTop: 10, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, minHeight: 44 },
  ageRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 },
  age: { ...t.xs, fontFamily: fonts.body, flexShrink: 1 },
  info: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  sheet: { flex: 1 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 20, paddingRight: 12, paddingVertical: 12 },
  sheetTitle: { ...t.xl, fontFamily: fonts.heading, flex: 1 },
  sheetContent: { paddingHorizontal: 20, paddingBottom: 24 },
  detail: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  detailLabel: { ...t.xs, fontFamily: fonts.medium, marginBottom: 4 },
  detailValue: { ...t.sm, fontFamily: fonts.body },
});
