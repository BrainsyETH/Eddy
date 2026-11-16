import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { PushPrimer } from './PushPrimer';
import type { useAlertNotificationSetup } from '@/hooks/useAlertNotificationSetup';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

/** The same recovery stays visible in Mine and alongside the editor's switch. */
export function AlertNotificationSetup({ setup, active }: {
  setup: ReturnType<typeof useAlertNotificationSetup>;
  active: boolean;
}) {
  const { colors } = useTheme();
  if (!active) return null;
  const { notice, busy, error } = setup;
  const actionLabel = notice?.action === 'settings' ? 'Open iOS Settings'
    : notice?.action === 'retry' ? 'Try again' : 'Turn on notifications';
  return <>
    {notice || busy || error ? <View style={[styles.notice, { backgroundColor: colors.cardRaised, borderColor: colors.border }]}>
      <Text accessibilityLiveRegion="polite" style={[styles.message, { color: colors.text }]}>
        {busy ? 'Checking notifications…' : notice?.message}
      </Text>
      {error ? <Text accessibilityRole="alert" style={[styles.message, { color: colors.error }]}>{error}</Text> : null}
      {busy ? <ActivityIndicator color={colors.interactive} accessibilityLabel="Checking notifications" />
        : notice?.action ? <Pressable
          onPress={() => { void setup.act(); }}
          accessibilityRole="button"
          style={styles.action}
        ><Text style={[styles.actionText, { color: colors.interactive }]}>{actionLabel}</Text></Pressable> : null}
    </View> : null}
    <PushPrimer visible={setup.primerOpen} onAllow={() => { void setup.act(true); }} onDismiss={setup.dismiss} />
  </>;
}

const styles = StyleSheet.create({
  notice: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4, marginBottom: 12, gap: 4 },
  message: { ...t.sm, fontFamily: fonts.body },
  action: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  actionText: { ...t.sm, fontFamily: fonts.semibold },
});
