// eddy-ios/app/alerts/quiet-hours.tsx
// A window in which the phone stays silent.
//
// ── This suppresses; it does not queue ──────────────────────────────────────
//
// The screen says so, in as many words, because the honest behaviour is not the
// one people assume. Delivery already discards any alert older than three hours
// — "your river is floatable" must never fire about water that has since
// dropped — and a quiet window is typically eight. Holding an alert until
// morning would therefore deliver a stale promise or, more often, nothing at
// all. What survives is the Alerts feed, which is free, needs no account, and is
// still there when you wake up.
//
// Saying that plainly costs a sentence. Implying a morning digest that does not
// exist costs someone a trip.
//
// Times are entered as whole hours. Minute precision on a sleep window is
// false precision, and two wheels of 1,440 values each is a worse control than
// two rows of 24.

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import type { NotificationPreferences } from '@eddy/types';
import { fetchNotificationPreferences, updateNotificationPreferences } from '@/api/client';
import { useSession } from '@/hooks/useSession';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

const DEFAULT_START = 22 * 60;
const DEFAULT_END = 7 * 60;

function label(minute: number): string {
  const hour = Math.floor(minute / 60) % 24;
  const suffix = hour < 12 ? 'am' : 'pm';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}${suffix}`;
}

/** 24 whole hours. See the header on why this is not a minute picker. */
const HOURS = Array.from({ length: 24 }, (_, hour) => hour * 60);

/**
 * The phone's own zone.
 *
 * Read from Intl rather than expo-localization: this is the one fact we need
 * from that module, Hermes ships full ICU, and a new native dependency would
 * cost a rebuild for a one-line lookup. Falls back to the server's default,
 * which is also what an account with no row gets.
 */
function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago';
  } catch {
    return 'America/Chicago';
  }
}

export default function QuietHoursScreen() {
  const router = useRouter();
  const { colors, elevation } = useTheme();
  const { getAccessToken } = useSession();

  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) {
          setPrefs(null);
          return;
        }
        const loaded = await fetchNotificationPreferences(token, controller.signal);
        if (controller.signal.aborted) return;
        setPrefs(
          loaded ?? {
            quietHoursEnabled: false,
            quietStartMinute: DEFAULT_START,
            quietEndMinute: DEFAULT_END,
            // The phone's own zone, not the server's Missouri default: the
            // window is about when the person is asleep, and plenty of people
            // watching Ozark water are not in the Ozarks.
            timezone: deviceTimezone(),
            safetyOverridesQuiet: true,
          },
        );
      } catch {
        if (!controller.signal.aborted) setError('Could not load your settings.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [getAccessToken]);

  const save = useCallback(
    async (next: NotificationPreferences) => {
      const previous = prefs;
      setPrefs(next);
      setError(null);
      setSaving(true);
      try {
        const token = await getAccessToken();
        if (!token) throw new Error('no session');
        const saved = await updateNotificationPreferences(token, next);
        setPrefs(saved);
      } catch {
        // Put it back. A quiet-hours switch that looks set but is not would let
        // someone believe their night is protected when it is not.
        setPrefs(previous);
        setError('Could not save that. Try again.');
      } finally {
        setSaving(false);
      }
    },
    [prefs, getAccessToken],
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered, { backgroundColor: colors.bg }]} edges={['top']}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  const nav = (
    <View style={styles.navRow}>
      <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back">
        <Ionicons name="chevron-back" size={26} color={colors.text} />
      </Pressable>
      <Text style={[styles.navTitle, { color: colors.text }]}>Quiet hours</Text>
      <View style={styles.navSpacer} />
    </View>
  );

  if (!prefs) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
        <Stack.Screen options={{ headerShown: false }} />
        {nav}
        <View style={[styles.centered, styles.flex]}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Sign in to set quiet hours</Text>
          <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
            Quiet hours are stored with your account so they apply to every device.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const start = prefs.quietStartMinute ?? DEFAULT_START;
  const end = prefs.quietEndMinute ?? DEFAULT_END;

  const hourPicker = (
    which: 'start' | 'end',
    selected: number,
    onPick: (minute: number) => void,
  ) => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.hourRow}
      accessibilityLabel={which === 'start' ? 'Quiet hours start' : 'Quiet hours end'}
    >
      {HOURS.map((minute) => {
        const active = minute === selected;
        return (
          <Pressable
            key={minute}
            onPress={() => onPick(minute)}
            style={[
              styles.hourChip,
              { borderColor: colors.border },
              active && { backgroundColor: colors.accent, borderColor: colors.accent },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text
              style={[styles.hourText, { color: active ? colors.onAccent : colors.textMuted }]}
            >
              {label(minute)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      {nav}

      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          onPress={() => void save({ ...prefs, quietHoursEnabled: !prefs.quietHoursEnabled, quietStartMinute: start, quietEndMinute: end })}
          style={({ pressed }) => [
            styles.optionRow,
            { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
            elevation(1),
          ]}
        >
          <View style={styles.optionBody}>
            <Text style={[styles.optionTitle, { color: colors.text }]}>Quiet hours</Text>
            <Text style={[styles.optionHint, { color: colors.textMuted }]}>
              {prefs.quietHoursEnabled
                ? `Silent from ${label(start)} to ${label(end)}`
                : 'Alerts can arrive at any time'}
            </Text>
          </View>
          <Switch
            value={prefs.quietHoursEnabled}
            onValueChange={(next) =>
              void save({ ...prefs, quietHoursEnabled: next, quietStartMinute: start, quietEndMinute: end })
            }
            trackColor={{ true: colors.accent, false: colors.border }}
          />
        </Pressable>

        {prefs.quietHoursEnabled ? (
          <>
            <Text style={[styles.sectionLabel, { color: colors.textSubtle }]}>From</Text>
            {hourPicker('start', start, (minute) =>
              // Equal bounds read as either "never quiet" or "always quiet" and
              // the server rejects them; nudging by an hour beats an error.
              void save({
                ...prefs,
                quietStartMinute: minute,
                quietEndMinute: minute === end ? (end + 60) % 1440 : end,
              }),
            )}

            <Text style={[styles.sectionLabel, { color: colors.textSubtle }]}>Until</Text>
            {hourPicker('end', end, (minute) =>
              void save({
                ...prefs,
                quietEndMinute: minute,
                quietStartMinute: minute === start ? (start + 1440 - 60) % 1440 : start,
              }),
            )}

            <Pressable
              onPress={() => void save({ ...prefs, safetyOverridesQuiet: !prefs.safetyOverridesQuiet })}
              style={({ pressed }) => [
                styles.optionRow,
                { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
                elevation(1),
              ]}
            >
              <View style={styles.optionBody}>
                <Text style={[styles.optionTitle, { color: colors.text }]}>
                  Let safety warnings through
                </Text>
                <Text style={[styles.optionHint, { color: colors.textMuted }]}>
                  High and dangerous water still wakes you.
                </Text>
              </View>
              <Switch
                value={prefs.safetyOverridesQuiet}
                onValueChange={(next) => void save({ ...prefs, safetyOverridesQuiet: next })}
                trackColor={{ true: colors.accent, false: colors.border }}
              />
            </Pressable>

            {/* The honesty line, and the reason this screen has a paragraph. */}
            <Text style={[styles.footnote, { color: colors.textSubtle }]}>
              Alerts during quiet hours are skipped, not saved for later — a
              river reading goes stale within a few hours, so an old one would
              be worse than none. You will still see every change in the Alerts
              feed.
            </Text>
            <Text style={[styles.footnote, { color: colors.textSubtle }]}>
              Times are in {prefs.timezone.replace(/_/g, ' ')}.
            </Text>
          </>
        ) : null}

        {error ? <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text> : null}
        {saving ? <ActivityIndicator style={styles.savingSpinner} color={colors.accent} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  navTitle: { ...t.base, fontFamily: fonts.semibold },
  navSpacer: { width: 26 },
  content: { paddingHorizontal: 16, paddingBottom: 48 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    marginTop: 8,
  },
  optionBody: { flex: 1 },
  optionTitle: { ...t.base, fontFamily: fonts.semibold },
  optionHint: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  sectionLabel: {
    ...t.xs,
    fontFamily: fonts.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 20,
    marginBottom: 8,
    marginHorizontal: 4,
  },
  hourRow: { gap: 8, paddingHorizontal: 2 },
  hourChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  hourText: { ...t.xs, fontFamily: fonts.semibold },
  footnote: { ...t.xs, fontFamily: fonts.body, marginTop: 16, marginHorizontal: 4, lineHeight: 17 },
  errorText: { ...t.sm, fontFamily: fonts.body, marginTop: 14 },
  savingSpinner: { marginTop: 16 },
  emptyTitle: { ...t.lg, fontFamily: fonts.semibold },
  emptyBody: { ...t.sm, fontFamily: fonts.body, textAlign: 'center', marginTop: 6 },
});
