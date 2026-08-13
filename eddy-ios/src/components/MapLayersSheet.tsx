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
import { EddySymbol } from '@/components/EddySymbol';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import {
  DEFAULT_LAYERS,
  MAP_LAYERS,
  LAYER_SECTIONS,
  SHEET_LAYERS,
  layerKeysFor,
  type LayerKey,
} from '@/map/layers';
import { groupLayerRows, layerRowCount } from '@/map/layerRows';

/**
 * How far an off layer's mark fades.
 *
 * Opacity rather than a muted colour, because the branded marks cannot be
 * recoloured — and it has to stay legible: an off row is still the thing you
 * read to decide whether to switch it ON.
 */
const DIMMED = 0.45;

interface Props {
  visible: boolean;
  onClose: () => void;
  active: LayerKey[];
  onToggle: (key: LayerKey) => void;
  onReset: () => void;
  /** How many of each thing we hold. Absent means "not loaded", not "none". */
  counts?: Partial<Record<LayerKey, number>>;
  /**
   * Refinements for a layer, rendered indented directly beneath its row.
   *
   * The national gauge layer needs a way to say "only the ones running high",
   * and that lived behind a THIRD floating button on the map for one release.
   * Three stacked 44pt buttons down the right edge is exactly the complaint
   * this sheet was built to answer — a permanent tax on the one view that wants
   * every pixel. Refinements belong where the layer is switched on: you turn it
   * on here, you narrow it here, and the map keeps two buttons.
   *
   * Called per TIER on a row that has them, so a refinement still belongs to
   * the layer it narrows rather than to the row that happens to contain it.
   */
  renderLayerDetail?: (key: LayerKey, on: boolean) => React.ReactNode;
}

/** True when the live selection is the one the app opens with. */
export function isDefaultLayers(active: LayerKey[]): boolean {
  return (
    active.length === DEFAULT_LAYERS.length && DEFAULT_LAYERS.every((key) => active.includes(key))
  );
}

