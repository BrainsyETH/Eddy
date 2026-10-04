import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ControlIcon } from '@/components/ControlIcon';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import {
  installedDirectionsChoices, openDirectionsChoice,
  type DirectionsChoice, type DrivePoint,
} from '@/lib/directionsChoices';

/** Host the chooser next to its trigger, including inside the planner's Modal. */
export function useDirectionsMenu() {
  const [request, setRequest] = useState<{ point: DrivePoint } | null>(null);
  const active = useRef<typeof request>(null);
  const showDirections = (destination: DrivePoint) => {
    if (active.current) return;
    const next = { point: destination };
    active.current = next;
    setRequest(next);
  };
  const close = useCallback(() => {
    // An older handoff finishing must not close a newly opened destination.
    if (active.current !== request) return;
    active.current = null;
    setRequest(null);
  }, [request]);
  return {
    showDirections,
    directionsMenu: request ? <DirectionsMenu point={request.point} onClose={close} /> : null,
  };
}

function DirectionsMenu({ point, onClose }: { point: DrivePoint; onClose: () => void }) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion(true);
  const [choices, setChoices] = useState<DirectionsChoice[]>([]);
  const [showChooser, setShowChooser] = useState(false);
  const [opening, setOpening] = useState(false);
  const openingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const choose = useCallback(async (choice: DirectionsChoice) => {
    if (openingRef.current) return;
    openingRef.current = true;
    setOpening(true);
    setError(null);
    try {
      await openDirectionsChoice(choice, (url) => Linking.openURL(url));
      onClose();
    } catch {
      setError(`Could not open ${choice.label}. Please try again.`);
      setShowChooser(true);
    } finally {
      openingRef.current = false;
      setOpening(false);
    }
  }, [onClose]);

  useEffect(() => {
    let live = true;
    void installedDirectionsChoices(point, (url) => Linking.canOpenURL(url)).then((installed) => {
      if (!live) return;
      setChoices(installed);
      // Do not infer Apple-only availability while optional probes are pending.
      // Keep the Modal unmounted for a direct handoff, avoiding a chooser flash.
      if (installed.length === 1 && installed[0].app === 'apple') void choose(installed[0]);
      else setShowChooser(true);
    });
    return () => { live = false; };
  }, [point, choose]);

  if (!showChooser) return null;

  return (
    <Modal visible transparent animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={onClose}>
      <SafeAreaProvider>
        <View style={styles.container}>
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]}
            onPress={onClose} accessible={false}
          />
          <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.safeArea} pointerEvents="box-none">
            <View style={[styles.sheet, { backgroundColor: colors.card }]} accessibilityViewIsModal onAccessibilityEscape={onClose}>
              <ScrollView bounces={false} style={styles.scroll} contentContainerStyle={styles.content}>
                <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Open {point.name} in…</Text>
                {(['Driving directions', 'Outdoor maps'] as const).map((group) => {
                  const rows = choices.filter((choice) => choice.group === group);
                  if (!rows.length) return null;
                  return (
                    <View key={group} style={group === 'Outdoor maps' ? [styles.outdoor, { borderTopColor: colors.border }] : undefined}>
                      <Text accessibilityRole="header" style={[styles.group, { color: colors.textMuted }]}>{group}</Text>
                      {rows.map((choice) => (
                        <Pressable
                          key={choice.app} onPress={() => void choose(choice)} disabled={opening}
                          accessibilityRole="button" accessibilityState={{ disabled: opening }}
                          accessibilityLabel={`Open ${point.name} in ${choice.label}`}
                          style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.cardRaised : colors.card, opacity: opening ? 0.5 : 1 }]}
                        >
                          <ControlIcon name={group === 'Outdoor maps' ? 'map-outline' : 'car-outline'} size={20} color={colors.textMuted} />
                          <Text style={[styles.label, { color: colors.text }]}>{choice.label}</Text>
                          <ControlIcon name="open-outline" size={17} color={colors.textSubtle} />
                        </Pressable>
                      ))}
                    </View>
                  );
                })}
                {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.text }]}>{error}</Text> : null}
              </ScrollView>
              <Pressable onPress={onClose} accessibilityRole="button" style={[styles.cancel, { borderTopColor: colors.border }]}>
                <Text style={[styles.cancelText, { color: colors.interactive }]}>Cancel</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'flex-end' },
  safeArea: { maxHeight: '100%', padding: 12 },
  sheet: { maxHeight: '100%', width: '100%', maxWidth: 480, alignSelf: 'center', borderRadius: 24, overflow: 'hidden' },
  scroll: { flexShrink: 1 },
  content: { paddingTop: 20, paddingBottom: 8 },
  title: { ...t.lg, fontFamily: fonts.semibold, paddingHorizontal: 20, marginBottom: 12 },
  group: { ...t.xs, fontFamily: fonts.medium, paddingHorizontal: 20, paddingVertical: 8 },
  row: { minHeight: 52, paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { ...t.base, flex: 1 },
  outdoor: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, marginTop: 8 },
  error: { ...t.sm, paddingHorizontal: 20, paddingVertical: 12 },
  cancel: { minHeight: 52, padding: 14, alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth },
  cancelText: { ...t.base, fontFamily: fonts.semibold },
});
