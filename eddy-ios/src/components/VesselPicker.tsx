import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { type FloatBoat } from '@eddy/conditions/float-search';
import { VesselIcon } from './VesselIcon';
import { ControlIcon } from './ControlIcon';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

const VESSELS: FloatBoat[] = ['tube', 'raft', 'kayak', 'canoe'];
const PACE: Record<FloatBoat, { label: string; level: number }> = {
  tube: { label: 'Drifting', level: 1 },
  raft: { label: 'Relaxed', level: 2 },
  kayak: { label: 'Paddling', level: 3 },
  canoe: { label: 'Paddling', level: 3 },
};

export function VesselPicker({
  value,
  onChange,
}: {
  value: FloatBoat;
  onChange: (vessel: FloatBoat) => void;
}) {
  const { colors } = useTheme();
  const { fontScale, width } = useWindowDimensions();
  const columns = fontScale > 1.8 ? 1 : fontScale > 1.15 || width < 360 ? 2 : 4;
  return (
    <View style={styles.group}>
      <View style={styles.options} accessibilityRole="radiogroup" accessibilityLabel="Vessel">
        {VESSELS.map((vessel) => {
          const selected = value === vessel;
          const ink = selected ? colors.selectionText : colors.textMuted;
          return (
            <Pressable
              key={vessel}
              onPress={() => onChange(vessel)}
              accessibilityRole="radio"
              accessibilityLabel={`${vessel[0].toUpperCase() + vessel.slice(1)}, ${PACE[vessel].label.toLowerCase()}`}
              accessibilityState={{ checked: selected }}
              style={({ pressed }) => [
                styles.option,
                {
                  width: columns === 4 ? '23%' : columns === 2 ? '48%' : '100%',
                  backgroundColor: selected ? colors.selectionBg : colors.bg,
                  borderColor: selected ? colors.interactive : colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <VesselIcon vessel={vessel} color={ink} />
              <Text style={[styles.label, { color: ink }]}>{vessel[0].toUpperCase() + vessel.slice(1)}</Text>
              <View style={styles.pace} accessible={false}>
                {[1, 2, 3].map((level) => (
                  <View
                    key={level}
                    style={[
                      styles.paceMark,
                      { backgroundColor: level <= PACE[vessel].level ? ink : colors.border },
                    ]}
                  />
                ))}
              </View>
              <Text style={[t.xs, { color: ink }]}>{PACE[vessel].label}</Text>
              {selected ? (
                <View style={styles.check}>
                  <ControlIcon name="checkmark" size={11} color={ink} />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      <Text style={[t.sm, { color: colors.textMuted }]}>
        Tube and raft trips usually take longer. Canoe and kayak estimates can be similar; current and stops
        also affect your time.
      </Text>
    </View>
  );
}
const styles = StyleSheet.create({
  group: { gap: 10 },
  pace: { flexDirection: 'row', gap: 3 },
  paceMark: { width: 12, height: 4, borderRadius: 2 },
  options: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  option: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 82,
    padding: 10,
    borderWidth: 1,
    borderRadius: 12,
  },
  label: { ...t.sm, fontFamily: fonts.semibold },
  check: { position: 'absolute', top: 5, right: 5 },
});
