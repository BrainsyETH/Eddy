import { useState } from 'react';
import { Linking, StyleSheet, Switch, Text, View } from 'react-native';
import { useFloatSession } from '@/hooks/useFloatSession';
import { floatActivityControlState } from '@/lib/floatActivityVisibility';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { EssentialsButton } from './essentialsUi';
import { hideFloatActivity, showFloatActivity, useFloatActivity, useFloatActivityHidden } from './liveActivity';

/** Hiding the card is remembered for this float and never ends tracking. */
export function FloatActivityControl() {
  const availability = useFloatActivity();
  const session = useFloatSession();
  const hidden = useFloatActivityHidden(session?.id);
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = floatActivityControlState(availability, hidden);
  if (!state.visible || !session) return null;
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try { await action(); }
    catch { setError('Couldn’t change the Lock Screen setting. Please try again.'); }
    finally { setBusy(false); }
  };
  return <View style={styles.group}>
    <View style={styles.row}>
      <Text style={[styles.label, { color: colors.text }]}>Show on Lock Screen</Text>
      {!state.settings ? <Switch value={state.on} disabled={busy} accessibilityLabel="Show on Lock Screen" accessibilityState={{ busy }}
        trackColor={{ true: colors.accentFill }} onValueChange={on => void run(() => on ? showFloatActivity(session) : hideFloatActivity(session))} /> : null}
    </View>
    {state.note ? <Text style={[styles.note, { color: colors.textMuted }]}>{state.note}</Text> : null}
    {state.settings ? <EssentialsButton label="Open Settings" plain disabled={busy} onPress={() => void run(() => Linking.openSettings())} /> : null}
    {error ? <Text style={[styles.note, { color: colors.error }]} accessibilityRole="alert">{error}</Text> : null}
  </View>;
}
const styles = StyleSheet.create({
  group: { gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingVertical: 8 },
  note: { ...t.sm, fontFamily: fonts.body },
  label: { ...t.base, fontFamily: fonts.semibold, flex: 1 },
});
