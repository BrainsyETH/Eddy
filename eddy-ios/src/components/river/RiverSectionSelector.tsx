import { Pressable, StyleSheet, Text, View } from 'react-native';
import { riverSectionLabel } from '@eddy/conditions/river-section-label';
import { ControlIcon } from '@/components/ControlIcon';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

export function RiverSectionSelector({ sections, selectedSlug, onSelect }: {
  sections: { sectionSlug: string; name: string }[];
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.selector}>
      <Text accessibilityRole="header" style={[styles.legend, { color: colors.text }]}>Choose your section</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="River section" style={styles.options}>
        {sections.map(section => {
          const selected = section.sectionSlug === selectedSlug;
          const label = riverSectionLabel(section);
          return (
            <Pressable key={section.sectionSlug} accessibilityRole="radio"
              accessibilityState={{ checked: selected }} accessibilityLabel={`${label.title}, ${label.subtitle}`}
              accessibilityHint="Updates the readings, chart and Eddy’s Read."
              onPress={() => onSelect(section.sectionSlug)}
              style={({ pressed }) => [styles.option, { backgroundColor: selected ? colors.selectionBg : colors.card,
                borderColor: selected ? colors.interactive : colors.borderStrong, opacity: pressed ? 0.7 : 1 }]}>
              <ControlIcon name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? colors.interactive : colors.textMuted} />
              <View style={styles.copy}>
                <Text style={[styles.title, { color: colors.text }]}>{label.title}</Text>
                {label.subtitle ? <Text style={[styles.subtitle, { color: colors.textMuted }]}>{label.subtitle}</Text> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  selector: { gap: 8, marginBottom: 14 },
  legend: { ...t.sm, fontFamily: fonts.semibold },
  options: { gap: 8 },
  option: { minHeight: 72, borderRadius: 12, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  copy: { flex: 1, gap: 3 },
  title: { ...t.base, fontFamily: fonts.semibold },
  subtitle: { ...t.sm, fontFamily: fonts.body },
});
