import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '@/theme/conditions';

/**
 * Shell placeholder. Each one names what the tab will do and what it is waiting
 * on, so the scaffold documents the remaining Phase 1 work rather than showing
 * four identical "coming soon" screens.
 */
export function Placeholder({
  title,
  blurb,
  waitingOn,
}: {
  title: string;
  blurb: string;
  waitingOn: string;
}) {
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.blurb}>{blurb}</Text>
        <View style={styles.pill}>
          <Text style={styles.pillText}>Next: {waitingOn}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  title: { color: COLORS.text, fontSize: 26, fontWeight: '700', marginBottom: 10 },
  blurb: { color: COLORS.textMuted, fontSize: 15, textAlign: 'center', lineHeight: 22 },
  pill: {
    marginTop: 24,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  pillText: { color: COLORS.accent, fontSize: 13, fontWeight: '600' },
});
