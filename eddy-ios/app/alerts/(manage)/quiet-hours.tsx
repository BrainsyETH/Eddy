import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Stack, useNavigation, useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { NotificationPreferences } from '@eddy/types';
import { fetchNotificationPreferences, updateNotificationPreferences } from '@/api/client';
import { AlertCreationFrame } from '@/components/AlertCreationFrame';
import { AppleSignInButton } from '@/components/AppleSignInButton';
import { ControlIcon } from '@/components/ControlIcon';
import { useAlertEditGuard } from '@/hooks/useAlertEditGuard';
import { useSession } from '@/hooks/useSession';
import { DEFAULT_START_MINUTE, DEFAULT_END_MINUTE, deviceTimezone, hourLabel, timezoneLabel, quietDraftChanged, quietWindowValid } from '@/lib/quietHours';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

/** Times are wall-clock minutes in the account zone, not instants in the phone zone. */
function TimeField({ label, minute, onChange }: { label: string; minute: number; onChange: (minute: number) => void }) {
  const { colors, isDark } = useTheme();
  const [open, setOpen] = useState(false);
  return <View style={styles.timeRow}>
    <Text style={[t.base, { color: colors.text }]}>{label}</Text>
    {Platform.OS !== 'ios' ? <Text style={[t.base, { color: colors.textMuted }]}>{hourLabel(minute)}</Text> : null}
    {Platform.OS === 'ios' || open ? <DateTimePicker
      accessibilityLabel={label}
      value={new Date(Date.UTC(2020, 0, 1, Math.floor(minute / 60), minute % 60))}
      mode="time" display={Platform.OS === 'ios' ? 'compact' : 'default'} timeZoneName="UTC"
      // Preserve an existing off-grid value until the person actually edits it.
      minuteInterval={minute % 15 === 0 ? 15 : 1}
      themeVariant={isDark ? 'dark' : 'light'} accentColor={colors.interactive}
      onChange={(event, date) => {
        setOpen(false);
        if (event.type === 'set' && date) onChange((Math.round((date.getUTCHours() * 60 + date.getUTCMinutes()) / 15) * 15) % 1440);
      }} /> : <Pressable style={styles.action} accessibilityRole="button" accessibilityLabel={`Change ${label.toLowerCase()}`} onPress={() => setOpen(true)}>
        <Text style={[t.base, { color: colors.interactive }]}>Change</Text>
      </Pressable>}
  </View>;
}

