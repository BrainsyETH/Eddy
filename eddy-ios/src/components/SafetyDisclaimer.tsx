import { StyleSheet, Text } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { SAFETY_DISCLAIMER } from '@/lib/safetyCopy';

export function SafetyDisclaimer({ compact = false }: { compact?: boolean }) {
  const { colors } = useTheme();

  return (
    <Text
      accessibilityRole="alert"
      style={[compact ? styles.compact : styles.standard, { color: colors.error }]}
    >
      {SAFETY_DISCLAIMER}
    </Text>
  );
}

const styles = StyleSheet.create({
  standard: { ...t.sm, fontFamily: fonts.semibold, textAlign: 'center', marginVertical: 14 },
  compact: { ...t.xs, fontFamily: fonts.semibold, textAlign: 'center', marginTop: 12 },
});
