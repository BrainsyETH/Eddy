import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  demandHeadline,
  type CampingDemand,
  type DemandBand,
} from '@eddy/conditions/camping-demand';
import { campingPulseDetail, campingPulseCoverage } from '@/lib/campingDemand';
import { CAMPING_BAND_STYLES } from '@/theme/campingDemand';
import { CampingDemandPills } from './CampingDemandPills';
import { useTheme } from '@/theme/ThemeProvider';
import { textStyles } from '@/theme/typography';

// An ordinal Quiet → Packed scale, not a percent axis. The marker is centered
// on the named band; the exact booked percentage is stated separately.
const BANDS: readonly DemandBand[] = ['quiet', 'moderate', 'busy', 'crowded', 'packed'];

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
  const note = [
    demand.band !== null && demand.checkedDay !== 'today' ? checked : null,
    campingPulseCoverage(demand),
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
      <CampingDemandPills demand={demand} centered />
      {demand.band === null ? (
        <Text style={[textStyles.caption, styles.centered, { color: colors.textMuted }]}>{detail}</Text>
      ) : null}
      {/* The spoken label above carries the result; the gauge is decorative.
          Unknown data has a neutral track and no marker, never a Quiet dot. */}
      <View
        style={styles.gauge}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View style={styles.track}>
          {BANDS.map((band) => (
            <View
              key={band}
              style={[
                styles.segment,
                { backgroundColor: level === null ? colors.border : CAMPING_BAND_STYLES[band].scale },
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
      {demand.band !== null && demand.checkedDay !== 'today' && checked ? (
        <Text style={[textStyles.caption, styles.centered, { color: colors.textSubtle }]}>
          {checked}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  summary: { gap: 4, paddingVertical: 4, minHeight: 44 },
  centered: { textAlign: 'center' },
  gauge: { marginTop: 6, paddingTop: 4 },
  track: { flexDirection: 'row', gap: 3, height: 10, borderRadius: 5, overflow: 'hidden' },
  segment: { flex: 1 },
  marker: { position: 'absolute', top: 0, width: 18, height: 18, borderRadius: 9, borderWidth: 3, marginLeft: -9 },
  labels: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, marginTop: 6 },
});
