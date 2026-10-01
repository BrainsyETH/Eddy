import { useMemo, useState } from 'react';
import { Alert, Linking, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import type { GaugeFloodStages, GaugeHistoryResponse } from '@eddy/types';
import { buildZones, type ThresholdValues } from '@eddy/conditions/threshold-zones';
import { chartDataCsv, chartDataRows } from '@eddy/conditions/chart-model';
import { GaugeHistoryTable } from '@/components/GaugeHistoryTable';
import { useTheme } from '@/theme/ThemeProvider';
import { conditionColor } from '@/theme/conditions';
import { FLOOD_STAGE_ORDER, FLOOD_STAGE_SYSTEM, floodStageColor } from '@/theme/floodStage';
import { fonts, type as t } from '@/theme/typography';
import { formatReading } from '@/lib/readingCopy';
import { chartDateRange } from '@/lib/chartDateRange';

interface Props {
  siteId: string;
  history: GaugeHistoryResponse | null;
  thresholds: (ThresholdValues & { thresholdUnit?: 'ft' | 'cfs' }) | null;
  floodStages: GaugeFloodStages | null;
  defaultUnit: 'ft' | 'cfs';
}

export function GaugeChartDetails({ siteId, history, thresholds, floodStages, defaultUnit }: Props) {
  const { colors } = useTheme();
  const [tab, setTab] = useState<'readings' | 'scale' | 'sources'>('readings');
  const [kind, setKind] = useState<'observed' | 'forecast' | 'all'>(
    !history?.readings.length && history?.forecast?.length ? 'forecast' : 'observed',
  );
  const [exporting, setExporting] = useState(false);
  const allRows = useMemo(() => chartDataRows(history?.readings ?? [], history?.forecast ?? []), [history]);
  const rows = useMemo(() => kind === 'all' ? allRows : allRows.filter(row => row.kind === kind), [kind, allRows]);
  const zones = thresholds ? buildZones(thresholds) : [];
  const thresholdUnit = thresholds?.thresholdUnit ?? defaultUnit;
  const stageValues = floodStages ? { action: floodStages.actionFt, flood: floodStages.floodFt, moderate: floodStages.moderateFt, major: floodStages.majorFt } : null;
  const years = history?.typical?.find(row => row.yearsOfRecord != null)?.yearsOfRecord;
  const issued = history?.forecastIssuedAt ? new Date(history.forecastIssuedAt) : null;
  const sourceUrl = history?.sourceUrl && /^https?:\/\//i.test(history.sourceUrl) ? history.sourceUrl : null;
  const statistic = history?.statistic === 'daily_mean' ? 'Daily mean observations'
    : history?.statistic === 'daily_selected' ? 'Selected daily observations' : 'Instantaneous observations';
  const exportCsv = async () => {
    if (!rows.length || exporting) return;
    setExporting(true);
    try {
      const file = new File(Paths.cache, `gauge-${siteId}-${kind}.csv`);
      file.write(chartDataCsv(rows, history?.statistic, history?.sampled));
      await Share.share({ url: file.uri, title: 'Gauge data CSV' });
    } catch { Alert.alert('Export unavailable', 'Please try exporting the readings again.'); }
    finally { setExporting(false); }
  };

  return <>
    <View style={[styles.tabs, { backgroundColor: colors.cardRaised }]} accessibilityRole="tablist">
      {(['readings', 'scale', 'sources'] as const).map(value => <Pressable key={value} accessibilityRole="tab"
        accessibilityState={{ selected: tab === value }} onPress={() => setTab(value)}
        style={[styles.tab, tab === value && { backgroundColor: colors.card }]}>
        <Text style={[styles.controlText, { color: colors.text }]}>{value === 'readings' ? 'Readings' : value === 'scale' ? 'Thresholds' : 'Sources'}</Text>
      </Pressable>)}
    </View>
    {tab === 'readings' ? <>
      <View style={styles.filters}>
        {(['observed', 'forecast', 'all'] as const).map(value => <Pressable key={value} accessibilityRole="button"
          accessibilityState={{ selected: kind === value }} onPress={() => setKind(value)}
          style={[styles.filter, { borderColor: colors.border, backgroundColor: kind === value ? colors.cardRaised : colors.card }]}>
          <Text style={[styles.controlText, { color: colors.text }]}>{value === 'observed' ? 'Observed' : value === 'forecast' ? 'Forecast' : 'All'}</Text>
        </Pressable>)}
      </View>
      {history?.requestedWindow ? <Text style={[styles.meta, { color: colors.textMuted }]}>
        {kind === 'forecast' ? 'Full NWS forecast' : chartDateRange(history.requestedWindow.from, history.requestedWindow.to)}
        {kind !== 'forecast' ? ` · ${statistic}` : ''}
      </Text> : null}
      <GaugeHistoryTable key={kind} rows={rows} />
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: !rows.length || exporting, busy: exporting }}
        disabled={!rows.length || exporting} onPress={exportCsv}
        style={({ pressed }) => [styles.export, { backgroundColor: colors.cardRaised, opacity: !rows.length || exporting ? 0.45 : pressed ? 0.65 : 1 }]}>
        <Text style={[styles.controlText, { color: colors.interactive }]}>{exporting ? 'Exporting…' : 'Export CSV'}</Text>
      </Pressable>
      {history?.sampled && kind !== 'forecast' ? <Text style={[styles.meta, { color: colors.textMuted }]}>Sampled history retains selected original readings and peaks. CSV includes every row in this view, across all pages.</Text> : null}
      {history?.coverageComplete === false ? <Text style={[styles.meta, { color: colors.textMuted }]}>
        Partial coverage{history.coverageWindow ? ` · ${chartDateRange(history.coverageWindow.from, history.coverageWindow.to)}` : ''}.
        {history.truncationReason ? ` ${history.truncationReason}` : ''}
      </Text> : null}
    </> : tab === 'scale' ? <>
      {zones.length ? <>
        <Text style={[styles.meta, { color: colors.textMuted }]}>Eddy-rated in {thresholdUnit}. Bands sit at these exact values on the chart.</Text>
        {zones.map(zone => <View key={zone.key} style={[styles.threshold, { borderBottomColor: colors.border }]}>
          <View style={[styles.swatch, { backgroundColor: conditionColor(zone.key) }]} />
          <Text style={[styles.thresholdName, { color: colors.text }]}>{zone.label}</Text>
          <Text style={[styles.number, { color: colors.textMuted }]}>{zone.openEnded ? `${formatReading(zone.min, thresholdUnit)}+` : `${formatReading(zone.min, thresholdUnit)} – ${formatReading(zone.max, thresholdUnit)}`}</Text>
        </View>)}
      </> : <Text style={[styles.meta, { color: colors.textMuted }]}>This gauge has no Eddy rating.</Text>}
      {stageValues && FLOOD_STAGE_ORDER.some(key => stageValues[key] != null) ? <>
        <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>NWS stage references</Text>
        {FLOOD_STAGE_ORDER.map(key => stageValues[key] == null ? null : <View key={key} style={[styles.threshold, { borderBottomColor: colors.border }]}>
          <View style={[styles.swatch, { backgroundColor: floodStageColor() }]} />
          <Text style={[styles.thresholdName, { color: colors.text }]}>{FLOOD_STAGE_SYSTEM[key].label}</Text>
          <Text style={[styles.number, { color: colors.textMuted }]}>{formatReading(stageValues[key]!, 'ft')}</Text>
        </View>)}
        <Text style={[styles.meta, { color: colors.textMuted }]}>Stage references apply to gauge height in feet{floodStages?.source ? ` · ${floodStages.source}` : ''}.</Text>
      </> : null}
    </> : <>
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>{history?.siteName || siteId}</Text>
      <Text style={[styles.meta, { color: colors.textMuted }]}>{statistic}. Quality codes are preserved in the table and CSV.</Text>
      <Text style={[styles.meta, { color: colors.textMuted }]}>{history?.forecast?.length
        ? `NWS forecast${issued && Number.isFinite(issued.getTime()) ? ` issued ${issued.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}` : ' issue time unavailable'}. Forecast values are shown as published, separately from observations. The chart limits the forecast horizon to the selected history span; the table and CSV retain the full forecast.`
        : 'No NWS forecast is available for this window.'}</Text>
      <Text style={[styles.meta, { color: colors.textMuted }]}>{history?.typical?.length ? `USGS historical daily flow percentiles${years ? ` · ${years} years of record` : ''}. The typical range is the 25th–75th percentile; the median is the 50th. These describe historical flow, not forecast uncertainty.` : 'Historical flow percentiles are unavailable for this window.'}</Text>
      <Text style={[styles.meta, { color: colors.textMuted }]}>Flow (cfs) and gauge height (ft) are separate measurements. Dotted connectors mark missing readings, not measurements. Touch the chart or use VoiceOver to inspect actual samples.</Text>
      {sourceUrl ? <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL(sourceUrl).catch(() => Alert.alert('Couldn’t open source', 'Please try again.')); }} style={styles.export}>
        <Text style={[styles.controlText, { color: colors.interactive }]}>Open provider page</Text>
      </Pressable> : null}
    </>}
  </>;
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', flexWrap: 'wrap', borderRadius: 12, padding: 4, gap: 4 },
  tab: { flex: 1, minWidth: 80, minHeight: 44, borderRadius: 9, padding: 8, alignItems: 'center', justifyContent: 'center' },
  controlText: { ...t.sm, fontFamily: fonts.medium, textAlign: 'center' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filter: { minHeight: 44, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, justifyContent: 'center' },
  meta: { ...t.sm },
  export: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  threshold: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  swatch: { width: 4, height: 22, borderRadius: 2 },
  thresholdName: { ...t.sm, fontFamily: fonts.medium, flexGrow: 1, flexShrink: 1 },
  number: { ...t.xs, fontFamily: fonts.mono, flexShrink: 1, textAlign: 'right' },
  heading: { ...t.base, fontFamily: fonts.semibold },
});
