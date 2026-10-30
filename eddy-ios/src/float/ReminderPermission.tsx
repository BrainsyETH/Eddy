import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNotificationAccess } from '@/hooks/useNotificationAccess';
import { useTheme } from '@/theme/ThemeProvider';
import { type as t } from '@/theme/typography';

/**
 * The same truthful status before starting and while a float is underway.
 *
 * Says something only when something is in the way. The switches above it
 * already show which reminders are on, so "Reminders are on" and "reminders
 * are off for this float" repeated the card to the reader; both render
 * nothing now. What remains is each state that stops a reminder arriving,
 * and the one action that clears it.
 */
export function ReminderPermission({ enabled, disabled = false }: { enabled: boolean; disabled?: boolean }) {
  const { colors } = useTheme();
  const access = useNotificationAccess();
  const settings = access.state === 'settings' || access.state === 'quiet';
  const action = enabled && access.state !== 'granted';
  const message = !enabled || access.state === 'granted' ? null
    : access.state === 'provisional' ? 'Reminders will arrive silently. Allow alerts.'
    : access.state === 'quiet' ? 'Alerts or sound are off for Eddy. Turn them on in Settings so reminders can be heard.'
    : access.state === 'settings' ? 'Notifications are off in Settings.'
    : access.state === 'ask' ? 'Allow notifications so reminders reach you with your phone locked.'
    : 'Eddy couldn’t check notification permission.';
  const [error, setError] = useState<string | null>(null);
  const act = async () => {
    setError(null);
    if (settings) {
      try { await Linking.openSettings(); }
      catch { setError('Couldn’t open Settings. Open iOS Settings and choose Eddy → Notifications.'); }
    } else await access.request();
  };
  if (!message && !error) return null;
  return <View style={styles.container}>
    {message ? <Text style={[t.sm, { color: colors.textMuted }]}>{message}</Text> : null}
    {action ? <Pressable onPress={() => void act()} disabled={disabled || access.busy}
      accessibilityRole="button" accessibilityState={{ disabled: disabled || access.busy, busy: access.busy }}
      style={styles.action}>
      <Text style={[t.base, { color: colors.interactive }]}>{access.busy ? 'Checking…' : settings ? 'Open Settings' : access.state === 'provisional' ? 'Allow alerts' : access.state === 'ask' ? 'Allow notifications' : 'Check again'}</Text>
    </Pressable> : null}
    {error ? <Text style={[t.sm, { color: colors.error }]} accessibilityRole="alert">{error}</Text> : null}
  </View>;
}
const styles = StyleSheet.create({ container: { gap: 4 }, action: { minHeight: 48, justifyContent: 'center' } });
