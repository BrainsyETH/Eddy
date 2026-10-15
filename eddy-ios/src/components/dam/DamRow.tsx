// eddy-ios/src/components/dam/DamRow.tsx
// One USACE project in a list.
//
// Leads with generating state rather than a release number, because that is the
// fact a wading angler acts on and the number is context for it. A dam that
// publishes no turbine flow says neither — Kansas City district posts nothing
// to CWMS, and "Not generating" for those would be an observation nobody made.
//
// The state chip takes its colour from `accent`, never conditionColor():
// generating is a fact about machinery, not a verdict about whether a river is
// floatable, and borrowing that palette would make the app appear to have
// issued a call it has not.

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
      <View style={styles.topRow}>
        <KindMark kind="dam" color={colors.textMuted} />
        <View style={styles.main}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {dam.name}
          </Text>
          <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
            {[
              dam.lakeName,
              dam.state,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>

        <View style={styles.right}>
          {status ? (
            <View style={styles.stateRow}>
              <ControlIcon
                name={generation.kind === 'unavailable' ? 'help-circle-outline'
                  : generation.kind === 'generating' ? 'flash' : 'flash-off-outline'}
                size={13}
                color={generatingNow ? colors.interactive : colors.textSubtle}
              />
              <Text
                style={[
                  styles.state,
                  { color: generatingNow ? colors.interactive : colors.textSubtle },
                ]}
              >
                {status}
              </Text>
            </View>
          ) : null}
          {release ? (
            <>
              <Text style={[styles.release, { color: colors.text }]}>
                {Math.round(release.value).toLocaleString()} cfs
              </Text>
              <Text style={[styles.meta, { color: colors.textSubtle }]}>
                {releaseAge ?? 'Observation time unavailable'}
              </Text>
            </>
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
          <Text style={[styles.idle, { color: colors.textMuted }]} numberOfLines={1}>
            {scheduledHoursSummary(today.hours)}
          </Text>
          <Text style={[styles.scheduleNote, { color: colors.textSubtle }]}>
            Subject to change
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export const DamRow = memo(DamRowComponent);

const styles = StyleSheet.create({
  // A column now, so a schedule can sit under the row rather than beside it.
  // The horizontal line that WAS this style is `topRow`; nothing about its
  // layout changed, so a row without a schedule renders identically.
  row: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 14,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  schedule: { marginTop: 8 },
  idle: { ...t.xs, marginTop: 4 },
  scheduleNote: { ...t.xs, marginTop: 2 },
  main: { flex: 1, gap: 2 },
  name: { ...t.base, fontFamily: fonts.semibold },
  meta: { ...t.xs },
  right: { alignItems: 'flex-end', gap: 2, maxWidth: '48%', flexShrink: 1 },
  stateRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  state: { ...t.xs, fontFamily: fonts.semibold, flexShrink: 1, textAlign: 'right' },
  release: { ...t.sm, fontFamily: fonts.heading },
});
