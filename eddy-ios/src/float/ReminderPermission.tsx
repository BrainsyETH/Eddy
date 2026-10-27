import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNotificationAccess } from '@/hooks/useNotificationAccess';
import { useTheme } from '@/theme/ThemeProvider';
import { type as t } from '@/theme/typography';

/** The same truthful status before starting and while a float is underway. */
export function ReminderPermission({ enabled, disabled = false }: { enabled: boolean; disabled?: boolean }) {
  const { colors } = useTheme();
  const access = useNotificationAccess();
  const settings = access.state === 'settings' || access.state === 'quiet';
  const action = enabled && access.state !== 'granted';
  const message = !enabled ? 'Take-out and hazard reminders are off for this float.'
    : access.state === 'granted' ? 'Notifications allowed. GPS gaps or phone settings can delay or silence reminders.'
    : access.state === 'provisional' ? 'Reminders would arrive quietly, with no banner or sound. Allow alerts so a hazard warning can wake your phone.'
    : access.state === 'quiet' ? 'Alerts or sound are off for Eddy. Turn them on in Settings so reminders can be heard.'
    : access.state === 'settings' ? 'Notifications are off in Settings. Your float can still be recorded.'
    : access.state === 'ask' ? 'Enable notifications for take-out and hazard reminders, even with your phone locked.'
    : 'Eddy couldn’t read notification permission. Tap to check and enable float reminders.';
  const [error, setError] = useState<string | null>(null);
  const act = async () => {
    setError(null);
    if (settings) {
      try { await Linking.openSettings(); }
      catch { setError('Couldn’t open Settings. Open iOS Settings and choose Eddy → Notifications.'); }
    } else await access.request();
  };
  return <View style={styles.container}>
    <Text style={[t.sm, { color: colors.textMuted }]}>{message}</Text>
    {action ? <Pressable onPress={() => void act()} disabled={disabled || access.busy}
      accessibilityRole="button" accessibilityState={{ disabled: disabled || access.busy, busy: access.busy }}
      style={styles.action}>
      <Text style={[t.base, { color: colors.interactive }]}>{access.busy ? 'Checking…' : settings ? 'Open Settings' : access.state === 'provisional' ? 'Allow alerts' : 'Enable notifications'}</Text>
    </Pressable> : null}
    {error ? <Text style={[t.sm, { color: colors.error }]} accessibilityRole="alert">{error}</Text> : null}
  </View>;
}
const styles = StyleSheet.create({ container: { gap: 4 }, action: { minHeight: 48, justifyContent: 'center' } });
