import { StyleSheet, Text, View } from 'react-native';
import { Otter } from './Otter';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

/** The same Eddy identity for a river, gauge or dam interpretation. */
export function ReadHeading() {
  const { colors } = useTheme();
  return <View style={styles.row}>
    <Otter mood="favicon" size={28} />
    <Text accessibilityRole="header" style={[styles.title, { color: colors.interactive }]}>Eddy’s Read</Text>
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { ...t.lg, fontFamily: fonts.display, flexShrink: 1 },
});
