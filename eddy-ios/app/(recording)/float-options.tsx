// eddy-ios/app/(recording)/float-options.tsx
// Float options: the settings a float needs now and then, kept off the Float
// Mode panel so End stays in reach. A sheet over Float Mode: tracking detail,
// the Lock Screen card, reminders, hazard reports sent from this river, and
// keep-awake. Closing it returns to the float; nothing here ends it.

import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FloatInfoTip } from '@/float/FloatInfoTip';
import { FloatActivityControl } from '@/float/FloatActivityControl';
import { FloatHazardReports } from '@/float/FloatHazardReports';
import { FloatReminders } from '@/float/FloatReminders';
import { useKeepAwakePreference } from '@/float/keepAwakePreference';
import { useTrackingLine } from '@/float/useTrackingLine';
import { useFloatSession } from '@/hooks/useFloatSession';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

export default function FloatOptionsScreen() {
  const session = useFloatSession();
  const router = useRouter();
  const { colors } = useTheme();
  const tracking = useTrackingLine();
  const insets = useSafeAreaInsets();
  const [keepAwake, setKeepAwake] = useKeepAwakePreference();

  // The float ended (automatically, say) while this sheet was open: go back,
  // and Float Mode shows the recap.
  useEffect(() => {
    if (!session && router.canGoBack()) router.back();
  }, [session, router]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <ScrollView style={styles.screen} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + 20 }]} >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
            Float options
          </Text>
          <Pressable onPress={() => router.back()} style={styles.doneButton} accessibilityRole="button" accessibilityLabel="Close float options">
            <Text style={[styles.done, { color: colors.interactive }]}>Done</Text>
          </Pressable>
        </View>

        {tracking.line ? (
          <View style={styles.section}>
            <Text style={[styles.heading, { color: colors.text }]}>Tracking</Text>
            {tracking.line.action === 'info' ? (
              <View style={styles.trackingRow}>
                <Text style={[styles.note, styles.grow, { color: colors.textMuted }]}>
                  {tracking.tracker.status === 'recording' ? 'GPS recording' : tracking.line.text}
                </Text>
                {tracking.line.detail ? <FloatInfoTip title="Background tracking" message={tracking.line.detail} /> : null}
              </View>
            ) : (
              <Pressable
                onPress={tracking.act}
                style={[styles.notice, { backgroundColor: colors.cardRaised, borderColor: colors.border }]}
                accessibilityRole="button"
              >
                <Text style={[styles.note, { color: colors.text }]}>{tracking.line.text}</Text>
              </Pressable>
            )}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={[styles.heading, { color: colors.text }]}>Live Activity</Text>
          <FloatActivityControl />
        </View>

        {session ? <FloatHazardReports session={session} /> : null}

        {session ? <FloatReminders session={session} /> : null}

        <View style={[styles.toggleRow, { borderColor: colors.border }]}>
          <View style={styles.toggleText}>
            <Text style={[styles.toggleTitle, { color: colors.text }]}>Keep screen awake</Text>
            <Text style={[styles.note, { color: colors.textMuted }]}>Uses more battery while this screen is open.</Text>
          </View>
          <Switch value={keepAwake} onValueChange={setKeepAwake} accessibilityLabel="Keep screen awake" />
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  grow: { flex: 1 },
  trackingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  doneButton: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...t.lg, fontFamily: fonts.heading },
  done: { ...t.base, fontFamily: fonts.semibold },
  section: { gap: 8 },
  heading: { ...t.base, fontFamily: fonts.semibold },
  note: { ...t.sm, fontFamily: fonts.body },
  notice: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  toggleText: { flex: 1 },
  toggleTitle: { ...t.base, fontFamily: fonts.semibold },
});
