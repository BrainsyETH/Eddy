import { StyleSheet, View } from 'react-native';
import { BAND_CUTOFFS, type CampingDemand } from '@eddy/conditions/camping-demand';
import { campingPulseReading } from '@/lib/campingDemand';
import { useTheme } from '@/theme/ThemeProvider';
import { campingMeterColor } from '@/theme/campingDemand';

const TICKS = [BAND_CUTOFFS.moderate, BAND_CUTOFFS.busy, BAND_CUTOFFS.crowded];

/** Every meter shares a 0–100% axis. Its labeled parent supplies VoiceOver. */
export function CampingDemandMeter({ demand, ticks = false }: {
  demand: CampingDemand;
  ticks?: boolean;
}) {
  const { colors } = useTheme();
  const reading = campingPulseReading(demand);
  // An unavailable reading must not resemble a measured zero.
  if (!reading || demand.band === null) return null;
  return (
    <View
      style={[styles.track, { backgroundColor: colors.selectionBg }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={[styles.fill, {
        width: `${reading.percent}%`,
        backgroundColor: campingMeterColor(demand.band, colors.scheme),
      }]} />
      {ticks ? TICKS.map((cutoff) => (
        <View
          key={cutoff}
          style={[styles.tick, { left: `${cutoff * 100}%`, backgroundColor: colors.card }]}
        />
      )) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 8, borderRadius: 4, overflow: 'hidden', width: '100%' },
  fill: { height: '100%', borderRadius: 4 },
  tick: { position: 'absolute', top: 0, bottom: 0, width: 1 },
});