export function MapLayersSheet({
  visible,
  onClose,
  active,
  onToggle,
  onReset,
  counts,
  renderLayerDetail,
}: Props) {
  const { colors, floating } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* Tapping the map behind the sheet closes it, which is how every iOS
          popover behaves and what a thumb reaches for first. */}
      <Pressable
        // Scrim colour inline, not in the StyleSheet below: StyleSheet.create
        // runs once at import, so any colour in it is frozen at whichever
        // scheme the app launched with. This one happens to be scheme-neutral,
        // but the invariant is structural — see app-theme.test.ts.
        style={[styles.backdrop, { backgroundColor: colors.scrim }]}
        onPress={onClose}
        accessibilityLabel="Close layers"
      />

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
              <Text style={[styles.reset, { color: colors.interactive }]}>Reset</Text>
            </Pressable>
          )}
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.rows}>
          {/* ── HEADINGS, NOT A FILTER ────────────────────────────────────
              A section groups rows and does nothing else: it has no switch, no
              count and no population, and `groupLayerRows` reorders nothing and
              drops nothing. Camping and Cabins & lodges stay two independent
              switches over two overlapping sets — a place that answers both is
              counted by both rows and still draws one marker, which is why
              nothing here adds the two figures together. */}
          {groupLayerRows(SHEET_LAYERS, LAYER_SECTIONS).map((group) => (
          <View key={group.label ?? 'ungrouped'}>
          {group.label ? (
            <Text style={[styles.sectionHead, { color: colors.textMuted }]}>{group.label}</Text>
          ) : null}
          {(group.rows as typeof SHEET_LAYERS).map((layer) => {
            const keys = layerKeysFor(layer);
            // A row with tiers is on when ANY of them is drawing. There is no
            // third "partly on" state to express: the strip below already says
            // which tiers are live, and a half-lit switch would be a second,
            // vaguer answer to a question the strip answers exactly.
            const on = keys.some((key) => active.includes(key));
            const tint = layer.color(colors);
            // What this row's LIVE tiers account for — summed when they
            // partition, the outermost live one when they nest, `undefined`
            // when nothing of the row is drawing or a tier has not answered
            // yet. The rule and its reasoning live in map/layerRows.ts, where
            // the web suite can execute them.
            const count = layerRowCount(layer, active, counts);
            return (
              <View key={layer.key}>
              <Pressable
                onPress={() => {
                  // Off → on turns on the row's OWN key only. For gauges that
                  // is the rated tier, which is the one carrying a verdict and
                  // the one the app opens with; asking for "gauges" and being
                  // handed several hundred grey reference dots as well would be
                  // answering a bigger question than the switch asked.
                  if (!on) {
                    onToggle(layer.key);
                    return;
                  }
                  // On → off clears every tier, so the switch means what it
                  // shows. Each call is a functional update, so several in one
                  // handler compose rather than racing.
                  for (const key of keys) {
                    if (active.includes(key)) onToggle(key);
                  }
                }}
                style={({ pressed }) => [
                  styles.row,
                  { backgroundColor: pressed ? colors.cardRaised : 'transparent' },
                ]}
                accessibilityRole="switch"
                accessibilityState={{ checked: on }}
                accessibilityLabel={
                  count == null ? layer.label : `${layer.label}, ${count}`
                }
                accessibilityHint={layer.accessibilityHint ?? layer.description}
              >
                {/* ── The well is outlined, not filled ────────────────────
                    It used to fill with the layer tint and print a white
                    glyph on it, and that had to change for two reasons.

                    The small one: Eddy's own marks are fixed-colour art (see
                    EddySymbol) and a coral pin on a coral chip is invisible.

                    The larger one: the fill was a second answer to a question
                    the Switch on the right already answers — the note beside
                    it says "the switch DRAWS the state". What the well is for
                    is the LEGEND, and an icon in the layer's own colour is a
                    truer legend than a white silhouette, because the layer's
                    own colour is what its pins are drawn in. On/off survives
                    in the border, the mark's opacity, and the switch. */}
                <View
                  style={[
                    styles.iconWell,
                    {
                      backgroundColor: colors.cardRaised,
                      borderColor: on ? tint : colors.border,
                    },
                  ]}
                >
                  {layer.symbol ? (
                    <EddySymbol
                      name={layer.symbol}
                      size={17}
                      style={{ opacity: on ? 1 : DIMMED }}
                    />
                  ) : (
                    <Ionicons
                      name={layer.icon}
                      size={15}
                      color={on ? tint : colors.textSubtle}
                    />
                  )}
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
                  {layer.description ? (
                    <Text
                      style={[styles.description, { color: colors.textMuted }]}
                      numberOfLines={1}
                    >
                      {layer.description}
                    </Text>
                  ) : null}
                </View>

                {/* The switch DRAWS the state; the row owns the tap. Letting
                    both be interactive risks a native switch and its parent
                    Pressable both firing on one touch, which would toggle twice
                    and land back where it started — and a whole row is a far
                    better target for a thumb than a 51pt switch. */}
                <View pointerEvents="none">
                  <Switch
                    value={on}
                    trackColor={{ false: colors.border, true: colors.interactive }}
                    // iOS ignores thumbColor on the default track, but Android
                    // needs it told or the thumb stays a stock grey.
                    thumbColor={colors.onInteractive}
                    ios_backgroundColor={colors.border}
                  />
                </View>
              </Pressable>

              {/* ── The tiers ────────────────────────────────────────────
                  Chips rather than switches, and that is the same ruling the
                  gauge filter follows: a switch means "also draw this", a chip
                  means "which of these". Two tiers of one thing are a which,
                  and they are drawn in their own pin colours so the strip is
                  the legend for what appears on the map.

                  Only while the row is on. Tiers of a layer nobody is drawing
                  are a choice with no consequence. */}
              {on && layer.tiers ? (
                <View style={[styles.tiers, { borderLeftColor: colors.border }]}>
                  {layer.tiers.map((key) => {
                    const tier = MAP_LAYERS.find((l) => l.key === key);
                    if (!tier) return null;
                    const tierOn = active.includes(key);
                    const tierTint = tier.color(colors);
                    const tierCount = counts?.[key];
                    // `tierSymbol ?? symbol`, the same fallback `tierLabel`
                    // uses: a tier that wants its own mark says so, and one
                    // that is only ever a tier just sets `symbol`.
                    const tierMark = tier.tierSymbol ?? tier.symbol;
                    return (
                      <Pressable
                        key={key}
                        onPress={() => onToggle(key)}
                        style={({ pressed }) => [
                          styles.tier,
                          {
                            backgroundColor: tierOn ? colors.cardRaised : 'transparent',
                            borderColor: tierOn ? tierTint : colors.border,
                            opacity: pressed ? 0.7 : 1,
                          },
                        ]}
                        accessibilityRole="switch"
                        accessibilityState={{ checked: tierOn }}
                        accessibilityLabel={
                          tierCount == null
                            ? (tier.tierLabel ?? tier.label)
                            : `${tier.tierLabel ?? tier.label}, ${tierCount}`
                        }
                        accessibilityHint={tier.description}
                      >
                        {/* The mark where there is one, the dot where there is
                            not. Both are doing the same job — saying which
                            tier this is — but a dot can only say it by colour,
                            and these two tiers are told apart by whether Eddy
                            graded them, which is a thing a colour cannot say
                            and a face can. The tint is not lost: it is the
                            chip's border, exactly as in the well above. */}
                        {tierMark ? (
                          <EddySymbol
                            name={tierMark}
                            size={15}
                            style={{ opacity: tierOn ? 1 : DIMMED }}
                          />
                        ) : (
                          <View style={[styles.tierDot, { backgroundColor: tierTint }]} />
                        )}
                        <Text
                          style={[
                            styles.tierText,
                            { color: tierOn ? colors.text : colors.textMuted },
                          ]}
                          numberOfLines={1}
                        >
                          {tier.tierLabel ?? tier.label}
                        </Text>
                        {tierCount != null ? (
                          <Text style={[styles.tierCount, { color: colors.textSubtle }]}>
                            {tierCount}
                          </Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              {/* A refinement belongs to the TIER it narrows, not to the row
                  that happens to own that tier — the flow-band chips describe
                  the reference gauges and nothing else. */}
              {layer.tiers
                ? layer.tiers.map((key) => (
                    <View key={`detail-${key}`}>{renderLayerDetail?.(key, active.includes(key))}</View>
                  ))
                : renderLayerDetail?.(layer.key, on)}
              </View>
            );
          })}
          </View>
          ))}
        </ScrollView>

        <Pressable
          onPress={onClose}
          style={({ pressed }) => [
            styles.done,
            {
              backgroundColor: pressed ? colors.interactivePressed : colors.interactive,
            },
          ]}
          accessibilityRole="button"
        >
          <Text style={[styles.doneText, { color: colors.onInteractive }]}>Done</Text>
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
      <Ionicons name="layers-outline" size={19} color={colors.interactive} />
      {changed ? <View style={[styles.dot, { backgroundColor: colors.interactive }]} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
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
  // A heading, sized so it reads as a label over the rows rather than as a row
  // itself — the sheet has one title already and a second thing at title weight
  // would compete with it. Top padding only on the following groups, which the
  // first group does not need because the sheet's own title sits above it.
  sectionHead: {
    ...t.xs,
    fontFamily: fonts.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 4,
    paddingTop: 14,
    paddingBottom: 2,
  },
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
  // Indented under the row they belong to, on the same hairline spine the
  // gauge filter uses — so a strip and the chips that narrow it read as one
  // nested block rather than as two more rows.
  tiers: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginLeft: 30,
    paddingLeft: 10,
    paddingBottom: 4,
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  tier: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 11,
    // 32pt tall rather than 44: these sit inside a modal sheet with a 44pt row
    // above them and no neighbour below to mis-hit, and a full-height chip
    // strip would push Done off a small screen.
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  tierDot: { width: 8, height: 8, borderRadius: 999 },
  tierText: { ...t.xs, fontFamily: fonts.semibold, flexShrink: 1 },
  tierCount: { ...t.xs, fontFamily: fonts.mono },
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
