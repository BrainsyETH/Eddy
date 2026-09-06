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
import {
  DEFAULT_END_MINUTE as DEFAULT_END,
  DEFAULT_START_MINUTE as DEFAULT_START,
  deviceTimezone,
  hourLabel as label,
  timezoneLabel,
  withUsableWindow,
} from '@/lib/quietHours';
import { useSession } from '@/hooks/useSession';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { goBack } from '@/lib/nav';

/** 24 whole hours. See the header on why this is not a minute picker. */
const HOURS = Array.from({ length: 24 }, (_, hour) => hour * 60);

export default function QuietHoursScreen() {
  const router = useRouter();
  const { colors, elevation } = useTheme();
  const { getAccessToken } = useSession();

  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A FAILED LOAD IS NOT A MISSING SESSION, and the screen used to say it was.
  // `error` below is set by the load and by `save`, but it is only rendered
  // inside the loaded form — so a load that threw fell through to the `!prefs`
  // branch and told a signed-in person to sign in. These two carry the load
  // failure on their own: `error` is now the SAVE failure's alone, because a
  // "could not load" line under a form full of defaults is its own wrong claim.
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        setLoading(true);
        setLoadFailed(false);
        setError(null);
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
        if (!controller.signal.aborted) setLoadFailed(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [getAccessToken, reloadNonce]);

  const save = useCallback(
    async (draft: NotificationPreferences) => {
      const previous = prefs;
      // The last guard before the wire, and a no-op on a payload that is
      // already legal — which every one built below is. It exists so that a
      // future caller here cannot reintroduce the bug the Alerts-tab row had:
      // enabling the window while its bounds are still null, and taking a 400
      // that reads on screen as a switch which will not stay on.
      const next = withUsableWindow(draft, draft.quietHoursEnabled);
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

  // Declared ABOVE the loading branch so every state below renders it. A
  // spinner with no way off it is a trap on a slow connection, where the
  // request has fifteen seconds to run before it even fails.
  const nav = (
    <View style={styles.navRow}>
      <Pressable onPress={() => goBack(router)} hitSlop={12} accessibilityLabel="Back">
        <Ionicons name="chevron-back" size={26} color={colors.text} />
      </Pressable>
      <Text style={[styles.navTitle, { color: colors.text }]}>Quiet hours</Text>
      <View style={styles.navSpacer} />
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
        <Stack.Screen options={{ headerShown: false }} />
        {nav}
        <View style={[styles.centered, styles.flex]}>
          <ActivityIndicator color={colors.interactive} />
        </View>
      </SafeAreaView>
    );
  }

  if (loadFailed) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
        <Stack.Screen options={{ headerShown: false }} />
        {nav}
        <View style={[styles.centered, styles.flex]}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Couldn&apos;t load your quiet hours</Text>
          <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
            Your settings are stored with your account, so this screen needs a connection. Nothing has
            changed.
          </Text>
          <Pressable
            onPress={() => setReloadNonce((n) => n + 1)}
            hitSlop={10}
            accessibilityRole="button"
            style={styles.retry}
          >
            <Text style={[styles.retryText, { color: colors.interactive }]}>Try again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // Reached only when there is genuinely no session — `getAccessToken` returned
  // nothing — so the sign-in copy below is now true whenever it is on screen.
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
  // Read once per render rather than three times in the footnotes below: it is
  // an Intl lookup, and the three uses must agree with each other.
  const deviceZone = deviceTimezone();

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
              active && { backgroundColor: colors.selectionBg, borderColor: colors.interactive },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text
              style={[
                styles.hourText,
                { color: active ? colors.selectionText : colors.textMuted },
              ]}
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
            trackColor={{ true: colors.interactive, false: colors.border }}
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
                  High and dangerous water still wakes you — including a level of your own set
                  at or above a river&apos;s high-water line.
                </Text>
              </View>
              <Switch
                value={prefs.safetyOverridesQuiet}
                onValueChange={(next) => void save({ ...prefs, safetyOverridesQuiet: next })}
                trackColor={{ true: colors.interactive, false: colors.border }}
              />
            </Pressable>

            {/* The honesty line, and the reason this screen has a paragraph.
                It used to promise "every change in the Alerts feed" — a feed
                that no longer exists — and said nothing about what happens to
                a level crossed at 2am. The server now re-checks such a rule
                when the window ends and sends once if the water is still
                there; a reading from the night itself is never sent, because
                it would be hours stale by the time anyone read it. */}
            <Text style={[styles.footnote, { color: colors.textSubtle }]}>
              An alert that trips during quiet hours is not sent from the night&apos;s reading —
              that number would be hours old by morning. When the window ends, Eddy checks
              the level again and sends once if the water is still there. Recent activity,
              including anything quiet hours held back, is listed under your alerts.
            </Text>

            {/* ── WHICH CLOCK, and a way to change the answer ──────────────
                The window is stored on the ACCOUNT, so it is evaluated in the
                zone the account carries — and an account that has never been
                here carries the server's default, which is Missouri's. Somebody
                setting "silent 10pm–7am" in Denver was setting 9pm–6am and the
                screen said so in the one form nobody reads: the raw IANA id.

                So the zone is named the way the OS names it, and when it is not
                the phone's own zone that is stated as a mismatch with a control
                beside it. Never corrected silently: a quiet window is a promise
                about somebody's night, and shifting it by an hour without being
                asked is the same class of mistake as leaving it wrong. */}
            {prefs.timezone === deviceZone ? (
              <Text style={[styles.footnote, { color: colors.textSubtle }]}>
                Times are in {timezoneLabel(prefs.timezone)}, this phone&apos;s clock.
              </Text>
            ) : (
              <View style={styles.zoneRow}>
                <Text style={[styles.footnoteInline, { color: colors.textSubtle }]}>
                  Times are in {timezoneLabel(prefs.timezone)} — this phone is on{' '}
                  {timezoneLabel(deviceZone)}.
                </Text>
                <Pressable
                  onPress={() => void save({ ...prefs, timezone: deviceZone })}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Use ${timezoneLabel(deviceZone)} for quiet hours`}
                >
                  <Text style={[styles.zoneAction, { color: colors.interactive }]}>
                    Use this phone&apos;s time
                  </Text>
                </Pressable>
              </View>
            )}
          </>
        ) : null}

        {error ? <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text> : null}
        {saving ? (
          <ActivityIndicator style={styles.savingSpinner} color={colors.interactive} />
        ) : null}
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
  zoneRow: { marginTop: 16, marginHorizontal: 4, gap: 4 },
  footnoteInline: { ...t.xs, fontFamily: fonts.body, lineHeight: 17 },
  zoneAction: { ...t.xs, fontFamily: fonts.semibold },
  errorText: { ...t.sm, fontFamily: fonts.body, marginTop: 14 },
  savingSpinner: { marginTop: 16 },
  emptyTitle: { ...t.lg, fontFamily: fonts.semibold, textAlign: 'center' },
  emptyBody: { ...t.sm, fontFamily: fonts.body, textAlign: 'center', marginTop: 6 },
  retry: { marginTop: 14, minHeight: 44, justifyContent: 'center' },
  retryText: { ...t.sm, fontFamily: fonts.semibold },
});
