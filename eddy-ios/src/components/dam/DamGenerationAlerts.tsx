// eddy-ios/src/components/dam/DamGenerationAlerts.tsx
// "Alert me about posted generation": two switches on the dam screen.
//
// ── What the two switches promise ───────────────────────────────────────────
//
// A push when generation is POSTED to start at this dam — an hour before the
// posted time, at it, or both, for every posted start rather than only the
// day's first. It reads the schedule. It does not confirm generation began:
// measured turbine flow reaches Eddy one to three hours late, which is after
// the water (docs/decisions/0020). So the card says "posted" in its title and
// carries DAM_ALERT_NOTE under the switches, on the screen where the promise
// is made, because a quiet phone must not read as "the water is staying down".
//
// ── Only where a schedule is posted ─────────────────────────────────────────
//
// The dam screen renders this for dams SWPA schedules and no others. A switch
// on a dam with no posted schedule could never fire, and the server refuses to
// save one.
//
// ── The gate ────────────────────────────────────────────────────────────────
//
// useAlertGate, as the river bell and the alert editor use it: a permanent
// session to write, the sign-in sheet on 401/403, and the push primer once an
// alert exists. The change that opened the sign-in sheet is kept and finished
// after signing in, so the switch someone flicked is the one that ends up on.

import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native';
import { ApiError } from '@/api/client';
import { AlertSignInSheet } from '@/components/AlertSignInSheet';
import { PushPrimer } from '@/components/PushPrimer';
import { useAlertGate } from '@/hooks/useAlertGate';
import { useDamAlerts } from '@/hooks/useDamAlerts';
import {
  DAM_ALERT_NOTE,
  DAM_ALERT_PROMISE,
  damAlertTimes,
  hasDamAlert,
  type DamAlertTimes,
} from '@/lib/damAlerts';
import { radii } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, textStyles, type as t } from '@/theme/typography';

interface Props {
  dam: { id: string; name: string };
}

export function DamGenerationAlerts({ dam }: Props) {
  const { colors, elevation } = useTheme();
  const { alerts, save } = useDamAlerts();
  const gate = useAlertGate();
  const [error, setError] = useState<string | null>(null);
  // The change waiting on a sign-in. A ref: nothing renders from it.
  const pending = useRef<DamAlertTimes | null>(null);

  const times = damAlertTimes(alerts, dam.id);

  const apply = useCallback(
    async (next: DamAlertTimes) => {
      setError(null);
      pending.current = next;
      try {
        const result = await gate.run(
          async (token) => {
            await save(token, dam, next);
          },
          // Switching the last time off must never ask for permission to send.
          { primes: hasDamAlert(next) },
        );
        // Not written means the sign-in sheet is up; keep the change for it.
        if (result.wrote) pending.current = null;
      } catch (err) {
        pending.current = null;
        // The route writes its refusals for a person; a dropped connection or
        // a server fault gets this screen's own sentence.
        const refusal = err instanceof ApiError && err.status != null && err.status >= 400 && err.status < 500;
        setError(refusal ? err.message : 'Could not change that alert. Try again.');
      }
    },
    [gate, save, dam],
  );

  const row = (label: string, value: boolean, next: DamAlertTimes, a11y: string) => (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
      <Switch
        value={value}
        disabled={gate.busy}
        onValueChange={() => void apply(next)}
        trackColor={{ true: colors.interactive, false: colors.border }}
        accessibilityLabel={a11y}
      />
    </View>
  );

  return (
    <View style={[styles.card, { backgroundColor: colors.card }, elevation(2)]}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: colors.text }]}>Alert me about posted generation</Text>
        {gate.busy ? <ActivityIndicator size="small" color={colors.textMuted} /> : null}
      </View>

      {row(
        '1 hour before it starts',
        times.hourBefore,
        { ...times, hourBefore: !times.hourBefore },
        `Notify me 1 hour before generation is posted to start at ${dam.name}`,
      )}
      <View style={[styles.rule, { backgroundColor: colors.border }]} />
      {row(
        'When it’s posted to start',
        times.atStart,
        { ...times, atStart: !times.atStart },
        `Notify me when generation is posted to start at ${dam.name}`,
      )}

      <Text style={[styles.note, { color: colors.textMuted }]}>{DAM_ALERT_NOTE}</Text>
      {error ? (
        <Text accessibilityRole="alert" style={[styles.note, { color: colors.error }]}>
          {error}
        </Text>
      ) : null}

      <AlertSignInSheet
        visible={gate.signInOpen}
        riverName={dam.name}
        onSignedIn={() => {
          gate.setSignInOpen(false);
          // Finish the switch they flicked, now that there is a session.
          if (pending.current) void apply(pending.current);
        }}
        onDismiss={() => {
          pending.current = null;
          gate.setSignInOpen(false);
        }}
      />
      <PushPrimer
        visible={gate.primerOpen}
        riverName={dam.name}
        promise={DAM_ALERT_PROMISE}
        schedule={{ caveat: DAM_ALERT_NOTE }}
        onAllow={async () => {
          gate.setPrimerOpen(false);
          // Spends the one-shot prompt. The alert exists either way.
          await gate.enablePush();
        }}
        onDismiss={() => gate.setPrimerOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  title: { ...textStyles.cardTitle, flex: 1 },
  // 44pt at least, so the whole row is a comfortable target beside the switch.
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  rowLabel: { ...t.base, fontFamily: fonts.body, flex: 1 },
  rule: { height: StyleSheet.hairlineWidth },
  note: { ...t.xs, fontFamily: fonts.body, marginTop: 8, lineHeight: 17 },
});
