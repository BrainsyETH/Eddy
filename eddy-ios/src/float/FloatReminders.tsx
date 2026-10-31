// eddy-ios/src/float/FloatReminders.tsx
// Per-float reminder controls on the River Mode screen (#1448 Phase 5).
//
// For this float only, and separate from gauge alerts on purpose: alerts are
// about a river's conditions, these are about where you are on it. The rules
// are in src/lib/floatReminders.ts; this only edits the choice and says
// plainly when notifications are off, because a reminder that silently never
// arrives is worse than none.

import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { ReminderPermission } from './ReminderPermission';
import { setFloatReminders } from '@/lib/floatSessionStore';
import { indexRoute, type FloatSession } from '@/lib/floatSession';
import {
  HAZARD_LEAD_MILES,
  STOP_LEAD_MILES,
  isRemindedHazard,
  TAKE_OUT_LEAD_MILES,
  TAKE_OUT_REMINDER_ID,
  reminderStops,
  remindersOf,
} from '@/lib/floatReminders';
import { ControlIcon } from '@/components/ControlIcon';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

export const FLOAT_SETTINGS_INFO = `Keep screen awake works while River Mode or Float tools is open and uses more battery.

The take-out reminder arrives about ${TAKE_OUT_LEAD_MILES} river miles ahead, stop reminders about ${STOP_LEAD_MILES} miles ahead, and hazard reminders (dams, portages and serious hazards) about ${HAZARD_LEAD_MILES} miles ahead. They work without cell service, using a confirmed river position, and are sent once each per float. A GPS gap can delay or prevent a reminder. Eddy also prompts you to finish once you reach the take-out.

The Lock Screen card shows your float on the Lock Screen and Dynamic Island. Tap it to return to your float. Hiding it keeps tracking running.`;

export function FloatReminders({ session }: { session: FloatSession }) {
  const { colors } = useTheme();
  const settings = remindersOf(session);
  const [showStops, setShowStops] = useState(false);
  const fired = new Set(settings.fired);
  const pending = new Set(settings.pending ?? []);
  // The same calibrated line the reminders are measured on.
  // Keyed on the parts that place a stop, not the session, which changes
  // with every fix: rebuilding the calibrated index once a second while this
  // sheet is open is work for nothing.
  const { route, startMile, putIn, takeOut } = session;
  const stops = useMemo(() => {
    const built = indexRoute(route);
    return built.ok ? reminderStops({ route, startMile, putIn, takeOut } as FloatSession, built.index) : [];
  }, [route, startMile, putIn, takeOut]);
  const stateOf = (id: string) => (fired.has(id) ? 'Sent' : pending.has(id) ? 'Sending…' : null);
  const hazardsOn = settings.hazards !== false;
  const seriousHazards = (session.route.hazards ?? []).filter(
    (hazard) => isRemindedHazard(hazard) && hazard.riverMile <= session.takeOut.riverMile,
  ).length;
  const anyOn = settings.takeOut || settings.stops.length > 0 || (hazardsOn && seriousHazards > 0);

  const toggleStop = (id: string, on: boolean) =>
    setFloatReminders((current) => ({
      ...current,
      stops: on ? [...new Set([...current.stops, id])] : current.stops.filter((stop) => stop !== id),
    }));

  return (
    <View style={styles.section}>
      <ReminderPermission enabled={anyOn} />

      <ReminderRow
        title="Take-out reminder"
        note={stateOf(TAKE_OUT_REMINDER_ID)}
        value={settings.takeOut}
        onChange={(on) => setFloatReminders((current) => ({ ...current, takeOut: on }))}
      />

      {seriousHazards > 0 ? (
        <ReminderRow
          title="Hazard reminders"
          value={hazardsOn}
          onChange={(on) => setFloatReminders((current) => ({ ...current, hazards: on }))}
        />
      ) : null}

      {stops.length > 0 ? (
        <>
          <Pressable onPress={() => setShowStops(value => !value)} accessibilityRole="button"
            accessibilityLabel={`Stop reminders, ${settings.stops.length ? `${settings.stops.length} selected` : 'none selected'}`}
            accessibilityState={{ expanded: showStops }} style={styles.row}>
            <Text style={[styles.title, styles.rowText, { color: colors.text }]}>Stop reminders</Text>
            <Text style={[styles.note, styles.count, { color: colors.textMuted }]}>{settings.stops.length ? `${settings.stops.length} selected` : 'None'}</Text>
            <ControlIcon name={showStops ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.textMuted} />
          </Pressable>
          {showStops && stops.map(({ anchor }) => (
            <ReminderRow
              key={anchor.id}
              title={anchor.name}
              note={stateOf(anchor.id)}
              value={settings.stops.includes(anchor.id)}
              onChange={(on) => toggleStop(anchor.id, on)}
            />
          ))}
        </>
      ) : null}
    </View>
  );
}

function ReminderRow({ title, note, value, onChange }: { title: string; note?: string | null; value: boolean; onChange: (on: boolean) => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        {note ? <Text style={[styles.note, { color: colors.textMuted }]}>{note}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.accentFill }} accessibilityLabel={`Remind me: ${title}`} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingVertical: 8 },
  count: { flexShrink: 1, textAlign: 'right' },
  rowText: { flex: 1 },
  title: { ...t.base, fontFamily: fonts.semibold },
  note: { ...t.sm, fontFamily: fonts.body },
});
