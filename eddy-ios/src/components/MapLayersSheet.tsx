// eddy-ios/src/components/MapLayersSheet.tsx
// Which layers the map is drawing — a button on the map and a sheet behind it.
//
// ── Why this replaced the chip row ──────────────────────────────────────────
// The map used to carry a horizontally-scrolling row of five filter chips under
// the search field. Three things were wrong with it, and they are the reasons
// this file exists:
//
//   1. It spent a permanent band of a phone screen — the row plus its padding —
//      on a control most people touch once a session, on the one screen whose
//      job is showing as much river as possible.
//   2. Chips past the third one lived off the right edge. A layer you cannot see
//      is a layer that does not exist, so "Outfitters" was effectively hidden.
//   3. A bordered pill is a weak on/off signal. People read chips as "filter to
//      this", which is what they mean in River Reports — but here they are
//      independent layers, and the two meanings were wearing the same clothes.
//
// The pattern every map app converged on instead is a small layers button over
// the map opening a list of labelled switches (Apple Maps, Gaia, onX, AllTrails
// all do this). A switch is unambiguous, a row has space for a sentence saying
// what the layer actually is, and the map keeps its pixels.
//
// ── Deliberate details ──────────────────────────────────────────────────────
// • The backdrop is light and the sheet is bottom-anchored, so a good half of
//   the map stays visible while toggling: you watch the pins arrive rather than
//   flipping a switch, dismissing, and hoping.
// • Each row's icon is drawn in the layer's own colour, which makes the sheet a
//   legend as well as a control — the same rule the chips followed.
// • Counts are shown only when the layer's data has actually arrived. A river
//   with no campgrounds should say 0, but a layer that has never been fetched
//   must not claim zero of anything.

import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { DEFAULT_LAYERS, MAP_LAYERS, type LayerKey } from '@/map/layers';

interface Props {
  visible: boolean;
  onClose: () => void;
  active: LayerKey[];
  onToggle: (key: LayerKey) => void;
  onReset: () => void;
  /** How many of each thing we hold. Absent means "not loaded", not "none". */
  counts?: Partial<Record<LayerKey, number>>;
}

/** True when the live selection is the one the app opens with. */
export function isDefaultLayers(active: LayerKey[]): boolean {
  return (
    active.length === DEFAULT_LAYERS.length && DEFAULT_LAYERS.every((key) => active.includes(key))
  );
}

export function MapLayersSheet({ visible, onClose, active, onToggle, onReset, counts }: Props) {
  const { colors, floating } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* Tapping the map behind the sheet closes it, which is how every iOS
          popover behaves and what a thumb reaches for first. */}
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close layers" />

      <View
        style={[
          styles.sheet,
          floating(),
          { backgroundColor: colors.card, paddingBottom: insets.bottom + 12 },
        ]}
      >
        <View style={styles.grabberRow}>
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
        </View>

        <View style={styles.head}>
          <Text style={[styles.title, { color: colors.text }]}>Show on map</Text>
          {isDefaultLayers(active) ? null : (
            <Pressable onPress={onReset} hitSlop={10} accessibilityRole="button">
              <Text style={[styles.reset, { color: colors.accent }]}>Reset</Text>
            </Pressable>
          )}
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.rows}>
          {MAP_LAYERS.map((layer) => {
            const on = active.includes(layer.key);
            const tint = layer.color(colors);
            const count = counts?.[layer.key];
            return (
              <Pressable
                key={layer.key}
                onPress={() => onToggle(layer.key)}
                style={({ pressed }) => [
                  styles.row,
                  { backgroundColor: pressed ? colors.cardRaised : 'transparent' },
                ]}
                accessibilityRole="switch"
                accessibilityState={{ checked: on }}
                accessibilityLabel={
                  count == null ? layer.label : `${layer.label}, ${count}`
                }
                accessibilityHint={layer.description}
              >
                <View
                  style={[
                    styles.iconWell,
                    {
                      backgroundColor: on ? tint : colors.cardRaised,
                      borderColor: on ? tint : colors.border,
                    },
                  ]}
                >
                  <Ionicons
                    name={layer.icon}
                    size={15}
                    color={on ? colors.onAccent : colors.textSubtle}
                  />
                </View>

                <View style={styles.rowText}>
                  <View style={styles.labelRow}>
                    <Text style={[styles.label, { color: colors.text }]} numberOfLines={1}>
                      {layer.label}
                    </Text>
                    {count != null ? (
                      <Text style={[styles.count, { color: colors.textSubtle }]}>{count}</Text>
                    ) : null}
                  </View>
                  <Text style={[styles.description, { color: colors.textMuted }]} numberOfLines={1}>
                    {layer.description}
                  </Text>
                </View>

                {/* The switch DRAWS the state; the row owns the tap. Letting
                    both be interactive risks a native switch and its parent
                    Pressable both firing on one touch, which would toggle twice
                    and land back where it started — and a whole row is a far
                    better target for a thumb than a 51pt switch. */}
                <View pointerEvents="none">
                  <Switch
                    value={on}
                    trackColor={{ false: colors.border, true: colors.accent }}
                    // iOS ignores thumbColor on the default track, but Android
                    // needs it told or the thumb stays a stock grey.
                    thumbColor={colors.onAccent}
                    ios_backgroundColor={colors.border}
                  />
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        <Pressable
          onPress={onClose}
          style={({ pressed }) => [
            styles.done,
            { backgroundColor: pressed ? colors.accentPressed : colors.accent },
          ]}
          accessibilityRole="button"
        >
          <Text style={[styles.doneText, { color: colors.onAccent }]}>Done</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

/**
 * The button that opens the sheet, floated over the map.
 *
 * Carries a dot rather than a number when the selection is not the default. The
 * count of active layers is not information anyone wants — "you have changed
 * this" is.
 */
export function MapLayersButton({
  onPress,
  changed,
}: {
  onPress: () => void;
  changed: boolean;
}) {
  const { colors, floating } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        floating(),
        { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
      ]}
      accessibilityRole="button"
      accessibilityLabel="Map layers"
    >
      <Ionicons name="layers-outline" size={19} color={colors.accent} />
      {changed ? <View style={[styles.dot, { backgroundColor: colors.accent }]} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Light on purpose. A dimmed-to-black map cannot show you what the switch you
  // just flipped did.
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.22)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
  },
  grabberRow: { alignItems: 'center', paddingTop: 8 },
  grabber: { width: 36, height: 4, borderRadius: 999 },
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingTop: 10,
    paddingBottom: 4,
  },
  title: { ...t.lg, fontFamily: fonts.display },
  reset: { ...t.sm, fontFamily: fonts.semibold },
  // Capped so a future sixth layer scrolls rather than pushing Done off screen.
  scroll: { maxHeight: 340 },
  rows: { paddingVertical: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRadius: 12,
  },
  iconWell: {
    width: 30,
    height: 30,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, minWidth: 0 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  label: { ...t.sm, fontFamily: fonts.semibold, flexShrink: 1 },
  count: { ...t.xs, fontFamily: fonts.mono },
  description: { ...t.xs, fontFamily: fonts.body, marginTop: 1 },
  done: {
    alignItems: 'center',
    paddingVertical: 13,
    borderRadius: 12,
    marginTop: 8,
  },
  doneText: { ...t.base, fontFamily: fonts.heading },
  button: {
    position: 'absolute',
    right: 16,
    top: 16,
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: 9,
    right: 9,
    width: 8,
    height: 8,
    borderRadius: 999,
  },
});
