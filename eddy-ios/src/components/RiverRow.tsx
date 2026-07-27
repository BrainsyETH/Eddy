// eddy-ios/src/components/RiverRow.tsx
// One river in a list: the name, the number, which way it's going, and how old
// it is. Shared by River Reports and Favorites so the two lists cannot drift.
//
// This exists because the app previously showed a river's STATE everywhere and
// its NUMBER nowhere. A row carrying a dot, a name, a pill and a star spends
// four elements on one bit of information, and every "Good" river looks equally
// good. A paddler decides on "944 cfs and holding steady".
//
// Two rules this component is built around:
//
//   1. THE UNIT IS NOT A PREFERENCE. It comes from the river's thresholds, via
//      primaryReading(), which refuses to fall back across units. 18 of 24
//      active rivers are rated in cfs, so anything that assumes feet is wrong
//      most of the time. Never format a reading by hand here.
//
//   2. DIRECTION IS NOT A VERDICT. The trend is drawn in muted ink, never in
//      green-for-rising: on a river approaching flood, "rising fast" is the
//      opposite of good news. The condition stripe and label carry the verdict.
//
//   3. THE READING WEARS THE CONDITION'S COLOUR. "944 cfs" and the word beside
//      the name are the same fact stated twice, so they are drawn in the same
//      ink — the number is the thing people read, and leaving it in neutral
//      text made the colour a decoration on the row rather than a property of
//      the measurement. conditionText() resolves that ink per scheme; see the
//      note there for why neither `solid` nor `ink` works alone.

import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RiverListItem } from '@eddy/types';
import { conditionColor, conditionLabel, conditionText } from '@/theme/conditions';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { allReadings, formatReading, primaryReading } from '@/lib/readingCopy';

