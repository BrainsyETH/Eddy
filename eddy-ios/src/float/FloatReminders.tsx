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
import { FloatInfoTip } from './FloatInfoTip';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';


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
  const stateOf = (id: string, waiting: string) => (fired.has(id) ? 'Sent.' : pending.has(id) ? 'Sending…' : waiting);
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
    <View style={[styles.section, { borderColor: colors.border }]}>
      <View style={styles.row}>
        <Text style={[styles.heading, styles.rowText, { color: colors.text }]} accessibilityRole="header">Reminders</Text>
        <FloatInfoTip title="Float reminders" message={`The take-out reminder arrives about ${TAKE_OUT_LEAD_MILES} river miles ahead, stop reminders about ${STOP_LEAD_MILES} miles ahead, and hazard reminders (dams, portages and serious hazards) about ${HAZARD_LEAD_MILES} miles ahead. They work without cell service, using a confirmed river position, and are sent once each per float. A GPS gap can delay or prevent a reminder. Separately, Eddy prompts you to finish once you reach the take-out.`} />
      </View>

      <ReminderPermission enabled={anyOn} />

      <ReminderRow
        title="Take-out reminder"
        note={stateOf(TAKE_OUT_REMINDER_ID, 'Receive a notification when you’re close to the take-out.')}
        value={settings.takeOut}
        onChange={(on) => setFloatReminders((current) => ({ ...current, takeOut: on }))}
      />

      {seriousHazards > 0 ? (
        <ReminderRow
          title="Hazard reminders"
          note={`Dams, portages and serious hazards · ${HAZARD_LEAD_MILES} mi ahead.`}
          value={hazardsOn}
          onChange={(on) => setFloatReminders((current) => ({ ...current, hazards: on }))}
        />
      ) : null}

      {stops.length > 0 ? (
        <>
          <Pressable onPress={() => setShowStops(value => !value)} accessibilityRole="button"
            accessibilityState={{ expanded: showStops }} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={[styles.subheading, { color: colors.interactive }]}>{showStops ? 'Hide' : 'Choose'} stop reminders ({settings.stops.length} selected)</Text>
          </Pressable>
          {showStops && stops.map(({ anchor }) => (
            <ReminderRow
              key={anchor.id}
              title={anchor.name}
              note={stateOf(anchor.id, `About ${STOP_LEAD_MILES} mi ahead.`)}
              value={settings.stops.includes(anchor.id)}
              onChange={(on) => toggleStop(anchor.id, on)}
            />
          ))}
        </>
      ) : null}
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
