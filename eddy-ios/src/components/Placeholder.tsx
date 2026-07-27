import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { EddyScene } from '@/components/EddyScene';

/**
 * Shell placeholder. Each one names what the tab will do and what it is waiting
 * on, so the scaffold documents the remaining work rather than showing four
 * identical "coming soon" screens.
 *
 * Note the colour/layout split used throughout the app: StyleSheet.create holds
 * layout and type only — it runs once at import, so any colour written into it
 * would be frozen at whichever scheme the app launched with. Colour is applied
 * inline from useTheme().
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
  const { colors, elevation } = useTheme();

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
      <View style={styles.body}>
        {/* A screen that does not exist yet is the one place in the app that is
            purely a greeting — nothing has been read, nothing has gone wrong. */}
        <EddyScene name="wave" size={120} />
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.blurb, { color: colors.textMuted }]}>{blurb}</Text>
        <View style={[styles.pill, { backgroundColor: colors.card }, elevation(1)]}>
          <Text style={[styles.pillText, { color: colors.accent }]}>Next: {waitingOn}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  // Fredoka, matching the four real screen titles. This is the Profile tab's
  // title, not decorative chrome — a stub screen should still look like Eddy.
  title: { ...t['2xl'], fontFamily: fonts.display, marginTop: 12, marginBottom: 10 },
  blurb: { ...t.sm, fontFamily: fonts.body, textAlign: 'center' },
  pill: { marginTop: 24, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999 },
  pillText: { ...t.xs, fontFamily: fonts.semibold },
});
