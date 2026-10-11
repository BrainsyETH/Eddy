import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { getFloatSession } from '@/lib/floatSessionStore';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { floatActivitySettled, syncFloatActivity, useFloatActivity } from './liveActivity';

/** A dismissed/expired activity only returns after an explicit action here. */
export function FloatActivityControl() {
  const availability = useFloatActivity();
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  if (availability === 'unavailable') return null;
  if (availability === 'active') {
    return <Text style={[styles.note, { color: colors.textMuted }]}>Float progress is on your Lock Screen. Tap it to return here.</Text>;
  }
  const disabled = availability === 'disabled';
  const show = async () => {
    if (busy) return;
    if (disabled) { await Linking.openSettings(); return; }
    const session = getFloatSession();
    if (!session) return;
    setBusy(true);
    try {
      void syncFloatActivity(session, { start: true });
      await floatActivitySettled();
    }
    finally { setBusy(false); }
  };
  return (
    <View style={styles.group}>
      <Text style={[styles.note, { color: colors.textMuted }]}>
        {disabled
          ? 'Live Activities are off for Eddy. You can enable them in Settings.'
          : availability === 'error'
            ? 'The Lock Screen card couldn’t update. Your float is still running.'
            : 'See float progress without keeping Eddy open. Tracking permissions still apply.'}
      </Text>
      <Pressable onPress={() => void show()} disabled={busy} accessibilityRole="button"
        style={[styles.button, { borderColor: colors.border, opacity: busy ? 0.5 : 1 }]}>
        <Text style={[styles.label, { color: colors.interactive }]}>
          {disabled ? 'Open Settings' : busy ? 'Showing…' : 'Show on Lock Screen'}
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
