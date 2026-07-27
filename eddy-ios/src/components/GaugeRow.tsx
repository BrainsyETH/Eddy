// eddy-ios/src/components/GaugeRow.tsx
// One starred gauge in the Favorites list.
//
// A SIBLING of RiverRow, not a mode of it. RiverRow takes a RiverListItem and
// builds everything from a river's `currentCondition`; a `kind` branch inside it
// would be the per-entity branch this codebase keeps out of shared components,
// and the two rows genuinely differ — a gauge has no length, no access points
// and no region, and it does have a station name and a site id.
//
// ── The row is the destination ──────────────────────────────────────────────
// There is no gauge detail screen, and inventing one for this would be the wrong
// order of work. Nor can a starred gauge simply open its river: a river screen
// shows its PRIMARY gauge, which may not be the starred one, so tapping "Kelly
// Crossing" and landing on a page about a different station is worse than not
// moving at all. So the row carries what a gauge screen would put above the
// fold — the reading, its age, the condition it grades to — and taps through to
// the river only when it actually rates one, with that river named so the
// destination is not a surprise.
//
// Condition and reading come from gaugeCondition.ts, the SAME functions the map
// pins use, so a gauge cannot read one way here and another as a dot on the map.

import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { MapGauge } from '@eddy/types';
import { conditionColor, conditionLabel, conditionText } from '@/theme/conditions';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { gaugeConditionCode, gaugeReadingText } from '@/lib/gaugeCondition';
import { readingAge } from '@/lib/readingCopy';

interface Props {
  /** Name from the local store, so the row renders before /api/gauges lands. */
  name: string;
  /** The river this gauge rates, when it rates one. */
  riverName?: string | null;
  /** Live data, when it has arrived. Null is an ordinary state, not an error. */
  gauge: MapGauge | null;
  /**
   * Whether this gauge is starred.
   *
   * STATED, not assumed. The row was written for Favorites, where every member
   * is starred by definition and the glyph could be a constant — and then the
   * Search tab started rendering gauges that mostly are not. A star that is
   * always filled is a control that cannot say what it does.
   */
  starred: boolean;
  onPress: (() => void) | null;
  onToggleStar: () => void;
}

function GaugeRowComponent({ name, riverName, gauge, starred, onPress, onToggleStar }: Props) {
  const { colors, elevation, isDark } = useTheme();

  const code = gauge ? gaugeConditionCode(gauge) : 'unknown';
  const reading = gauge ? gaugeReadingText(gauge) : null;
  const age = gauge ? readingAge(gauge.readingAgeHours) : null;

  const meta = [riverName, age].filter(Boolean).join(' · ');

  return (
    <View style={[styles.row, { backgroundColor: colors.card }, elevation(1)]}>
      {/* Same 4pt condition stripe as a river row, so a mixed list reads as one
          list rather than two kinds of thing stacked together. */}
      <View style={[styles.stripe, { backgroundColor: conditionColor(code) }]} />

      <Pressable
        onPress={onPress ?? undefined}
        disabled={!onPress}
        style={({ pressed }) => [styles.main, { opacity: pressed && onPress ? 0.6 : 1 }]}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={[
          name,
          conditionLabel(code),
          reading ?? 'no reading',
          riverName ? `on the ${riverName}` : null,
          age,
        ]
          .filter(Boolean)
          .join(', ')}
      >
        <View style={styles.titleLine}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[styles.conditionWord, { color: conditionText(code, isDark) }]}>
            {conditionLabel(code)}
          </Text>
        </View>

        <Text
          style={[
            styles.reading,
            { color: reading ? conditionText(code, isDark) : colors.textSubtle },
          ]}
          numberOfLines={1}
        >
          {reading ?? 'No gauge reading'}
        </Text>

        {meta ? (
          <Text style={[styles.meta, { color: colors.textSubtle }]} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </Pressable>

      {/* A sibling of the navigation Pressable, never a child — the same
          arrangement RiverRow settled on so the two touch areas cannot overlap. */}
      <Pressable
        onPress={onToggleStar}
        style={({ pressed }) => [styles.starColumn, { opacity: pressed ? 0.5 : 1 }]}
        accessibilityRole="button"
        accessibilityLabel={starred ? `Unstar ${name}` : `Star ${name}`}
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

export const GaugeRow = memo(GaugeRowComponent);

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
  main: { flex: 1, paddingVertical: 11, paddingLeft: 12, paddingRight: 4 },
  titleLine: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  name: { ...t.sm, fontFamily: fonts.semibold, flexShrink: 1 },
  conditionWord: { ...t.xs, fontFamily: fonts.semibold },
  reading: { ...t.lg, fontFamily: fonts.mono, marginTop: 3 },
  meta: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  starColumn: { width: 46, alignItems: 'center', justifyContent: 'center' },
});
