import { Pressable, StyleSheet, Text } from 'react-native';
import { ControlIcon } from '@/components/ControlIcon';
import { openExternalLink } from '@/lib/openExternalLink';
import { nwsRiverForecastUrl } from '@/lib/weatherDestination';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

export function NwsRiverForecastLink({ lid }: { lid?: string | string[] | null }) {
  const { colors } = useTheme();
  const url = nwsRiverForecastUrl(lid);
  if (!url) return null;

  return <Pressable
    accessibilityRole="link"
    accessibilityLabel="NWS river forecast"
    accessibilityHint="Opens the National Weather Service page for this gauge"
    onPress={() => void openExternalLink(url)}
    style={({ pressed }) => [styles.link, { opacity: pressed ? 0.65 : 1 }]}
  >
    <Text style={[styles.label, { color: colors.interactive }]}>NWS river forecast</Text>
    <ControlIcon name="open-outline" size={15} color={colors.interactive} />
  </Pressable>;
}

const styles = StyleSheet.create({
  link: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  label: { ...t.sm, fontFamily: fonts.semibold, flexShrink: 1 },
});
