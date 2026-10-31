import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { MenuView } from '@react-native-menu/menu';
import { FLOAT_BOATS, type FloatBoat } from '@eddy/conditions/float-search';
import { ControlIcon } from '@/components/ControlIcon';
import { VesselIcon } from '@/components/VesselIcon';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

/** Shared by route discovery and readiness; the native menu owns selection and dismissal. */
export function VesselPicker({ value, onChange, disabled = false }: {
  value: FloatBoat;
  onChange: (value: FloatBoat) => void;
  disabled?: boolean;
}) {
  const { colors, isDark } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale > 1.3;
  const label = value[0].toUpperCase() + value.slice(1);
  const row = (
    <View
      accessible
      accessibilityRole="button"
      accessibilityLabel={`Vessel, ${label}`}
      accessibilityHint="Choose a vessel to help estimate your float time"
      accessibilityState={{ disabled }}
      style={[local.row, stacked && local.stacked, { opacity: disabled ? 0.5 : 1 }]}
    >
      <View style={[local.copy, stacked && local.stackedCopy]}>
        <Text style={[local.label, { color: colors.text }]}>Vessel</Text>
      </View>
      <View style={local.selection}>
        <VesselIcon vessel={value} size={30} color={colors.interactive} />
        <Text style={[local.value, { color: colors.interactive }]}>{label}</Text>
        <ControlIcon name="chevron-down" size={14} color={colors.interactive} />
      </View>
    </View>
  );
  // Removing the native trigger also disables VoiceOver activation during start.
  if (disabled) return row;
  return (
    <MenuView
      themeVariant={isDark ? 'dark' : 'light'}
      shouldOpenOnLongPress={false}
      title="Vessel"
      actions={FLOAT_BOATS.map(boat => ({
        id: boat,
        title: boat[0].toUpperCase() + boat.slice(1),
        state: boat === value ? 'on' : 'off',
      }))}
      onPressAction={({ nativeEvent }) => {
        const boat = nativeEvent.event as FloatBoat;
        if (!disabled && FLOAT_BOATS.includes(boat)) onChange(boat);
      }}
    >
      {row}
    </MenuView>
  );
}

const local = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: 16, paddingVertical: 12 },
  stacked: { flexDirection: 'column', alignItems: 'stretch', gap: 8 },
  copy: { flex: 1, gap: 2 },
  stackedCopy: { flex: 0 },
  label: { ...t.base, fontFamily: fonts.medium },
  selection: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  value: { ...t.base, fontFamily: fonts.medium, flexShrink: 1 },
});
