import { StyleSheet, Text, View } from 'react-native';
import { type CampingDemand } from '@eddy/conditions/camping-demand';
import { campingPulseHeadline, campingPulseWithheldNote, campingPulseAccessibilityLabel, campingPulseFcfsNote } from '@/lib/campingDemand';
import { CampingDemandMeter } from './CampingDemandMeter';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, textStyles } from '@/theme/typography';

export function CampingDemandGauge({ demand, now }: { demand: CampingDemand; now: number }) {
  const { colors } = useTheme();
  const headline = campingPulseHeadline(demand);
  const fcfsNote = campingPulseFcfsNote(demand);
  const label = campingPulseAccessibilityLabel(demand, 'Ozarks', now);

  // No reading tonight: one quiet line, so the rivers below stay the content.
  if (headline === null) {
    return (
      <View accessible accessibilityLabel={label} style={styles.summary}>
        <Text style={[textStyles.caption, { color: colors.textMuted }]}>
          {campingPulseWithheldNote(demand)}
        </Text>
      </View>
    );
  }

  return (
    <View accessible accessibilityLabel={label} style={styles.summary}>
      <Text style={[styles.headline, { color: colors.text }]}>{headline}.</Text>
      {fcfsNote ? (
        <Text style={[textStyles.caption, { color: colors.textMuted }]}>{fcfsNote}</Text>
      ) : null}
      <View style={styles.meter}>
        <CampingDemandMeter demand={demand} ticks />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { gap: 4, paddingVertical: 4 },
  headline: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 28 },
  meter: { marginTop: 6, marginBottom: 2 },
});
