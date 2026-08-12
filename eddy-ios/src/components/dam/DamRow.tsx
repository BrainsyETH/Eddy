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
import { Ionicons } from '@expo/vector-icons';
import type { DamSnapshot } from '@eddy/types';
import { idleWindowSentence } from '@eddy/conditions/dam-schedule-copy';
import { DayBars } from '@/components/dam/DayBars';
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
   * Costs no request either way: /api/dams already returns one day of schedule
   * per dam, and the Favorites screen already fetches it.
   */
  showSchedule?: boolean;
}) {
  const { colors } = useTheme();
  const release = dam.metrics.release;

  // Ordinary when absent — Kansas City district publishes no SWPA schedule at
  // all — and absent renders nothing rather than an empty chart.
  const today = showSchedule ? (dam.schedule[0] ?? null) : null;

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
              dam.tailwaterFishery === 'trout' ? 'trout tailwater' : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>

        <View style={styles.right}>
          {dam.generating !== null ? (
            <View style={styles.stateRow}>
              <Ionicons
                name={dam.generating ? 'flash' : 'flash-off-outline'}
                size={13}
                color={dam.generating ? colors.interactive : colors.textSubtle}
              />
              <Text
                style={[
                  styles.state,
                  { color: dam.generating ? colors.interactive : colors.textSubtle },
                ]}
              >
                {dam.generating ? 'Generating' : 'Idle'}
              </Text>
            </View>
          ) : null}
          {release ? (
            <Text style={[styles.release, { color: colors.text }]}>
              {Math.round(release.value).toLocaleString()} cfs
            </Text>
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
            <Ionicons
              name={starred ? 'star' : 'star-outline'}
              size={19}
              color={starred ? colors.warm : colors.textSubtle}
            />
          </Pressable>
        ) : null}
      </View>

      {/* Today's shape, and the sentence that says what it means.
          The bars are the same component the dam screen draws, so a pattern
          learned there is readable here. The idle-window sentence carries it for
          VoiceOver, which the bar row is deliberately hidden from — and it is
          the more useful of the two anyway: "Generation off: midnight – 6 AM" is
          the answer, the bars are the picture of it. */}
      {today ? (
        <View style={styles.schedule}>
          <DayBars day={today} compact />
          <Text style={[styles.idle, { color: colors.textMuted }]} numberOfLines={1}>
            {idleWindowSentence(today.idle)}
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
  main: { flex: 1, gap: 2 },
  name: { ...t.base, fontFamily: fonts.semibold },
  meta: { ...t.xs },
  right: { alignItems: 'flex-end', gap: 2 },
  stateRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  state: { ...t.xs, fontFamily: fonts.semibold },
  release: { ...t.sm, fontFamily: fonts.heading },
});
