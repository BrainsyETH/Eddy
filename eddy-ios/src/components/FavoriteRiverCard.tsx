// A favorite river leads with its name and each linked station's reading pill.
// The river headline and scale remain a fallback until the gauge catalog arrives.

import { radii } from '@/theme/layout';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ControlIcon } from '@/components/ControlIcon';
import type { MapGauge, RiverListItem } from '@eddy/types';
import {
  conditionColor,
  conditionLongLabel,
  conditionText,
} from '@/theme/conditions';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { KindMark } from '@/components/KindMark';
import { Otter, otterForCondition } from '@/components/Otter';
import { ReadingScale } from '@/components/ReadingScale';
import { FavoriteRiverGauges } from '@/components/FavoriteRiverGauges';
import type { FavoriteGaugeReading } from '@/lib/favoriteGaugeReadings';
import { damControlledLabel, formatReading, primaryReading, readingAge } from '@/lib/readingCopy';
import { TREND_ICON } from '@/components/TrendPill';

/**
 * One river's row out of a gauge's `thresholds` array.
 *
 * Derived from MapGauge rather than restated, so this cannot drift from what
 * /api/gauges actually sends — and so ReadingScale, which takes the same shape,
 * keeps type-checking against it.
 */
export type GaugeThresholds = NonNullable<MapGauge['thresholds']>[number];

interface Props {
  river: RiverListItem;
  gaugeReadings: FavoriteGaugeReading[];
  onOpenGauge: (gauge: MapGauge) => void;
  /**
   * The ladder this river's reading is graded on, from its primary gauge.
   *
   * Null is ORDINARY, not a failure: a river with no gauge has none, and
   * /api/gauges may simply not have landed yet. The card renders without it.
   */
  thresholds: GaugeThresholds | null;
  /** The station behind the fallback headline, when its identity is known. */
  gaugeName?: string | null;
  onPress: () => void;
  onToggleStar: () => void;
}

