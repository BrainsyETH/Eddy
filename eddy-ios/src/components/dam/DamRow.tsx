// eddy-ios/src/components/dam/DamRow.tsx
// One USACE project in a list.
//
// The release and its age sit beside the dam name. The turbine observation
// gets its own line so the icon stays with its label when the text wraps.

import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ControlIcon } from '@/components/ControlIcon';
import type { DamSnapshot } from '@eddy/types';
import {
  centralDayKey,
  relativeAge,
  scheduledHoursSummary,
} from '@eddy/conditions/dam-schedule-copy';
import { DayBars } from '@/components/dam/DayBars';
import { generationNow, generationStatusLabel, speaksForNow } from '@eddy/conditions/dam-generation';
import { useObservationClock } from '@/hooks/useObservationClock';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { KindMark } from '@/components/KindMark';

function DamRowComponent({
  dam,
  onPress,
  starred = false,
  onToggleStar,
  showSchedule = false,
}: {
  dam: DamSnapshot;
  onPress: () => void;
  starred?: boolean;
  /**
   * Omit to render no star at all.
   *
   * Absent rather than disabled where a list cannot star — the same rule the
   * map callout follows. A control that does nothing is worse than no control.
   */
  onToggleStar?: () => void;
  /**
   * Today's hourly schedule under the row.
   *
   * ON FOR FAVOURITES, off for search results. A favourite is a dam somebody
   * comes back to — "is Table Rock running this weekend" is a weekly question —
   * and making them open the screen to see the one thing they starred it for is
   * a tap that answers itself. A search result has not been chosen yet, and
   * twenty-four bars under every row of a list you are scanning is noise.
   *
   * Costs no request either way: /api/dams already returns the schedule per
   * dam, and the Favorites screen already fetches it.
   */
  showSchedule?: boolean;
}) {
  const { colors } = useTheme();
  const now = useObservationClock();
  const generation = generationNow(dam, now);
  const status = generationStatusLabel(generation);
  const generatingNow = generation.kind === 'generating' && speaksForNow(generation.age);
  const statusColor = generatingNow ? colors.interactive : colors.textSubtle;
  const release = dam.metrics.release;
  const releaseAge = release ? relativeAge(release.at, now) : null;

  // ── TODAY BY DATE, NEVER BY POSITION ──────────────────────────────────────
  //
  // This read `schedule[0]`, which was true while the payload carried exactly
  // one day and could only ever be today's. It now carries two, and
  // fetchProjectSchedule drops any day whose file fails to parse INDEPENDENTLY
  // — so `[tomorrow]` is a representable payload, and position 0 would then put
  // tomorrow's bars and tomorrow's idle window under the row with no date on
  // them and nothing but a missing "now" marker to give it away.
  //
  // Ordinary when absent — Kansas City district publishes no SWPA schedule at
  // all — and absent renders nothing rather than an empty chart.
  const todayKey = centralDayKey(now);
  const today = showSchedule
    ? (dam.schedule.find((entry) => entry.scheduleDate === todayKey) ?? null)
    : null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.cardRaised : colors.card },
      ]}
      accessibilityRole="button"
    >
      <View style={styles.columns}>
        <KindMark kind="dam" color={colors.textMuted} />
        <View style={styles.body}>
          <View style={styles.columns}>
            <View style={styles.main}>
              <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                {dam.name}
              </Text>
              <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
                {[dam.lakeName, dam.state].filter(Boolean).join(' · ')}
              </Text>
            </View>
            {release ? (
              <View style={styles.right}>
                <Text style={[styles.release, { color: colors.text }]}>
                  {Math.round(release.value).toLocaleString()} cfs
                </Text>
                <Text style={[styles.meta, { color: colors.textSubtle }]}>
                  {releaseAge ?? 'Observation time unavailable'}
                </Text>
              </View>
            ) : null}
          </View>

          {status ? (
            <View style={styles.stateRow}>
              <ControlIcon
                name={generation.kind === 'unavailable' ? 'help-circle-outline'
                  : generation.kind === 'generating' ? 'flash' : 'flash-off-outline'}
                size={13}
                color={statusColor}
                style={styles.stateIcon}
                allowFontScaling
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              />
              <Text style={[styles.state, { color: statusColor }]}>
                {status}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Its OWN column, beside the state rather than inside it. The star
            belongs to the dam; the chip and the release describe what the dam is
            doing right now, and stacking the two would tie a standing choice to a
            reading that changes every fifteen minutes. Same shape RiverRow uses. */}
        {onToggleStar ? (
          <Pressable
            onPress={onToggleStar}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={starred ? `Unstar ${dam.name}` : `Star ${dam.name}`}
          >
            <ControlIcon
              name={starred ? 'star' : 'star-outline'}
              size={19}
              color={starred ? colors.warm : colors.textSubtle}
            />
          </Pressable>
        ) : null}
      </View>

      {/* A short schedule summary accompanies the bars; exact time windows
          remain on the dam detail screen. */}
      {today ? (
        <View style={styles.schedule}>
          <DayBars reference={dam.generationReference} day={today} compact />
          <Text style={[styles.idle, { color: colors.textMuted }]}>
            {scheduledHoursSummary(today.hours)}
            <Text style={{ color: colors.textSubtle }}> · Subject to change</Text>
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export const DamRow = memo(DamRowComponent);

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 14,
  },
  columns: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  body: { flex: 1, gap: 4 },
  schedule: { marginTop: 8 },
  idle: { ...t.xs, marginTop: 4 },
  main: { flex: 1, gap: 2 },
  name: { ...t.base, fontFamily: fonts.semibold },
  meta: { ...t.xs },
  right: { alignItems: 'flex-end', gap: 2, maxWidth: '48%', flexShrink: 1 },
  stateRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  stateIcon: { lineHeight: t.xs.lineHeight },
  state: { ...t.xs, fontFamily: fonts.semibold, flexShrink: 1 },
  release: { ...t.sm, fontFamily: fonts.heading },
});