export default function QuietHoursScreen() {
  const { colors } = useTheme();
  const { getAccessToken, ready, isAnonymous, accountsConfigured } = useSession();
  const root = useNavigation('/');
  const router = useRouter();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [initial, setInitial] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = quietDraftChanged(prefs, initial);
  const allowExitRef = useAlertEditGuard(dirty, saving || signingIn, busy, 'Your quiet hours changes have not been saved.');
  const close = () => { if (root.canGoBack()) root.goBack(); else router.replace('/profile'); };

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    void (async () => {
      setLoading(true); setLoadFailed(false); setSignedOut(false); setError(null);
      try {
        const token = isAnonymous ? null : await getAccessToken();
        if (controller.signal.aborted) return;
        if (!token) { setSignedOut(true); setPrefs(null); setInitial(null); return; }
        const loaded = await fetchNotificationPreferences(token, controller.signal);
        if (controller.signal.aborted) return;
        const next: NotificationPreferences = {
          quietHoursEnabled: loaded?.quietHoursEnabled ?? false,
          quietStartMinute: loaded?.quietStartMinute ?? DEFAULT_START_MINUTE,
          quietEndMinute: loaded?.quietEndMinute ?? DEFAULT_END_MINUTE,
          timezone: loaded?.timezone || deviceTimezone(),
          safetyOverridesQuiet: loaded?.safetyOverridesQuiet ?? true,
        };
        setPrefs(next); setInitial(next);
      } catch { if (!controller.signal.aborted) setLoadFailed(true); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [ready, isAnonymous, getAccessToken, reload]);

  const save = async () => {
    if (busy.current || !prefs || !quietWindowValid(prefs) || !dirty) return;
    busy.current = true; setSaving(true); setError(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('No session');
      const saved = await updateNotificationPreferences(token, prefs);
      setPrefs(saved); setInitial(saved);
      allowExitRef.current = true;
      busy.current = false;
      close();
    } catch { setError('Could not save quiet hours. Your changes are still here. Try again.'); }
    finally { busy.current = false; setSaving(false); }
  };
  const zone = deviceTimezone();
  const valid = prefs ? quietWindowValid(prefs) : false;
  const patch = (next: Partial<NotificationPreferences>) => setPrefs(current => current ? { ...current, ...next } : current);

  return <AlertCreationFrame error={error}
    secondary={{ label: prefs && !loadFailed ? 'Cancel' : 'Close', onPress: close, disabled: saving || signingIn }}
    primary={prefs && !loadFailed ? { label: saving ? 'Saving…' : 'Save', onPress: () => void save(), busy: saving, disabled: loading || !dirty || !valid } : undefined}>
    <Stack.Screen options={{ title: 'Quiet hours', gestureEnabled: !saving && !signingIn }} />
    <ScrollView contentContainerStyle={styles.content} pointerEvents={saving ? 'none' : 'auto'} accessibilityElementsHidden={saving}>
      {loading ? <ActivityIndicator color={colors.interactive} accessibilityLabel="Loading quiet hours" /> : loadFailed ? <>
        <Text style={[styles.title, { color: colors.text }]}>Couldn’t load quiet hours</Text>
        <Text style={[t.base, { color: colors.textMuted }]}>Connect to load your account settings. Nothing has changed.</Text>
        <Pressable accessibilityRole="button" style={styles.action} onPress={() => setReload(n => n + 1)}><Text style={[t.base, { color: colors.interactive }]}>Try again</Text></Pressable>
      </> : signedOut ? <>
        <Text style={[styles.title, { color: colors.text }]}>Sign in to set quiet hours</Text>
        <Text style={[t.base, { color: colors.textMuted }]}>Your schedule applies to every device signed into your account.</Text>
        {accountsConfigured ? <AppleSignInButton onBusyChange={value => { busy.current = value; setSigningIn(value); }} onSignedIn={() => setReload(n => n + 1)} /> : <Text style={[t.base, { color: colors.textMuted }]}>Sign-in is unavailable in this build.</Text>}
      </> : prefs ? <>
        <View style={[styles.row, { backgroundColor: colors.card }]}>
          <View style={styles.body}><Text style={[styles.title, { color: colors.text }]}>Quiet hours</Text><Text style={[t.sm, { color: colors.textMuted }]}>Skip notifications on a daily schedule.</Text></View>
          <Switch accessibilityLabel="Quiet hours" value={prefs.quietHoursEnabled} onValueChange={quietHoursEnabled => patch({ quietHoursEnabled })} trackColor={{ true: colors.interactive, false: colors.border }} />
        </View>
        <View style={[styles.schedule, { backgroundColor: colors.card }]}>
          <TimeField label="From" minute={prefs.quietStartMinute ?? DEFAULT_START_MINUTE} onChange={quietStartMinute => patch({ quietStartMinute })} />
          <TimeField label="Until" minute={prefs.quietEndMinute ?? DEFAULT_END_MINUTE} onChange={quietEndMinute => patch({ quietEndMinute })} />
          {!valid ? <Text accessibilityRole="alert" style={[t.sm, { color: colors.error }]}>Start and end must be different.</Text> : null}
          <Text style={[t.sm, { color: colors.textMuted }]}>{timezoneLabel(prefs.timezone)}</Text>
          {prefs.timezone !== zone ? <>
            <Text style={[t.sm, { color: colors.textMuted }]}>This phone uses {timezoneLabel(zone)}.</Text>
            <Pressable style={styles.action} accessibilityRole="button" onPress={() => patch({ timezone: zone })}><Text style={[t.sm, { color: colors.interactive }]}>Use this phone’s time</Text></Pressable>
          </> : null}
        </View>
        {prefs.quietHoursEnabled ? <>
          <View style={[styles.row, { backgroundColor: colors.card }]}>
            <View style={styles.body}><Text style={[styles.title, { color: colors.text }]}>Allow rising-water warnings</Text></View>
            <Switch accessibilityLabel="Allow rising-water warnings during quiet hours" value={prefs.safetyOverridesQuiet} onValueChange={safetyOverridesQuiet => patch({ safetyOverridesQuiet })} trackColor={{ true: colors.interactive, false: colors.border }} />
          </View>
          <Text style={[t.sm, { color: colors.textMuted }]}>{prefs.safetyOverridesQuiet ? 'Alerts when water rises into high or dangerous conditions can still arrive. Custom-level alerts are skipped.' : 'Rising-water warnings and custom-level alerts are also skipped during quiet hours.'}</Text>
        </> : <Text style={[t.sm, { color: colors.textMuted }]}>Quiet hours are off. Saving this schedule will not turn them on.</Text>}
        <View style={styles.row}>
          <Text style={[styles.body, t.sm, { color: colors.textMuted }]}>Notifications during quiet hours are skipped, not delivered later.</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Why notifications are not delivered later" style={styles.action} onPress={() => Alert.alert('Why notifications are skipped', 'Water conditions can change overnight. Sending an old alert in the morning could describe conditions that no longer apply. Check Current alerts for current high water and agency notices.')}><ControlIcon name="information-circle-outline" size={22} color={colors.textMuted} /></Pressable>
        </View>
      </> : null}
    </ScrollView>
  </AlertCreationFrame>;
}
const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 24 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 12, borderRadius: 14 },
  body: { flex: 1 },
  title: { ...t.base, fontFamily: fonts.semibold },
  schedule: { padding: 12, borderRadius: 14, gap: 8 },
  timeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 48 },
  action: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-start' },
});
