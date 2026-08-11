// eddy-ios/src/components/ReferenceGaugeRow.tsx
// One gauge Eddy has NOT rated, in a list.
//
// ── A sibling of GaugeRow, not a mode of it ────────────────────────────────
// GaugeRow speaks conditions: it calls gaugeConditionCode(), paints a
// CONDITION_SYSTEM stripe and prints a word like "Flowing". Every one of those
// is a verdict about floating, and Eddy issues verdicts only about the ~46
// stations a human has rated against a river. Passing a national gauge through
// it — even with the code coming back 'unknown' — would put a reference station
// inside the vocabulary that means "we have graded this", which is the exact
// confusion src/theme/flow.ts exists to prevent.
//
// So this is the second row, in the second vocabulary: a flow band, which is a
// comparison to this station's own history and never permission to float. Same
// relationship GaugeFilterBar has to ConditionFilterBar, and the same reason
// they were not merged.
//
// ── The colour is never the whole message ─────────────────────────────────
// The band label is printed beside the stripe, always. Five steps of one teal
// are not reliably distinguishable on a phone in sunlight, and a station with
// no statistics — the common case nationally — gets a neutral stone that must
// read as "we don't know" rather than as a middling rank.

import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { SearchResultGauge } from '@eddy/types';
import { flowBand } from '@eddy/conditions/flow-band';
import { flowBandColor, flowBandLabel } from '@/theme/flow';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { formatReading, readingAge } from '@/lib/readingCopy';
import { KindMark } from '@/components/KindMark';
import { stationCaption } from '@/lib/gaugeProvider';

interface Props {
  name: string;
  /** The site id, printed because it is how half of these are known. */
  siteId: string | null;
  /** Publisher registry id. Absent on responses from older deployments. */
  provider?: string | null;
  /** Live reading, when the search result carried one. Null is ordinary. */
  reading: SearchResultGauge | null;
  starred: boolean;
  onPress: (() => void) | null;
  /** Null when the row has no station id to star it by. */
  onToggleStar: (() => void) | null;
}

/**
 * The reading, preferring discharge.
 *
 * The opposite preference to GaugeRow's, and deliberately so: there the unit is
 * dictated by the ladder the river is rated in, and here there is no ladder, so
 * discharge wins because it is what the percentile is computed from. The number
 * and the band then describe the same quantity. Same rule as flowReadingText().
 */
function referenceReading(reading: SearchResultGauge | null): string | null {
  if (!reading) return null;
  if (reading.dischargeCfs != null) return formatReading(reading.dischargeCfs, 'cfs');
  if (reading.gaugeHeightFt != null) return formatReading(reading.gaugeHeightFt, 'ft');
  return null;
}

function ReferenceGaugeRowComponent({
  name,
  siteId,
  provider,
  reading,
  starred,
  onPress,
  onToggleStar,
}: Props) {
  const { colors, elevation } = useTheme();

  const band = flowBand(reading?.flowPercentile);
  const value = referenceReading(reading);
  const age = readingAge(reading?.readingAgeHours);
  const meta = [siteId ? stationCaption(provider, siteId) : null, age]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={[styles.row, { backgroundColor: colors.card }, elevation(1)]}>
      {/* The same 4pt stripe as every other row in the app, so a mixed list
          reads as one list — but wearing a BAND colour, which shares no hue
          with any condition. */}
      <View style={[styles.stripe, { backgroundColor: flowBandColor(band) }]} />

      <Pressable
        onPress={onPress ?? undefined}
        disabled={!onPress}
        style={({ pressed }) => [styles.main, { opacity: pressed && onPress ? 0.6 : 1 }]}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={[name, flowBandLabel(band), value ?? 'no reading', age]
          .filter(Boolean)
          .join(', ')}
      >
        <View style={styles.kindMark}>
          <KindMark kind="gauge" color={colors.textMuted} />
        </View>
        <View style={styles.titleLine}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[styles.bandWord, { color: colors.textMuted }]} numberOfLines={1}>
            {flowBandLabel(band)}
          </Text>
        </View>

        <Text
          style={[styles.reading, { color: value ? colors.text : colors.textSubtle }]}
          numberOfLines={1}
        >
          {value ?? 'No gauge reading'}
        </Text>

        {meta ? (
          <Text style={[styles.meta, { color: colors.textSubtle }]} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </Pressable>

      {/* A sibling of the navigation Pressable, never a child — the same
          arrangement RiverRow and GaugeRow both settled on. */}
      {onToggleStar ? (
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
      ) : null}
    </View>
  );
}

export const ReferenceGaugeRow = memo(ReferenceGaugeRowComponent);

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
  main: { flex: 1, paddingVertical: 11, paddingLeft: 41, paddingRight: 4 },
  kindMark: { position: 'absolute', left: 12, top: 14 },
  titleLine: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  name: { ...t.sm, fontFamily: fonts.semibold, flexShrink: 1 },
  bandWord: { ...t.xs, fontFamily: fonts.medium },
  reading: { ...t.lg, fontFamily: fonts.mono, marginTop: 3 },
  meta: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  starColumn: { width: 46, alignItems: 'center', justifyContent: 'center' },
});
