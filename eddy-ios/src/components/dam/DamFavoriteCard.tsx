import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { DamSnapshot } from '@eddy/types';
import { ControlIcon } from '@/components/ControlIcon';
import { KindMark } from '@/components/KindMark';
import { useObservationClock } from '@/hooks/useObservationClock';
import { damFavoriteDisplay, packetHourGenerating } from '@/lib/damFavoriteDisplay';
import { useTheme } from '@/theme/ThemeProvider';
import { radii } from '@/theme/layout';
import { fonts, type as t } from '@/theme/typography';

const TICKS = ['12a', '6a', '12p', '6p', '12a'];

type FavoriteDisplay = ReturnType<typeof damFavoriteDisplay>;
type ChartDay = NonNullable<FavoriteDisplay['schedule']>;

/** Fractions use the same fixed capacity scale as the web and native detail. */
function DayChart({ day, nowHour }: { day: ChartDay; nowHour: number | null }) {
  const { colors } = useTheme();
  return <>
    <View style={styles.bars}>
      {day.hours.map(hour => {
        const selected = hour.hourEnding === nowHour;
        const mw = hour.megawatts;
        // Minimum flow is drawn like the dam screen's DayBars draws
        // it: a low baseline, not a generation bar.
        const generating = packetHourGenerating(hour);
        // A missing hour is unknown, not zero generation: preserve
        // the widget's hollow gap instead of an idle baseline bar.
        return (
          <View key={hour.hourEnding} style={styles.slot}>
            {selected ? <View style={[styles.nowMarker, { borderTopColor: colors.accent }]} /> : null}
            <View style={[styles.bar, mw === null ? {
              height: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.textSubtle,
            } : {
              height: generating ? Math.max(2, 44 * (hour.fraction ?? 0.12)) : 2,
              backgroundColor: generating ? colors.interactive : colors.textSubtle,
              opacity: nowHour !== null && hour.hourEnding < nowHour ? 0.9 : 1,
            }]} />
          </View>
        );
      })}
    </View>
    <View style={styles.axis}>
      {TICKS.map((label, index) => <Text key={index} style={[t.xs, { color: colors.textSubtle }]}>{label}</Text>)}
    </View>
  </>;
}

/**
 * The body of the Favorites dam card: observed turbine flow and its status,
 * today's posted bars with the now marker, and "At the dam" with the
 * observation's age. Shared with a tailwater river's reading card
 * (RiverDamPanel), so a reader learns one drawing of a dam.
 *
 * `withTomorrow` adds Tomorrow's bars on the same fixed project capacity
 * scale. Favorites keeps Today; the tailwater card can show both days.
 */
export function DamGlance({ dam, onPress, withTomorrow = false }: {
  dam: DamSnapshot;
  onPress: () => void;
  withTomorrow?: boolean;
}) {
  const { colors } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 375 || fontScale >= 1.3;
  const now = useObservationClock();
  const display = useMemo(() => damFavoriteDisplay(dam, now), [dam, now]);
  const { moment, schedule, scheduleCaption, status, scheduleNotice, observedAge } = display;
  const tomorrow = withTomorrow ? display.tomorrow : null;
  const value = moment.turbineCfs === null ? '—' : Math.round(moment.turbineCfs).toLocaleString();
  const statusColor = moment.current ? colors.interactive : colors.textSubtle;

  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      accessibilityLabel={[
        `Observed turbine flow: ${moment.turbineCfs === null ? 'unavailable' : `${value} cubic feet per second`}`,
        moment.status, observedAge ? `Observed ${observedAge}` : null, 'At the dam', moment.scheduleSummary, display.scheduleDescription,
        tomorrow ? display.tomorrowDescription : null,
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
                : moment.generationKind === 'generating' ? 'flash'
                : moment.minimumFlow ? 'water-outline' : 'flash-off-outline'} size={14} color={statusColor} />
              <Text style={[styles.status, { color: statusColor }]}>{status}</Text>
            </View>
          </View>
          <View style={[styles.schedule, stacked && styles.scheduleStacked]}>
            <View style={styles.scheduleHeader}>
              <Text style={[styles.scheduleTitle, { color: colors.text }]}>{tomorrow ? 'Today · CT' : 'Schedule · CT'}</Text>
              {scheduleCaption ? (
                <Text style={[t.xs, { color: colors.textMuted }]}>{scheduleCaption}</Text>
              ) : null}
            </View>
            {schedule ? <DayChart day={schedule} nowHour={moment.scheduleHour} /> : <View style={styles.noSchedule}>
              <ControlIcon name="calendar-outline" size={20} color={colors.textSubtle} />
              <Text style={[styles.notice, { color: colors.textMuted }]}>{scheduleNotice}</Text>
            </View>}
            {tomorrow ? <View style={styles.tomorrow}>
              <View style={styles.scheduleHeader}>
                <Text style={[styles.scheduleTitle, { color: colors.text }]}>Tomorrow · CT</Text>
                {display.tomorrowCaption ? (
                  <Text style={[t.xs, { color: colors.textMuted }]}>{display.tomorrowCaption}</Text>
                ) : null}
              </View>
              <DayChart day={tomorrow} nowHour={null} />
            </View> : null}
          </View>
        </View>
        <Text style={[t.xs, { color: moment.scheduleCurrent ? colors.textMuted : colors.accent, marginTop: 8 }]}>{moment.scheduleSummary}</Text>
        <View style={styles.footer}>
          <Text style={[t.xs, { color: colors.textSubtle }]}>At the dam</Text>
          <Text style={[t.xs, { color: colors.textSubtle }]}>
            {observedAge ? `Observed ${observedAge}` : 'Observation unavailable'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function DamFavoriteCardComponent({ dam, onPress, onToggleStar }: {
  dam: DamSnapshot;
  onPress: () => void;
  onToggleStar: () => void;
}) {
  const { colors, elevation } = useTheme();
  const metadata = [dam.lakeName, dam.state].filter(Boolean).join(' · ');
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
      <DamGlance dam={dam} onPress={onPress} />
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
  tomorrow: { marginTop: 10, gap: 3 },
});
