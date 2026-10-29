import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFloatSession } from '@/hooks/useFloatSession';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { hideFloatActivity, showFloatActivity, useFloatActivity, useFloatActivityHidden } from './liveActivity';

/**
 * A dismissed/expired activity only returns after an explicit action here.
 * "Hide Lock Screen card" ends the card without ending the float, and is
 * remembered for this float (src/lib/floatActivityVisibility.ts).
 */
export function FloatActivityControl() {
  const availability = useFloatActivity();
  const session = useFloatSession();
  const hidden = useFloatActivityHidden(session?.id);
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  if (availability === 'unavailable' || !session) return null;
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await action(); }
    finally { setBusy(false); }
  };
  if (availability === 'active' && !hidden) {
    return (
      <View style={styles.group}>
        <Text style={[styles.note, { color: colors.textMuted }]}>On your Lock Screen · Tap to return to your float.</Text>
        <Pressable onPress={() => void run(() => hideFloatActivity(session))} disabled={busy} accessibilityRole="button"
          accessibilityHint="Removes the card. Tracking continues."
          style={[styles.button, { borderColor: colors.border, opacity: busy ? 0.5 : 1 }]}>
          <Text style={[styles.label, { color: colors.interactive }]}>{busy ? 'Hiding…' : 'Hide Lock Screen card'}</Text>
        </Pressable>
      </View>
    );
  }
  const disabled = availability === 'disabled';
  const show = async () => {
    if (disabled) { await Linking.openSettings(); return; }
    await run(() => showFloatActivity(session));
  };
  return (
    <View style={styles.group}>
      <Text style={[styles.note, { color: colors.textMuted }]}>
        {disabled
          ? 'Live Activities are off for Eddy. You can enable them in Settings.'
          : hidden
            ? 'Hidden from your Lock Screen. Your float is still being tracked.'
            : availability === 'error'
              ? 'The Lock Screen card couldn’t update. Your float is still running.'
              : availability === 'expired'
                ? 'iOS ends Lock Screen cards after eight hours. Your float is still running; show the card again to keep following it.'
                : 'See your float on the Lock Screen and Dynamic Island.'}
      </Text>
      <Pressable onPress={() => void show()} disabled={busy} accessibilityRole="button"
        style={[styles.button, { borderColor: colors.border, opacity: busy ? 0.5 : 1 }]}>
        <Text style={[styles.label, { color: colors.interactive }]}>
          {disabled ? 'Open Settings' : busy ? 'Showing…' : hidden ? 'Show Lock Screen card' : 'Show Live Activity'}
        </Text>
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  group: { gap: 8 },
  note: { ...t.sm, fontFamily: fonts.body },
  button: { minHeight: 48, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  label: { ...t.base, fontFamily: fonts.semibold },
});
