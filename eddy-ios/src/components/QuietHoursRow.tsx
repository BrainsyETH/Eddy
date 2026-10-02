import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import type { NotificationPreferences } from '@eddy/types';
import { fetchNotificationPreferences } from '@/api/client';
import { ControlIcon } from '@/components/ControlIcon';
import { DEFAULT_END_MINUTE, DEFAULT_START_MINUTE, hourLabel, timezoneLabel } from '@/lib/quietHours';
import { useSession } from '@/hooks/useSession';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

/** One action: open the schedule. All preference changes save inside the sheet. */
export function QuietHoursRow() {
  const { getAccessToken, isAnonymous } = useSession();
  const { colors } = useTheme();
  const router = useRouter();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [failed, setFailed] = useState(false);
  useFocusEffect(useCallback(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const token = isAnonymous ? null : await getAccessToken();
        if (controller.signal.aborted) return;
        if (!token) { setPrefs(null); return; }
        const next = await fetchNotificationPreferences(token, controller.signal);
        if (!controller.signal.aborted) { setPrefs(next); setFailed(false); }
      } catch { if (!controller.signal.aborted) setFailed(true); }
    })();
    return () => controller.abort();
  }, [getAccessToken, isAnonymous]));
  if (isAnonymous) return null;
  const summary = failed ? 'Couldn’t check schedule' : !prefs ? 'Loading…' : prefs.quietHoursEnabled
    ? `${hourLabel(prefs.quietStartMinute ?? DEFAULT_START_MINUTE)}–${hourLabel(prefs.quietEndMinute ?? DEFAULT_END_MINUTE)} · ${timezoneLabel(prefs.timezone)}` : 'Off';
  return <Pressable onPress={() => router.push('/alerts/quiet-hours')} accessibilityRole="button"
    accessibilityLabel={`Quiet hours, ${summary}. Edit schedule`}
    style={({ pressed }) => [styles.row, { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
    <ControlIcon name="moon-outline" size={20} color={colors.textMuted} />
    <View style={styles.body}>
      <Text style={[styles.title, { color: colors.text }]}>Quiet hours · {summary}</Text>
      {!failed && prefs?.quietHoursEnabled ? <Text style={[t.xs, { color: colors.textMuted }]}>{prefs.safetyOverridesQuiet ? 'Rising-water warnings allowed · custom levels skipped' : 'All notifications skipped during these hours'}</Text> : null}
    </View>
    <ControlIcon name="chevron-forward" size={16} color={colors.textMuted} />
  </Pressable>;
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginBottom: 12, paddingVertical: 12, minHeight: 44, borderBottomWidth: StyleSheet.hairlineWidth },
  body: { flex: 1, gap: 4 },
  title: { ...t.sm, fontFamily: fonts.semibold },
});
