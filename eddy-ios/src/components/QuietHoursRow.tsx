// eddy-ios/src/components/QuietHoursRow.tsx
// Quiet hours, said out loud on the screen it governs.
//
// The setting itself has had a screen for a while. Nothing ever pointed at it
// except a row in Profile, two taps from here, which meant the control
// deciding whether a 4am flood alert wakes you was a route almost nobody
// visited. Someone who has never opened it cannot know whether their phone
// will ring tonight, and that is the one thing about an alert people actually
// want settled in advance.
//
// So this states the answer where the alerts are, and carries the switch that
// changes it — the same pair the settings screen leads with. Tapping the row
// still opens that screen, which is where the window itself is edited.
//
// ── Signed in only, and quietly absent otherwise ────────────────────────────
//
// Quiet hours live on the account, because push does. A signed-out person has
// no preferences row and no push to silence, so this renders nothing rather
// than a control that would have to explain itself. Same for a failed fetch:
// an unreachable server has not told us the window is off, and a row reading
// "Alerts can arrive at any time" would be a claim we cannot support.

import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import type { NotificationPreferences } from '@eddy/types';
import { fetchNotificationPreferences, updateNotificationPreferences } from '@/api/client';
import { useSession } from '@/hooks/useSession';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

/** Whole hours in, whole hours out — mirrors the picker on the settings screen. */
function label(minute: number): string {
  const hour = Math.floor(minute / 60) % 24;
  const suffix = hour < 12 ? 'am' : 'pm';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}${suffix}`;
}

/**
 * The window in one line, including the exception that matters most.
 *
 * "Safety warnings still come through" is not decoration: it is the difference
 * between a setting somebody trusts and one they turn off out of caution. When
 * the override is off, the line says nothing about safety rather than saying
 * the opposite loudly — the settings screen is where that trade is explained,
 * and a summary is a poor place to argue with a choice already made.
 */
function summary(prefs: NotificationPreferences): string {
  if (!prefs.quietHoursEnabled) return 'Alerts can arrive at any time';
  const window = `${label(prefs.quietStartMinute ?? 22 * 60)} – ${label(prefs.quietEndMinute ?? 7 * 60)}`;
  return prefs.safetyOverridesQuiet
    ? `Silent ${window}. Safety warnings still come through.`
    : `Silent ${window}`;
}

export function QuietHoursRow() {
  const { getAccessToken } = useSession();
  const { colors, elevation } = useTheme();
  const router = useRouter();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [saving, setSaving] = useState(false);

  /**
   * Re-read every time the tab comes forward.
   *
   * The settings screen is one tap away and is where the window gets edited,
   * so a row cached from the last visit is exactly the row that would be
   * wrong. useFocusEffect rather than useEffect for that reason.
   */
  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();
      void (async () => {
        try {
          const token = await getAccessToken();
          if (!token || controller.signal.aborted) return;
          const next = await fetchNotificationPreferences(token, controller.signal);
          if (!controller.signal.aborted) setPrefs(next);
        } catch {
          // Silent by design — see the header. The row stays as it was, or
          // stays absent, and the Alerts list behind it is unaffected.
        }
      })();
      return () => controller.abort();
    }, [getAccessToken]),
  );

  const toggle = useCallback(
    async (next: boolean) => {
      if (!prefs || saving) return;
      const previous = prefs;
      // Optimistic, then reverted on failure: a switch that hangs for a round
      // trip reads as broken, and a switch that lies reads as worse.
      setPrefs({ ...prefs, quietHoursEnabled: next });
      setSaving(true);
      try {
        const token = await getAccessToken();
        if (!token) throw new Error('no session');
        setPrefs(await updateNotificationPreferences(token, { ...previous, quietHoursEnabled: next }));
      } catch {
        setPrefs(previous);
      } finally {
        setSaving(false);
      }
    },
    [prefs, saving, getAccessToken],
  );

  if (!prefs) return null;

  return (
    <Pressable
      onPress={() => router.push('/alerts/quiet-hours')}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
        elevation(1),
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Quiet hours. ${summary(prefs)}. Opens quiet hours settings`}
    >
      <Ionicons name="moon-outline" size={20} color={colors.interactive} />
      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.text }]}>Quiet hours</Text>
        <Text style={[styles.hint, { color: colors.textMuted }]}>{summary(prefs)}</Text>
      </View>
      <Switch
        value={prefs.quietHoursEnabled}
        onValueChange={(next) => void toggle(next)}
        disabled={saving}
        trackColor={{ true: colors.interactive, false: colors.border }}
        accessibilityLabel={prefs.quietHoursEnabled ? 'Turn quiet hours off' : 'Turn quiet hours on'}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 14,
    borderRadius: 14,
  },
  body: { flex: 1 },
  title: { ...t.base, fontFamily: fonts.semibold },
  hint: { ...t.sm, fontFamily: fonts.body, marginTop: 2 },
});