function FavoriteRiverCardComponent({
  river,
  gaugeReadings,
  onOpenGauge,
  thresholds,
  gaugeName = null,
  onPress,
  onToggleStar,
}: Props) {
  const { colors, elevation, isDark } = useTheme();

  const condition = river.currentCondition;
  const code = condition?.code ?? 'unknown';
  // Returns null when there is no gauge AND when the rated unit's reading is
  // missing — both are ordinary, and neither may be papered over with the other
  // unit's number. See primaryReading.
  const reading = condition ? primaryReading(condition) : null;
  const trend = condition?.trend ?? null;
  const age = readingAge(condition?.readingAgeHours);

  return (
    <View style={[styles.card, { backgroundColor: colors.card }, elevation(1)]}>
      {/* The same 4pt condition stripe every other list in the app uses, so a
          favourite and a search result are obviously the same kind of object. */}
      <View style={[styles.stripe, { backgroundColor: conditionColor(code) }]} />

      <View style={styles.body}>
        <View style={styles.head}>
          <Pressable
            onPress={onPress}
            style={({ pressed }) => [styles.headMain, { opacity: pressed ? 0.6 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={[
              river.name,
              !gaugeReadings.length ? damControlledLabel(river.riverType, code) ?? condition?.label ?? conditionLongLabel(code) : null,
              !gaugeReadings.length ? reading ? formatReading(reading.value, reading.unit) : 'no gauge reading' : null,
              !gaugeReadings.length ? trend?.label : null,
              !gaugeReadings.length && gaugeName && reading ? `via ${gaugeName}` : null,
            ]
              .filter(Boolean)
              .join(', ')}
          >
            {/* THE KIND, drawn. GaugeRow and DamRow have carried a KindMark
                since they shipped; this card had none, so in a Favorites list
                holding all three the river was the one row you had to read to
                identify. The mark is the same one the Today tab and the search
                results use, so a river looks like a river everywhere. */}
            <View style={styles.nameRow}>
              <KindMark kind="river" color={colors.textMuted} />
              <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                {river.name}
              </Text>
            </View>
          </Pressable>

          {/* A SIBLING of the navigation target, never a child — the same
              arrangement RiverRow settled on so the two touch areas cannot
              overlap and a tap near the star cannot be ambiguous. */}
          <Pressable
            onPress={onToggleStar}
            style={({ pressed }) => [styles.starColumn, { opacity: pressed ? 0.5 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${river.name} from favorites`}
          >
            <ControlIcon name="star" size={21} color={colors.warm} />
          </Pressable>
        </View>

        {gaugeReadings.length ? (
          <FavoriteRiverGauges readings={gaugeReadings} onOpenGauge={onOpenGauge} />
        ) : (
          <>
            <Pressable
              onPress={onPress}
              style={({ pressed }) => [styles.reading, { opacity: pressed ? 0.6 : 1 }]}
              accessible={false}
            >
              <Otter mood={otterForCondition(code)} size={44} />
              <View style={styles.readingText}>
                <Text
                  style={[
                    styles.readingValue,
                    // "No gauge reading" is not a condition, so it stays neutral:
                    // painting it in the unknown grey would imply the grey was
                    // measured.
                    { color: reading ? conditionText(code, isDark) : colors.textSubtle },
                  ]}
                  numberOfLines={1}
                >
                  {reading ? formatReading(reading.value, reading.unit) : 'No gauge reading'}
                </Text>
                <View style={styles.meta}>
                  {trend ? (
                    <>
                      {/* Muted ink, never green-for-rising: on a river approaching
                          flood, "rising fast" is the opposite of good news. The
                          reading colour carries the verdict. */}
                      <ControlIcon
                        name={TREND_ICON[trend.direction]}
                        size={12}
                        color={colors.textMuted}
                      />
                      <Text style={[styles.metaText, { color: colors.textMuted }]} numberOfLines={1}>
                        {trend.label}
                      </Text>
                    </>
                  ) : null}
                  {age ? (
                    <Text style={[styles.metaText, { color: colors.textSubtle }]} numberOfLines={1}>
                      {trend ? '· ' : ''}
                      {age}
                    </Text>
                  ) : null}
                </View>
                {/* Under the number it qualifies, in the subtle role — this is
                    attribution, not a second reading. Only when the reading it
                    would attribute actually exists: "via Meramec at Eureka" over
                    "No gauge reading" would be attributing nothing to somewhere. */}
                {gaugeName && reading ? (
                  <Text style={[styles.metaText, { color: colors.textSubtle }]} numberOfLines={1}>
                    via {gaugeName}
                  </Text>
                ) : null}
              </View>
            </Pressable>

            {/* The fallback scale must use the same unit as its headline. */}
            {thresholds && reading && thresholds.thresholdUnit === reading.unit ? (
              <View style={styles.scale}>
                <ReadingScale thresholds={thresholds} value={reading.value} unit={reading.unit} />
              </View>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

export const FavoriteRiverCard = memo(FavoriteRiverCardComponent);

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: radii.card,
    overflow: 'hidden',
  },
  stripe: { width: 4 },
  body: { flex: 1, minWidth: 0, paddingVertical: 12, paddingLeft: 13, paddingRight: 4 },
  head: { flexDirection: 'row', alignItems: 'flex-start' },
  headMain: { flex: 1, minWidth: 0, minHeight: 44, justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  name: { ...t.base, fontFamily: fonts.semibold, flexShrink: 1 },
  // 52pt wide and full height on the star, comfortably past the 44pt minimum
  // without borrowing space from its neighbour via hitSlop.
  starColumn: { width: 52, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  reading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, paddingRight: 8 },
  readingText: { flex: 1, minWidth: 0 },
  // Mono is functional, not decorative: proportional digits change width as the
  // number ticks, which would shift this card on every refresh.
  readingValue: { ...t.xl, fontFamily: fonts.mono },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  metaText: { ...t.xs, fontFamily: fonts.body },
  // Right padding matches the reading row above so the track's flood end lines
  // up with the number rather than running under the star column.
  scale: { marginTop: 12, paddingRight: 8 },
});
