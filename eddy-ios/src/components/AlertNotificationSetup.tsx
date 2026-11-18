import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { PushPrimer } from './PushPrimer';
import type { useAlertNotificationSetup } from '@/hooks/useAlertNotificationSetup';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

/**
 * The same recovery stays visible in Mine, alongside the editor's switch, and
 * under the dam screen's generation alert switches.
 *
 * `primer` lets a caller that knows what was just set say so on the sheet
 * shown before the iOS prompt. The dam card passes its own promise and
 * caveat; without it the sheet makes the general case, as it always has.
 */
export function AlertNotificationSetup({ setup, active, primer }: {
  setup: ReturnType<typeof useAlertNotificationSetup>;
  active: boolean;
  primer?: Pick<ComponentProps<typeof PushPrimer>, 'riverName' | 'promise' | 'schedule'>;
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
    <PushPrimer visible={setup.primerOpen} {...primer} onAllow={() => { void setup.act(true); }} onDismiss={setup.dismiss} />
  </>;
}

const styles = StyleSheet.create({
  notice: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4, marginBottom: 12, gap: 4 },
  message: { ...t.sm, fontFamily: fonts.body },
  action: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  actionText: { ...t.sm, fontFamily: fonts.semibold },
});
