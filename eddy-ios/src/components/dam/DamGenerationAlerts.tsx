// eddy-ios/src/components/dam/DamGenerationAlerts.tsx
// Generation schedule alerts on the dam detail screen.
//
// ── What the two switches promise ───────────────────────────────────────────
//
// A push when generation is POSTED to start at this dam — an hour before the
// posted time, at it, or both, for every posted start rather than only the
// day's first. It reads the schedule. It does not confirm generation began:
// measured turbine flow reaches Eddy one to three hours late, which is after
// the water (docs/decisions/0020). The card names the schedule in its title and
// carries DAM_ALERT_NOTE under the switches, on the screen where the promise
// is made, because a quiet phone must not read as "the water is staying down".
//
// ── Only where a schedule is posted ─────────────────────────────────────────
//
// The dam screen renders this for dams SWPA schedules and no others. A switch
// on a dam with no posted schedule could never fire, and the server refuses to
// save one.
//
// ── A switch saves itself, and only itself ──────────────────────────────────
//
// Flicking a switch sends that one time; the server keeps the other. The card
// used to send both from its own copy of the alert, and while that copy was
// loading both read off — so switching "an hour before" on silently cleared a
// saved "at the start". Two guards now: a tap could not clear the other switch
// even on a wrong guess, and the card does not guess. The change that opened
// the sign-in sheet is kept as that same single switch and finished after
// signing in.
//
// ── Only confirmed settings are drawn ───────────────────────────────────────
//
// A switch that reads off is a claim that no alert is set. The card makes it
// only when it knows: the server answered, or there is no account to hold an
// alert. While the settings are loading it says so, and when they could not be
// loaded it says that and offers Try again — it used to treat a failed request
// as an answer, and drew both switches off, and editable, over an alert that
// was still on.
//
// ── An alert that is on, on a phone that can receive it ─────────────────────
//
// Saving succeeds whether or not this iPhone can be notified, and those are
// separate facts. useAlertNotificationSetup is the app's one answer to the
// second: after a switch is turned on it checks permission and registration
// afresh, and AlertNotificationSetup keeps the result under the switches for
// as long as the alert is on — Open iOS Settings when notifications are
// denied, Turn on notifications when this phone opted out, Try again when it
// is not registered, and the primer when iOS has never been asked. So the
// primer is opened from there, not by useAlertGate; two paths would show two.

import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import type { DamGenerationAlert } from '@eddy/types';
import { ApiError } from '@/api/client';
import { AlertNotificationSetup } from '@/components/AlertNotificationSetup';
import { EddySymbol } from '@/components/EddySymbol';
import { AlertSignInSheet } from '@/components/AlertSignInSheet';
import { useAlertGate } from '@/hooks/useAlertGate';
import { useAlertNotificationSetup } from '@/hooks/useAlertNotificationSetup';
import { useDamAlerts } from '@/hooks/useDamAlerts';
import {
  DAM_ALERT_LOAD_FAILED,
  DAM_ALERT_NOTE,
  DAM_ALERT_PROMISE,
  damAlertCardView,
  damAlertTimes,
  hasDamAlert,
  turnsDamAlertOn,
  type DamAlertChange,
} from '@/lib/damAlerts';
import { radii } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, textStyles, type as t } from '@/theme/typography';

interface Props {
  dam: { id: string; name: string };
}

