import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  demandHeadline,
  type CampingDemand,
  type DemandBand,
} from '@eddy/conditions/camping-demand';
import { campingPulseDetail } from '@/lib/campingDemand';
import { accent, secondary } from '@/theme/palette';
import { useTheme } from '@/theme/ThemeProvider';
import { textStyles } from '@/theme/typography';

// An ordinal Quiet → Packed scale, not a percent axis. The marker is centered
// on the named band; the exact booked percentage is stated separately.
const BANDS: readonly DemandBand[] = ['quiet', 'moderate', 'busy', 'crowded', 'packed'];
const SCALE = [secondary[200], secondary[500], accent[400], accent[600], accent[700]];

export function CampingDemandGauge({
  demand,
  onPress,
}: {
  demand: CampingDemand;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const level = demand.band === null ? null : BANDS.indexOf(demand.band);
  const headline = demandHeadline(demand);
  const detail = campingPulseDetail(demand);
  const checked = demand.checkedDay === 'today'
    ? 'Checked today'
    : demand.checkedDay === 'yesterday'
      ? 'Checked yesterday'
      : demand.checkedDay === 'earlier'
        ? 'Older reading — may be out of date'
        : null;
  const partial = demand.band !== null && !demand.completeCoverage;
  const note = [
    demand.band !== null && demand.checkedDay !== 'today' ? checked : null,
    partial ? 'Partial coverage' : null,
  ].filter(Boolean).join(' · ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={['Ozarks camping tonight', headline, detail, note || checked].filter(Boolean).join('. ')}
      accessibilityHint="Opens the full campground availability grid"
      style={styles.summary}
    >
      <Text style={[textStyles.caption, styles.centered, { color: colors.textMuted }]}>
        Across the Ozarks · Tonight
      </Text>
      <Text style={[textStyles.pageTitle, styles.centered, { color: colors.text }]}>
        {headline}
      </Text>
      <Text style={[textStyles.caption, styles.centered, { color: colors.textMuted }]}>
        {detail}
      </Text>
      {/* The spoken label above carries the result; the gauge is decorative.
          Unknown data has a neutral track and no marker, never a Quiet dot. */}
      <View
        style={styles.gauge}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View style={styles.track}>
          {BANDS.map((band, index) => (
            <View
              key={band}
              style={[
                styles.segment,
                { backgroundColor: level === null ? colors.border : SCALE[index] },
              ]}
            />
          ))}
        </View>
        {level !== null ? (
          <View
            style={[
              styles.marker,
              {
                left: `${((level + 0.5) / BANDS.length) * 100}%`,
                backgroundColor: colors.text,
                borderColor: colors.card,
              },
            ]}
          />
        ) : null}
        <View style={styles.labels}>
          <Text style={[textStyles.caption, { color: colors.textMuted }]}>Quiet</Text>
          <Text style={[textStyles.caption, { color: colors.textMuted }]}>Packed</Text>
        </View>
      </View>
      {note ? (
        <Text style={[textStyles.caption, styles.centered, { color: colors.textSubtle }]}>
          {note}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  summary: { gap: 4, paddingVertical: 4, minHeight: 44 },
  centered: { textAlign: 'center' },
  gauge: { marginTop: 8, paddingTop: 4 },
  track: { flexDirection: 'row', gap: 3, height: 14, borderRadius: 7, overflow: 'hidden' },
  segment: { flex: 1 },
  marker: { position: 'absolute', top: 0, width: 22, height: 22, borderRadius: 11, borderWidth: 3, marginLeft: -11 },
  labels: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, marginTop: 6 },
});
