import { StyleSheet, Text, View } from 'react-native';
import { type CampingDemand } from '@eddy/conditions/camping-demand';
import { campingPulseHeadline, campingPulseDetail, campingPulseAccessibilityLabel, campingPulseFcfsNote } from '@/lib/campingDemand';
import { CampingDemandMeter } from './CampingDemandMeter';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, textStyles } from '@/theme/typography';

export function CampingDemandGauge({ demand, now }: { demand: CampingDemand; now: number }) {
  const { colors } = useTheme();
  const headline = campingPulseHeadline(demand);
  const fcfsNote = campingPulseFcfsNote(demand);

  return (
    <View
      accessible
      accessibilityLabel={campingPulseAccessibilityLabel(demand, 'Ozarks', now)}
      style={styles.summary}
    >
      <Text style={[styles.headline, { color: colors.text }]}>{headline}{demand.band !== null ? '.' : ''}</Text>
      {fcfsNote ? (
        <Text style={[textStyles.caption, { color: colors.textMuted }]}>{fcfsNote}</Text>
      ) : null}
      {demand.band === null ? (
        <Text style={[textStyles.caption, { color: colors.textMuted }]}>{campingPulseDetail(demand)}</Text>
      ) : null}
      {demand.band !== null ? (
        <View style={styles.meter}>
          <CampingDemandMeter demand={demand} ticks />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { gap: 4, paddingVertical: 4 },
  headline: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 28 },
  meter: { marginTop: 6, marginBottom: 2 },
});