export function DamGenerationAlerts({ dam }: Props) {
  const { colors, elevation } = useTheme();
  const { alerts, status, refresh, save } = useDamAlerts();
  const gate = useAlertGate();
  const notificationSetup = useAlertNotificationSetup();
  const { afterSave: checkNotifications, dismiss: dismissNotifications } = notificationSetup;
  const [error, setError] = useState<string | null>(null);
  // The one switch waiting on a sign-in. A ref: nothing renders from it.
  const pending = useRef<DamAlertChange | null>(null);

  // 'switches' only when the settings are confirmed; see the header.
  const view = damAlertCardView(status);
  const times = damAlertTimes(alerts, dam.id);
  const alertOn = hasDamAlert(times);
  // The notice draws nothing when this iPhone can receive the alert, so the
  // gap above it is only added when there is something to separate.
  const showsSetup = alertOn && Boolean(notificationSetup.notice || notificationSetup.busy || notificationSetup.error);

  const apply = useCallback(
    async (change: DamAlertChange) => {
      setError(null);
      pending.current = change;
      try {
        // A holder, because the write runs inside the gate's callback.
        const outcome: { alert: DamGenerationAlert | null } = { alert: null };
        const result = await gate.run(
          async (token) => {
            outcome.alert = await save(token, dam, change);
          },
          // The primer is opened by the notification check below, with the
          // dam's own wording. Left to the gate as well it would open twice.
          { primes: false },
        );
        // Not written means the sign-in sheet is up; keep the switch for it.
        if (!result.wrote) return;
        pending.current = null;

        if (outcome.alert && turnsDamAlertOn(change)) {
          // A time was switched on: can this iPhone actually receive it?
          // Never rolls back or reports on the save, which already succeeded.
          await checkNotifications(Promise.resolve(), true);
        } else if (!outcome.alert) {
          // No alert left, so nothing for a notice or a primer to be about.
          dismissNotifications();
        }
      } catch (err) {
        pending.current = null;
        // The route writes its refusals for a person; a dropped connection or
        // a server fault gets this screen's own sentence.
        const refusal = err instanceof ApiError && err.status != null && err.status >= 400 && err.status < 500;
        setError(refusal ? err.message : 'Could not change that alert. Try again.');
      }
    },
    [gate, save, dam, checkNotifications, dismissNotifications],
  );

  const row = (label: string, value: boolean, change: DamAlertChange, a11y: string) => (
    <Pressable
      onPress={() => void apply(change)}
      disabled={gate.busy}
      accessibilityRole="switch"
      accessibilityLabel={a11y}
      accessibilityState={{ checked: value, disabled: gate.busy, busy: gate.busy }}
      style={({ pressed }) => [styles.row, { opacity: gate.busy ? 0.55 : pressed ? 0.65 : 1 }]}
    >
      <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Switch value={value} trackColor={{ true: colors.interactive, false: colors.border }}
          ios_backgroundColor={colors.border} thumbColor={value ? colors.onInteractive : undefined} />
      </View>
    </Pressable>
  );

  return (
    <View style={[styles.card, { backgroundColor: colors.card }, elevation(2)]}>
      <View style={styles.titleRow}>
        <EddySymbol name="alertWatch" size={26} />
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Generation schedule alerts</Text>
        {gate.busy ? (
          <ActivityIndicator size="small" color={colors.textMuted} accessibilityLabel="Saving" />
        ) : null}
      </View>

      {view === 'switches' ? (
        <View style={[styles.choices, { backgroundColor: colors.cardRaised }]}>
          {row(
            '1 hour before the posted start',
            times.hourBefore,
            { hourBefore: !times.hourBefore },
            `Notify me 1 hour before generation is posted to start at ${dam.name}`,
          )}
          <View style={[styles.rule, { backgroundColor: colors.border }]} />
          {row(
            'At the posted start',
            times.atStart,
            { atStart: !times.atStart },
            `Notify me when generation is posted to start at ${dam.name}`,
          )}
        </View>
      ) : view === 'loading' ? (
        // STILL ASKING. No switches: off would be a guess.
        <View style={styles.status} accessibilityLiveRegion="polite">
          <ActivityIndicator size="small" color={colors.textMuted} />
          <Text style={[styles.statusText, { color: colors.textMuted }]}>Loading your alert settings…</Text>
        </View>
      ) : (
        // ASKED AND FAILED. An alert may be on; say so rather than show off.
        <View style={styles.status}>
          <Text accessibilityRole="alert" style={[styles.statusText, { color: colors.text }]}>
            {DAM_ALERT_LOAD_FAILED}
          </Text>
          <Pressable
            onPress={() => void refresh()}
            accessibilityRole="button"
            accessibilityLabel="Try loading alert settings again"
            style={styles.retry}
          >
            <Text style={[styles.retryText, { color: colors.interactive }]}>Try again</Text>
          </Pressable>
        </View>
      )}

      <Text style={[styles.note, { color: colors.textMuted }]}>{DAM_ALERT_NOTE}</Text>
      {error ? (
        <Text accessibilityRole="alert" style={[styles.note, { color: colors.error }]}>
          {error}
        </Text>
      ) : null}

      {/* Directly under the switches, and only while an alert is on: whether
          this iPhone can receive it, and the one action that fixes it. */}
      <View style={showsSetup ? styles.setup : null}>
        <AlertNotificationSetup
          setup={notificationSetup}
          active={alertOn}
          primer={{ riverName: dam.name, promise: DAM_ALERT_PROMISE, schedule: { caveat: DAM_ALERT_NOTE } }}
        />
      </View>

      <AlertSignInSheet
        visible={gate.signInOpen}
        riverName={dam.name}
        onSignedIn={() => {
          gate.setSignInOpen(false);
          // Finish the one switch they flicked, now that there is a session.
          // Still only that switch: an alert already saved on this account
          // keeps its other time.
          if (pending.current) void apply(pending.current);
        }}
        onDismiss={() => {
          pending.current = null;
          gate.setSignInOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  title: { ...textStyles.cardTitle, flex: 1 },
  choices: { borderRadius: radii.inset, paddingHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingVertical: 6 },
  rowLabel: { ...t.sm, fontFamily: fonts.medium, flex: 1 },
  rule: { height: StyleSheet.hairlineWidth },
  note: { ...t.xs, fontFamily: fonts.body, marginTop: 8, lineHeight: 17 },
  // The notice carries its own bottom margin; this is only the gap above it.
  setup: { marginTop: 10 },
  // Stands where the two switch rows would, at about one row's height, so the
  // card does not jump much when the settings arrive.
  status: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, minHeight: 48 },
  statusText: { ...t.sm, fontFamily: fonts.body, flexShrink: 1 },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  retryText: { ...t.sm, fontFamily: fonts.semibold },
});
