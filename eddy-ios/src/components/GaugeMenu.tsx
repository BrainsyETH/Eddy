import { MenuView } from '@react-native-menu/menu';
import { StyleSheet, Text, View } from 'react-native';
import { ControlIcon } from './ControlIcon';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { gaugeMenuSubtitle, type GaugeMenuOption } from '@/lib/gaugeMenu';

/** A tap opens a native selection menu; choosing never navigates away. */
export function GaugeMenu({ options, selectedId, onSelect }: {
  options: GaugeMenuOption[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const { colors, isDark } = useTheme();
  // A selection outside the list (no primary flagged for this river, or an
  // arrival gauge from elsewhere) still gets the menu, with nothing checked:
  // hiding it would take away the only way to switch gauges.
  const selected = options.find(option => option.id === selectedId);
  if (options.length < 2) return null;
  const label = selected ? `Gauge: ${selected.name}` : 'Choose a gauge';
  return (
    <MenuView
      title="Gauges on this river"
      shouldOpenOnLongPress={false}
      themeVariant={isDark ? 'dark' : 'light'}
      actions={options.map(option => ({
        id: option.id, title: option.name, subtitle: gaugeMenuSubtitle(option),
        state: option.id === selectedId ? 'on' : 'off',
        attributes: { disabled: option.disabled === true },
      }))}
      onPressAction={({ nativeEvent }) => {
        if (options.some(option => option.id === nativeEvent.event && !option.disabled)) onSelect(nativeEvent.event);
      }}
    >
      <View
        style={styles.control}
        accessible accessibilityRole="button"
        accessibilityLabel={`${label}. ${options.length} gauges`}
        accessibilityHint="Opens gauge choices. Selecting updates the reading here."
      >
        <Text style={[styles.name, { color: colors.interactive }]} numberOfLines={1}>{label}</Text>
        <ControlIcon name="chevron-down" size={14} color={colors.interactive} />
        <Text style={[styles.count, { color: colors.textMuted }]}>{options.length} gauges</Text>
      </View>
    </MenuView>
  );
}
const styles = StyleSheet.create({
  control: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { ...t.sm, fontFamily: fonts.semibold, flexShrink: 1 },
  count: { ...t.xs, fontFamily: fonts.body, marginLeft: 4 },
});
