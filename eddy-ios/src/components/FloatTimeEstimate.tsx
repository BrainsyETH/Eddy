import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ControlIcon } from './ControlIcon';
import { FloatInfoSheet } from './FloatInfoSheet';
import { formatFloatTimeRange, roundToQuarterHour } from '@eddy/conditions/float-time-format';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

/** Presentation only: keep the shared quarter-hour rounding and both range ends. */
export function FloatTimeEstimate({
  timeRange,
  formatted,
  typical = false,
}: {
  timeRange?: { min: number; max: number };
  formatted: string;
  typical?: boolean;
}) {
  const { colors } = useTheme();
  const [showInfo, setShowInfo] = useState(false);
  const label = typical ? 'Typical float time' : 'Estimated float time';
  const low = timeRange ? roundToQuarterHour(timeRange.min) : null;
  const high = timeRange ? roundToQuarterHour(timeRange.max) : null;
  return (
    <View style={styles.estimate}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
        <Pressable onPress={() => setShowInfo(true)} accessibilityRole="button" accessibilityLabel="How float times are estimated" style={styles.info}>
          <ControlIcon name="information-circle-outline" size={19} color={colors.interactive} />
        </Pressable>
      </View>
      <View
        style={styles.range}
        accessible
        accessibilityLabel={timeRange
          ? `${label}, ${formatFloatTimeRange(timeRange.min, timeRange.max)}`
          : `${label}, ${formatted}`}
      >
        {low !== null ? (
          <>
            <Duration minutes={low} />
            {high !== null && high > low ? (
              <View style={styles.rangeEnd}>
                <Text style={[styles.separator, { color: colors.textMuted }]}>–</Text>
                <Duration minutes={high} />
              </View>
            ) : null}
          </>
        ) : (
          <Text style={[styles.value, { color: colors.text }]}>{formatted.replace(/^~/, '')}</Text>
        )}
      </View>
      <Text style={[styles.note, { color: colors.textMuted }]}>
        {typical ? 'Not adjusted to current water.' : 'Allow extra time for long stops or fishing.'}
      </Text>
      {showInfo ? <FloatInfoSheet topic="time" onClose={() => setShowInfo(false)} /> : null}
    </View>
  );
}

function Duration({ minutes }: { minutes: number }) {
  const { colors } = useTheme();
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return (
    <Text style={[styles.value, { color: colors.text }]}>
      {hours > 0 ? <>{hours}<Text style={styles.unit}>{'\u00a0hr'}</Text></> : null}
      {hours > 0 && remainder > 0 ? ' ' : null}
      {remainder > 0 ? <>{remainder}<Text style={styles.unit}>{'\u00a0min'}</Text></> : null}
    </Text>
  );
}

const styles = StyleSheet.create({
  estimate: { marginTop: 16, gap: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  info: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  label: { ...t.sm, fontFamily: fonts.medium, flexShrink: 1 },
  range: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 10, rowGap: 2 },
  rangeEnd: { flexDirection: 'row', alignItems: 'baseline', gap: 10, flexShrink: 1 },
  value: { ...t['3xl'], fontFamily: fonts.semibold, fontVariant: ['tabular-nums'], flexShrink: 1 },
  unit: { ...t.lg, fontFamily: fonts.medium },
  separator: { ...t['2xl'], fontFamily: fonts.body },
  note: { ...t.sm, fontFamily: fonts.body, marginTop: 2 },
});
