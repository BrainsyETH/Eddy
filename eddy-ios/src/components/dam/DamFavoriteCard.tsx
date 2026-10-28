import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { DamSnapshot } from '@eddy/types';
import { ControlIcon } from '@/components/ControlIcon';
import { KindMark } from '@/components/KindMark';
import { useObservationClock } from '@/hooks/useObservationClock';
import { damFavoriteDisplay } from '@/lib/damFavoriteDisplay';
import { useTheme } from '@/theme/ThemeProvider';
import { radii } from '@/theme/layout';
import { fonts, type as t } from '@/theme/typography';

const TICKS = ['12a', '6a', '12p', '6p', '12a'];

function DamFavoriteCardComponent({ dam, onPress, onToggleStar }: {
  dam: DamSnapshot;
  onPress: () => void;
  onToggleStar: () => void;
}) {
  const { colors, elevation } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 375 || fontScale >= 1.3;
  const now = useObservationClock();
  const display = useMemo(() => damFavoriteDisplay(dam, now), [dam, now]);
  const { moment, schedule, peak, status, scheduleNotice, observedAge } = display;
  const value = moment.turbineCfs === null ? '—' : Math.round(moment.turbineCfs).toLocaleString();
  const metadata = [dam.lakeName, dam.state].filter(Boolean).join(' · ');
  const statusColor = moment.current ? colors.interactive : colors.textSubtle;

  return (
    <View style={[styles.card, { backgroundColor: colors.card }, elevation(1)]}>
      <View style={styles.header}>
        <Pressable onPress={onPress} accessibilityRole="button"
          accessibilityLabel={[dam.name, metadata, 'Opens dam details'].filter(Boolean).join(', ')}
          style={({ pressed }) => [styles.identity, { opacity: pressed ? 0.65 : 1 }]}>
          <KindMark kind="dam" size={28} color={colors.textMuted} />
          <View style={styles.nameBlock}>
            <Text style={[styles.name, { color: colors.text }]}>{dam.name}</Text>
            {metadata ? <Text style={[t.xs, { color: colors.textMuted }]}>{metadata}</Text> : null}
          </View>
        </Pressable>
        <Pressable onPress={onToggleStar} accessibilityRole="button"
          accessibilityLabel={`Unstar ${dam.name}`}
          style={({ pressed }) => [styles.star, { opacity: pressed ? 0.5 : 1 }]}>
          <ControlIcon name="star" size={21} color={colors.warm} />
        </Pressable>
      </View>

      <Pressable onPress={onPress} accessibilityRole="button"
        accessibilityLabel={[
          `Observed turbine flow: ${moment.turbineCfs === null ? 'unavailable' : `${value} cubic feet per second`}`,
          moment.status, observedAge ? `Observed ${observedAge}` : null, 'At the dam', display.scheduleDescription,
        ].filter(Boolean).join('. ')}
        accessibilityHint="Opens dam details and the full schedule"
        style={({ pressed }) => [styles.details, { opacity: pressed ? 0.65 : 1 }]}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={[styles.content, stacked && styles.contentStacked]}>
            <View style={[styles.reading, stacked && styles.readingStacked]}>
              <Text style={[t.xs, { color: colors.textMuted }]}>Turbine flow</Text>
              <View style={styles.valueRow}>
                <Text style={[styles.value, { color: moment.current ? colors.text : colors.textSubtle }]}>{value}</Text>
                <Text style={[styles.unit, { color: colors.textMuted }]}>CFS</Text>
              </View>
              <View style={styles.statusRow}>
                <ControlIcon name={!moment.current ? 'help-circle-outline'
                  : moment.generationKind === 'generating' ? 'flash' : 'flash-off-outline'} size={14} color={statusColor} />
                <Text style={[styles.status, { color: statusColor }]}>{status}</Text>
              </View>
            </View>

            <View style={[styles.schedule, stacked && styles.scheduleStacked]}>
              <View style={styles.scheduleHeader}>
                <Text style={[styles.scheduleTitle, { color: colors.text }]}>Schedule · CT</Text>
                {schedule?.hours.some(hour => hour.megawatts !== null) ? (
                  <Text style={[t.xs, { color: colors.textMuted }]}>{Math.round(peak).toLocaleString()} MW</Text>
                ) : null}
              </View>
              {schedule ? <>
                <View style={styles.bars}>
                  {schedule.hours.map(hour => {
                    const selected = hour.hourEnding === moment.scheduleHour;
                    const mw = hour.megawatts;
                    // A missing hour is unknown, not zero generation: preserve
                    // the widget's hollow gap instead of an idle baseline bar.
                    return (
                      <View key={hour.hourEnding} style={styles.slot}>
                        {selected ? <View style={[styles.nowMarker, { borderTopColor: colors.accent }]} /> : null}
                        <View style={[styles.bar, mw === null ? {
                          height: 44, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.textSubtle,
                        } : {
                          height: mw > 0 ? Math.max(5, 44 * mw / Math.max(peak, 1)) : 3,
                          backgroundColor: mw > 0 ? colors.interactive : colors.textSubtle,
                        }]} />
                      </View>
                    );
                  })}
                </View>
                <View style={styles.axis}>
                  {TICKS.map((label, index) => <Text key={index} style={[t.xs, { color: colors.textSubtle }]}>{label}</Text>)}
                </View>
              </> : <View style={styles.noSchedule}>
                <ControlIcon name="calendar-outline" size={20} color={colors.textSubtle} />
                <Text style={[styles.notice, { color: colors.textMuted }]}>{scheduleNotice}</Text>
              </View>}
              <Text style={[t.xs, { color: colors.textSubtle }]}>Subject to change</Text>
            </View>
          </View>
          <View style={styles.footer}>
            <Text style={[t.xs, { color: colors.textSubtle }]}>At the dam</Text>
            <Text style={[t.xs, { color: colors.textSubtle }]}>
              {observedAge ? `Observed ${observedAge}` : 'Observation unavailable'}
            </Text>
          </View>
        </View>
      </Pressable>
    </View>
  );
}

export const DamFavoriteCard = memo(DamFavoriteCardComponent);

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 8, borderRadius: radii.card, padding: 16 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  identity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  nameBlock: { flex: 1, gap: 2 },
  name: { ...t.base, fontFamily: fonts.heading },
  star: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
  details: { marginTop: 12 },
  content: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  contentStacked: { flexDirection: 'column' },
  reading: { width: '36%', gap: 4 },
  readingStacked: { width: '100%' },
  valueRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 4 },
  value: { ...t['2xl'], fontFamily: fonts.monoMedium },
  unit: { ...t.xs, fontFamily: fonts.semibold },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  status: { ...t.xs, fontFamily: fonts.medium, flexShrink: 1 },
  schedule: { flex: 1, alignSelf: 'stretch', gap: 3 },
  scheduleStacked: { flex: 0, width: '100%' },
  scheduleHeader: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: 6 },
  scheduleTitle: { ...t.xs, fontFamily: fonts.semibold },
  bars: { height: 52, flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  slot: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 2 },
  bar: { width: '100%', borderRadius: 1.5 },
  nowMarker: { width: 0, height: 0, borderLeftWidth: 3, borderRightWidth: 3, borderTopWidth: 4,
    borderLeftColor: 'transparent', borderRightColor: 'transparent' },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
  noSchedule: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 6 },
  notice: { ...t.sm, flexShrink: 1 },
  footer: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 4 },
});
