// eddy-ios/src/float/FloatReminders.tsx
// Per-float reminder controls on the Float Mode screen (#1448 Phase 5).
//
// For this float only, and separate from gauge alerts on purpose: alerts are
// about a river's conditions, these are about where you are on it. The rules
// are in src/lib/floatReminders.ts; this only edits the choice and says
// plainly when notifications are off, because a reminder that silently never
// arrives is worse than none.

import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { setFloatReminders } from '@/lib/floatSessionStore';
import type { FloatSession } from '@/lib/floatSession';
import {
  STOP_LEAD_MILES,
  TAKE_OUT_LEAD_MILES,
  TAKE_OUT_REMINDER_ID,
  reminderStops,
  remindersOf,
} from '@/lib/floatReminders';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

type NotificationAccess = 'unknown' | 'granted' | 'ask' | 'settings';

export function FloatReminders({ session }: { session: FloatSession }) {
  const { colors } = useTheme();
  const settings = remindersOf(session);
  const fired = new Set(settings.fired);
  const stops = reminderStops(session);
  const access = useNotificationAccess();
  const anyOn = settings.takeOut || settings.stops.length > 0;

  const toggleStop = (id: string, on: boolean) =>
    setFloatReminders((current) => ({
      ...current,
      stops: on ? [...new Set([...current.stops, id])] : current.stops.filter((stop) => stop !== id),
    }));

  return (
    <View style={[styles.section, { borderColor: colors.border }]}>
      <Text style={[styles.heading, { color: colors.text }]} accessibilityRole="header">Reminders</Text>

      {anyOn && access.state === 'ask' ? (
        <Pressable onPress={access.request} style={[styles.notice, { backgroundColor: colors.cardRaised, borderColor: colors.border }]} accessibilityRole="button">
          <Text style={[styles.noticeText, { color: colors.text }]}>Allow notifications so Eddy can remind you on the water.</Text>
        </Pressable>
      ) : null}
      {anyOn && access.state === 'settings' ? (
        <Pressable onPress={() => void Linking.openSettings()} style={[styles.notice, { backgroundColor: colors.cardRaised, borderColor: colors.border }]} accessibilityRole="button">
          <Text style={[styles.noticeText, { color: colors.text }]}>Notifications are off for Eddy, so reminders can’t appear. Turn them on in Settings.</Text>
        </Pressable>
      ) : null}

      <ReminderRow
        title={`Before ${session.takeOut.name}`}
        note={fired.has(TAKE_OUT_REMINDER_ID) ? 'Sent.' : `About ${TAKE_OUT_LEAD_MILES} mi ahead, along the river.`}
        value={settings.takeOut}
        onChange={(on) => setFloatReminders((current) => ({ ...current, takeOut: on }))}
      />

      {stops.length > 0 ? (
        <>
          <Text style={[styles.subheading, { color: colors.textMuted }]}>Stops along the way</Text>
          {stops.map((stop) => (
            <ReminderRow
              key={stop.id}
              title={stop.name}
              note={fired.has(stop.id) ? 'Sent.' : `About ${STOP_LEAD_MILES} mi ahead.`}
              value={settings.stops.includes(stop.id)}
              onChange={(on) => toggleStop(stop.id, on)}
            />
          ))}
        </>
      ) : null}

      <Text style={[styles.note, { color: colors.textMuted }]}>
        Work without cell service. Only from a confirmed position on the river, and once each.
      </Text>
    </View>
  );
}

function ReminderRow({ title, note, value, onChange }: { title: string; note: string; value: boolean; onChange: (on: boolean) => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>{title}</Text>
        <Text style={[styles.note, { color: colors.textMuted }]}>{note}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={`Remind me: ${title}`} />
    </View>
  );
}

/** Whether a reminder can appear, and how to fix it if not. */
function useNotificationAccess(): { state: NotificationAccess; request: () => void } {
  const [state, setState] = useState<NotificationAccess>('unknown');
  const read = useCallback(() => {
    void Notifications.getPermissionsAsync()
      .then((status) => setState(status.granted ? 'granted' : status.canAskAgain ? 'ask' : 'settings'))
      .catch(() => setState('unknown'));
  }, []);
  useEffect(read, [read]);
  const request = useCallback(() => {
    void Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true } })
      .then(read)
      .catch(read);
  }, [read]);
  return { state, request };
}

const styles = StyleSheet.create({
  section: { gap: 8, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  heading: { ...t.base, fontFamily: fonts.heading },
  subheading: { ...t.xs, fontFamily: fonts.semibold, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  rowText: { flex: 1 },
  title: { ...t.base, fontFamily: fonts.semibold },
  note: { ...t.sm, fontFamily: fonts.body },
  notice: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12 },
  noticeText: { ...t.sm, fontFamily: fonts.body },
});
