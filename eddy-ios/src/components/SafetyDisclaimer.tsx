import { StyleSheet, Text } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { SAFETY_DISCLAIMER } from '@/lib/safetyCopy';

export function SafetyDisclaimer({ compact = false }: { compact?: boolean }) {
  const { colors } = useTheme();

  return (
    // Muted, not error red: the same words on the same surfaces (App Review
    // reads them there), without dressing a Good river in the danger colour.
    <Text style={[compact ? styles.compact : styles.standard, { color: colors.textSubtle }]}>
      {SAFETY_DISCLAIMER}
    </Text>
  );
}

const styles = StyleSheet.create({
  standard: { ...t.sm, fontFamily: fonts.body, textAlign: 'center', marginVertical: 14 },
  compact: { ...t.xs, fontFamily: fonts.body, textAlign: 'center', marginTop: 12 },
});
