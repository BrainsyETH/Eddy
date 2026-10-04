import { useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { placeChartReadout, type ChartAnchor } from '@/lib/gaugeChartLayout';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

interface Props {
  width: number;
  height: number;
  point: ChartAnchor;
  finger: ChartAnchor | null;
  value: string;
  band?: string;
  time: string;
  source: string;
  quality: string | null;
}

/** The expanded chart reserves space for the readout outside the plot. Fixed
 * line slots keep the plot still as source/quality labels change during a pan. */
export function GaugeChartFixedReadout({ value, band, time, source, quality, compact }: Omit<Props, 'width' | 'height' | 'point' | 'finger'> & { compact: boolean }) {
  const { colors } = useTheme();
  const { fontScale } = useWindowDimensions();
  return <View style={styles.fixedReadout} pointerEvents="none" accessible={false}
    accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <View style={compact ? styles.fixedRow : styles.fixedColumn}>
      <Text numberOfLines={1} style={[styles.value, compact && styles.fixedValue, { color: colors.text, height: t.sm.lineHeight * fontScale }]}>{value}{band ? ` · ${band}` : ''}</Text>
      <Text numberOfLines={1} style={[styles.caption, { color: colors.textMuted, height: t.xs.lineHeight * fontScale }]}>{time}</Text>
    </View>
    <Text numberOfLines={compact ? 1 : 2} style={[styles.caption, { color: colors.textMuted, height: t.xs.lineHeight * fontScale * (compact ? 1 : 2) }]}>{source}{quality ? ` · ${quality}` : ''}</Text>
  </View>;
}

/** Measure real text before placing it. The absolute readout never changes the
 * chart's height, and a high sample sends it below the line instead of over it. */
export function GaugeChartReadout({ width, height, point, finger, value, band, time, source, quality }: Props) {
  const { colors } = useTheme();
  const { fontScale } = useWindowDimensions();
  const [measured, setMeasured] = useState({ width: 0, height: 0 });
  const compact = fontScale > 1.25;
  const tooltipWidth = Math.max(0, Math.min(width - 8, compact ? width - 8 : 216));
  const showBand = band && !compact && (value.length + band.length + 3) * t.sm.fontSize * fontScale * 0.62 <= tooltipWidth - 18;
  const sourceLabel = compact && source === 'Daily observation' ? 'Daily' : source;
  const placement = Math.abs(measured.width - tooltipWidth) < 0.5
    ? placeChartReadout({ x: 4, y: 0, width: width - 8, height }, measured, point, finger) : null;
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    onLayout={event => {
      const { width: measuredWidth, height: measuredHeight } = event.nativeEvent.layout;
      setMeasured(previous => previous.width === measuredWidth && previous.height === measuredHeight ? previous : { width: measuredWidth, height: measuredHeight });
    }}
    style={[styles.readout, { width: tooltipWidth, left: placement?.x ?? 4, top: placement?.y ?? 0,
      opacity: placement ? 1 : 0, backgroundColor: colors.card, borderColor: colors.border }]}>
    <Text style={[styles.value, { color: colors.text }]}>{value}{showBand ? ` · ${band}` : ''}</Text>
    <Text style={[styles.caption, { color: colors.textMuted }]}>{time}</Text>
    <Text numberOfLines={2} style={[styles.caption, { color: colors.textMuted }]}>{sourceLabel}{quality && !compact ? ` · ${quality}` : ''}</Text>
  </View>;
}

const styles = StyleSheet.create({
  fixedReadout: { paddingHorizontal: 4, paddingVertical: 4, gap: 2 },
  fixedRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  fixedColumn: { gap: 2 },
  fixedValue: { flex: 1 },
  readout: { position: 'absolute', borderWidth: StyleSheet.hairlineWidth, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 6, gap: 2 },
  value: { ...t.sm, fontFamily: fonts.monoMedium },
  caption: { ...t.xs },
});