/** Compact age for a row — the detail screen owns the long-form phrasing. */
function shortAge(hours: number | null | undefined): string | null {
  if (hours == null || !Number.isFinite(hours) || hours < 0) return null;
  if (hours < 1) return 'just now';
  if (hours < 24) return `${Math.round(hours)}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

const TREND_ICON = {
  rising: 'arrow-up' as const,
  falling: 'arrow-down' as const,
  steady: 'remove' as const,
};

interface RiverRowProps {
  river: RiverListItem;
  starred: boolean;
  onPress: () => void;
  onToggleStar: () => void;
  /** Disables only the star, never navigation — the store loads independently. */
  starDisabled?: boolean;
  /**
   * Straight-line miles to this river's gauge, when the list is sorted by
   * distance. Never a drive time, and the screen that sets it says so — an
   * Ozark river forty miles off can be ninety minutes of two-lane.
   */
  distanceMiles?: number | null;
  /**
   * Show BOTH published readings — stage and discharge — rather than only the
   * rated one. Off by default: the row's headline is deliberately a single
   * number, and two numbers on every row is the state this component was
   * written to get away from. The Search tab turns it on so a gauge can be
   * read and sorted properly.
   */
  showGauge?: boolean;
}

function RiverRowComponent({
  river,
  starred,
  onPress,
  onToggleStar,
  starDisabled = false,
  distanceMiles = null,
  showGauge = false,
}: RiverRowProps) {
  const { colors, elevation, isDark } = useTheme();

  const condition = river.currentCondition;
  const code = condition?.code ?? 'unknown';
  // Returns null when there is no gauge, and ALSO when the declared unit's
  // reading is missing. Both are ordinary states and both must render as
  // "No gauge reading" rather than a zero or a dash.
  const reading = condition ? primaryReading(condition) : null;
  const trend = condition?.trend ?? null;
  const age = shortAge(condition?.readingAgeHours);

  const readingText = reading ? formatReading(reading.value, reading.unit) : 'No gauge reading';

  // Both published values, rated one first. Only interesting when the gauge
  // actually reported two — a single value is already the headline above, and
  // repeating it under itself says nothing.
  const gaugeReadings = showGauge && condition ? allReadings(condition) : [];
  const showBoth = gaugeReadings.length > 1;

  return (
    <View
      style={[styles.row, { backgroundColor: colors.card }, elevation(1)]}
      // The stripe is decorative; the label word beside the name carries the
      // same meaning in text, so colour is never the only cue.
      accessible={false}
    >
      <View style={[styles.stripe, { backgroundColor: conditionColor(code) }]} />

      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.main, { opacity: pressed ? 0.6 : 1 }]}
        accessibilityRole="button"
        accessibilityLabel={[
          river.name,
          condition?.label ?? conditionLabel(code),
          reading ? readingText : 'no gauge reading',
          trend?.label,
          age ? `updated ${age}` : null,
        ]
          .filter(Boolean)
          .join(', ')}
      >
        <View style={styles.titleLine}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {river.name}
          </Text>
          <Text style={[styles.conditionWord, { color: conditionText(code, isDark) }]}>
            {condition?.label ?? conditionLabel(code)}
          </Text>
        </View>

        {/* The reading owns this line. `shrink` on the trend rather than the
            number: a five-digit discharge in flood must never be the thing that
            gets truncated. */}
        <View style={styles.readingLine}>
          <Text
            style={[
              styles.reading,
              // No reading is not a condition, so it stays neutral: painting
              // "No gauge reading" in the unknown grey would imply the grey was
              // measured.
              { color: reading ? conditionText(code, isDark) : colors.textSubtle },
            ]}
            numberOfLines={1}
          >
            {readingText}
          </Text>
          {trend ? (
            <View style={styles.trend}>
              <Ionicons name={TREND_ICON[trend.direction]} size={13} color={colors.textMuted} />
              <Text style={[styles.trendText, { color: colors.textMuted }]} numberOfLines={1}>
                {trend.label}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Reading age, and — only when the list is sorted by distance — how
            far away it is. The region and the access-point count used to sit
            here too, and neither survives the question "would this change which
            river I drive to?" — every Ozark river is in the Ozarks, and a count
            of put-ins says nothing about the water. Distance does survive it,
            which is exactly why it earns the space the other two lost.

            The "≈" is not decoration: this is a straight line to the river's
            gauge, not a drive. */}
        {/* The gauge card: every number this station published, each stating
            its own unit, with a "rated" tag on the one the condition colour was
            computed from. That tag is the whole point of showing two — 18 of 24
            rivers are graded on cfs, so a reader who assumes the feet figure
            drove the verdict is wrong most of the time. Neutral ink, unlike the
            headline: only the rated number carries the verdict. */}
        {showBoth ? (
          <View style={[styles.gaugeCard, { backgroundColor: colors.bg }]}>
            {gaugeReadings.map((r) => (
              <View key={r.unit} style={styles.gaugeItem}>
                <Text style={[styles.gaugeValue, { color: colors.text }]} numberOfLines={1}>
                  {formatReading(r.value, r.unit)}
                </Text>
                {r.rated ? (
                  <Text style={[styles.gaugeTag, { color: conditionText(code, isDark) }]}>
                    rated
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {age || distanceMiles != null ? (
          <Text style={[styles.meta, { color: colors.textSubtle }]} numberOfLines={1}>
            {[
              distanceMiles != null ? `≈${Math.round(distanceMiles)} mi away` : null,
              age,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        ) : null}
      </Pressable>

      {/* A SIBLING of the navigation Pressable, not a child of it. The previous
          row nested the star inside the row's own Pressable and grew it with
          hitSlop, so the two touch areas overlapped and a tap near the star was
          ambiguous. A full-height column of its own cannot collide. */}
      <Pressable
        onPress={onToggleStar}
        disabled={starDisabled}
        style={({ pressed }) => [styles.starColumn, { opacity: pressed ? 0.5 : 1 }]}
        accessibilityRole="button"
        accessibilityLabel={starred ? `Unstar ${river.name}` : `Star ${river.name}`}
      >
        <Ionicons
          name={starred ? 'star' : 'star-outline'}
          size={21}
          color={starred ? colors.warm : colors.textSubtle}
        />
      </Pressable>
    </View>
  );
}

export const RiverRow = memo(RiverRowComponent);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginHorizontal: 16,
    marginBottom: 9,
    borderRadius: 14,
    overflow: 'hidden',
  },
  stripe: { width: 4 },
  gaugeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  gaugeItem: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  gaugeValue: { ...t.xs, fontFamily: fonts.mono },
  gaugeTag: { ...t.xs, fontFamily: fonts.semibold, fontSize: 10 },
  main: { flex: 1, minWidth: 0, paddingVertical: 12, paddingLeft: 12, paddingRight: 4 },
  titleLine: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  name: { ...t.base, fontFamily: fonts.semibold, flexShrink: 1 },
  conditionWord: { ...t.xs, fontFamily: fonts.semibold, flexShrink: 0 },
  readingLine: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 3 },
  // Mono is functional, not decorative: proportional digits change width as the
  // number ticks, which would shift this row on every refresh.
  reading: { ...t.lg, fontFamily: fonts.mono, flexShrink: 0 },
  trend: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 1, minWidth: 0 },
  trendText: { ...t.xs, fontFamily: fonts.semibold },
  meta: { ...t.xs, fontFamily: fonts.body, marginTop: 3 },
  // 52pt wide and full height — comfortably past the 44pt minimum without
  // borrowing space from its neighbour via hitSlop.
  starColumn: { width: 52, alignItems: 'center', justifyContent: 'center' },
});
