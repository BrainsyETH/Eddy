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

import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RiverListItem } from '@eddy/types';
import { conditionColor, conditionInk, conditionLabel } from '@/theme/conditions';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { formatReading, primaryReading } from '@/lib/readingCopy';

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
}

function RiverRowComponent({
  river,
  starred,
  onPress,
  onToggleStar,
  starDisabled = false,
}: RiverRowProps) {
  const { colors, elevation } = useTheme();

  const condition = river.currentCondition;
  const code = condition?.code ?? 'unknown';
  // Returns null when there is no gauge, and ALSO when the declared unit's
  // reading is missing. Both are ordinary states and both must render as
  // "No gauge reading" rather than a zero or a dash.
  const reading = condition ? primaryReading(condition) : null;
  const trend = condition?.trend ?? null;
  const age = shortAge(condition?.readingAgeHours);

  const readingText = reading ? formatReading(reading.value, reading.unit) : 'No gauge reading';

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
          <Text style={[styles.conditionWord, { color: conditionInk(code) }]}>
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
              { color: reading ? colors.text : colors.textSubtle },
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

        <Text style={[styles.meta, { color: colors.textSubtle }]} numberOfLines={1}>
          {[
            river.region ?? river.state,
            `${river.accessPointCount} access points`,
            age,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
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
