import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { LngLat } from '@eddy/geo';
import { EddySymbol } from '@/components/EddySymbol';
import { startTiming } from '@/lib/floatStartTiming';
import { useTheme } from '@/theme/ThemeProvider';
import { accent } from '@/theme/palette';
import { fonts, type as t } from '@/theme/typography';
import { VesselSpeedTip } from './VesselSpeedTip';

const clockTime = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function StartTiming({ minutes, now, at, loading }: {
  minutes: number | null;
  now: number;
  at: LngLat;
  loading: boolean;
}) {
  const { colors, isDark } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale > 1.3;
  const timing = startTiming(minutes, now, at);
  const daylight = timing?.daylight;
  return (
    <View style={[local.content, { borderTopColor: colors.border }]}>
      {timing ? <>
        <View style={[local.summary, stacked && local.stacked]}>
          <View style={[local.copy, stacked && local.stackedCopy]}>
            <Text style={[t.sm, { color: colors.textMuted }]}>Estimated arrival</Text>
            <Text style={[t.xs, { color: colors.textMuted }]}>Starting now · excludes stops</Text>
          </View>
          <View style={[local.arrival, stacked && local.arrivalStacked]}>
            <Text style={[local.time, { color: colors.text }]}>{clockTime(timing.arriveAt)}</Text>
            {timing.day ? <Text style={[t.xs, { color: colors.textMuted }]}>{timing.day}</Text> : null}
          </View>
        </View>
        <View style={local.footer}>
          {daylight ? <View style={local.daylight}>
            <EddySymbol name="today" size={26} />
            <Text style={[t.sm, local.daylightCopy, {
              color: daylight.advisory ? (isDark ? accent[400] : accent[700]) : colors.textMuted,
            }]}>{daylight.label} · {clockTime(daylight.at)}</Text>
          </View> : <View style={local.daylightCopy} />}
          <VesselSpeedTip />
        </View>
      </> : <View style={local.footer}>
        <Text style={[t.sm, local.daylightCopy, { color: colors.textMuted }]}>
          {loading ? 'Checking float time…' : 'Eddy will learn your pace'}
        </Text>
        <VesselSpeedTip />
      </View>}
    </View>
  );
}

const local = StyleSheet.create({
  content: { borderTopWidth: StyleSheet.hairlineWidth, marginHorizontal: 16, paddingVertical: 12, gap: 10 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stacked: { flexDirection: 'column', alignItems: 'stretch', gap: 6 },
  copy: { flex: 1, gap: 2 },
  stackedCopy: { flex: 0 },
  arrival: { alignItems: 'flex-end', flexShrink: 1 },
  arrivalStacked: { alignItems: 'flex-start' },
  time: { ...t.xl, fontFamily: fonts.monoMedium },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  daylight: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  daylightCopy: { flex: 1 },
});
