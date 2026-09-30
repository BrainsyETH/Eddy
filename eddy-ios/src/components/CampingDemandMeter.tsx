import { StyleSheet, View } from 'react-native';
import { BAND_CUTOFFS, type CampingDemand } from '@eddy/conditions/camping-demand';
import { campingPulseReading } from '@/lib/campingDemand';
import { useTheme } from '@/theme/ThemeProvider';

const TICKS = [BAND_CUTOFFS.moderate, BAND_CUTOFFS.busy, BAND_CUTOFFS.crowded];

/** Every meter shares a 0–100% axis. Its labeled parent supplies VoiceOver. */
export function CampingDemandMeter({ demand, ticks = false }: {
  demand: CampingDemand;
  ticks?: boolean;
}) {
  const { colors } = useTheme();
  const reading = campingPulseReading(demand);
  // An unavailable reading must not resemble a measured zero.
  if (!reading) return null;
  return (
    <View
      style={[styles.track, { backgroundColor: colors.border }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={[styles.fill, { width: `${reading.percent}%`, backgroundColor: colors.interactive }]} />
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
  track: { height: 6, borderRadius: 3, overflow: 'hidden', width: '100%' },
  fill: { height: '100%' },
  tick: { position: 'absolute', top: 0, bottom: 0, width: 1 },
});
