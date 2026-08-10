// eddy-ios/src/components/map-sheet/sections.tsx
// The handful of shapes the sheet is built from — its tabs and its chrome.
//
// Shared rather than repeated because the tabs are the same KIND of thing said
// about different subjects: a heading with facts under it. Four tabs each
// inventing their own spacing would read as four screens that happened to be
// next to each other, which is the opposite of what a tab bar promises.
//
// AccessTypeBadges is here for the same reason one step up: the pill was drawn
// three times — here, in PinSheet's chrome and again in PinCallout — and one of
// those copies is the one a reader sees, so the other two were free to drift.
//
// ── Absent, never empty ───────────────────────────────────────────────────
// Every component here returns null rather than a placeholder when it has
// nothing. That is the rule the access-point detail screen already follows
// (see its header), and it matters more inside a sheet: a row reading
// "Parking: unknown" is a row about the database, and it costs a line of a
// surface that is already competing with the map for the screen.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AccessPointGaugeStatus, MapAccessPoint } from '@eddy/types';
import { accessPointTypes, accessTypeLabel } from '@eddy/types';
import { conditionBg, conditionChipBorder, conditionInk, conditionText } from '@/theme/conditions';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { formatReading } from '@/lib/readingCopy';
import { EddySymbol, type EddySymbolName } from '@/components/EddySymbol';
import { accessTypeSymbol } from './placeSymbol';

/**
 * ── `symbol` IS NOT AVAILABLE TO EVERY HEADING, on purpose ────────────────
 *
 * Three sections take one — Getting in, Parking, Facilities — and they are the
 * same three the full access-point screen marks
 * (app/river/[slug]/access/[accessSlug].tsx). That is the whole rule: the sheet
 * and the screen it links to must not teach different marks for the same
 * heading, and the screen's own note says why the set stops there — giving
 * every heading a sticker turns a scannable column of text into a column of
 * noise.
 *
 * Camping and Outfitters deliberately do NOT take one even though the catalog
 * has both drawings: their rows already carry the mark, in the LinkRow well, so
 * a heading mark would draw the same tent twice nine points apart.
 *
 * ── `children` IS NOT A CONTENT CHECK ─────────────────────────────────────
 * `if (!children)` catches null and undefined and nothing else. A Section whose
 * children are `[<Fact/>, <Prose/>]` has a truthy array however many of them
 * render null, so it draws a heading over a gap. Callers that assemble a section
 * from optional facts must gate the whole Section themselves — see the merged
 * Overview tab, which is where this stopped being theoretical.
 */
export function Section({
  title,
  symbol,
  children,
}: {
  title?: string;
  symbol?: EddySymbolName;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  if (!children) return null;
  return (
    <View style={styles.section}>
      {title ? (
        <View style={styles.sectionHead}>
          {symbol ? <EddySymbol name={symbol} size={15} /> : null}
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{title}</Text>
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** A fact and its name. Absent when there is no fact. */
export function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  const { colors } = useTheme();
  if (!value) return null;
  return (
    <View style={styles.fact}>
      <Text style={[styles.factLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.factValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

/** Free prose — a description, a road note, somebody's tip. */
export function Prose({ children }: { children: string | null | undefined }) {
  const { colors } = useTheme();
  if (!children) return null;
  return <Text style={[styles.prose, { color: colors.text }]}>{children}</Text>;
}

export function Chips({ labels }: { labels: string[] }) {
  const { colors } = useTheme();
  if (!labels.length) return null;
  return (
    <View style={styles.chips}>
      {labels.map((label) => (
        <View key={label} style={[styles.chip, { backgroundColor: colors.cardRaised }]}>
          <Text style={[styles.chipText, { color: colors.textMuted }]}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * WHAT THIS PLACE ACTUALLY IS. A point can carry several of the six types at
 * once — a boat ramp you can also camp at is a different day out from a gravel
 * bar — and the pin's colour can only ever express one of them.
 *
 * Resolved through accessPointTypes so the `types` array wins and a row that
 * predates it still falls back to its single `type`. Rendered even when there is
 * one, because "Access" is information: it is the type that means "somewhere to
 * put a boat in and nothing more".
 *
 * ── Which badges get a mark, and which stay text ──────────────────────────
 * A type is a CATEGORY of place, so it takes the catalog's mark where one
 * exists — and the two that have art are the two that change the plan: a boat
 * ramp means you can back a trailer down, a campground means you can sleep
 * there. Gravel bar, bridge and park have no art yet and show the label alone
 * rather than borrowing a drawing that means something else; see placeSymbol.
 *
 * A FEE IS NOT A CATEGORY. It is a caveat about a place that is already named,
 * so it stays text however many marks the catalog grows — and "Private" is not
 * here at all, because both callers already carry the notice that explains it,
 * and a place does not need telling twice in nine points of vertical space.
 */
export function AccessTypeBadges({ accessPoint }: { accessPoint: MapAccessPoint }) {
  const { colors } = useTheme();
  const types = accessPointTypes(accessPoint);
  if (!types.length && !accessPoint.feeRequired) return null;
  return (
    <View style={styles.types}>
      {types.map((type) => {
        const symbol = accessTypeSymbol(type);
        return (
          <View key={type} style={styles.type}>
            {symbol ? <EddySymbol name={symbol} size={14} /> : null}
            <Text style={[styles.typeText, { color: colors.textMuted }]}>
              {accessTypeLabel(type)}
            </Text>
          </View>
        );
      })}
      {accessPoint.feeRequired ? (
        <View style={styles.type}>
          <Text style={[styles.typeText, { color: colors.textMuted }]}>Fee required</Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * THE WATER AT A PUT-IN — the one fact that decides whether you drive there.
 *
 * ── Why this is shared, and where it is shown ─────────────────────────────
 * It is drawn twice, in two places a reader sees seconds apart: at the top of
 * the sheet's peek, where it is the reason the sheet is worth opening, and
 * again on the Conditions tab with the trend and the timestamp under it. Two
 * copies of a reading are two chances to disagree about what a number means,
 * which is the exact failure shared/flow-band.ts exists to prevent.
 *
 * ── It is the RIVER's gauge, and it says so ───────────────────────────────
 * The server grades this from the nearest at-or-upstream gauge applied to the
 * reach — not from a sensor at this put-in, which does not exist. So the
 * station's NAME is not decoration and is not droppable at small sizes: a
 * reading with no station on it reads as measured here.
 *
 * ── Late, but no longer unannounced ───────────────────────────────────────
 * Still absent until the detail request lands. What changed is that the PEEK no
 * longer lets that absence move it: PeekSlot reserves the row's height from the
 * first frame and this fades into it. The tabs, which scroll, keep the original
 * behaviour of simply appearing.
 *
 * ── `compact` is a rank, not a size ───────────────────────────────────────
 * The full block spends two lines — a 18pt mono reading with its chip, then the
 * station underneath — which is right on a tab you swiped to in order to read
 * the water. In the peek it was 50pt of the one surface competing with the map,
 * directly above an availability card and an action row, for a fact the reader
 * mostly wants to GLANCE at. Compact puts the same three things on one line and
 * keeps the single tap target, so nothing is lost but the height.
 */
export function AccessGaugeReading({
  status,
  onOpenGauge,
  compact = false,
  pending = false,
  pendingLabel,
}: {
  status: AccessPointGaugeStatus | null | undefined;
  onOpenGauge: (siteId: string) => void;
  /** One line, for the peek. Two, for a tab. */
  compact?: boolean;
  /**
   * Draw the row's SHAPE with nothing in it yet.
   *
   * The peek reserves this row's height by mounting it (see GlanceSlot), and a
   * plain line of text would reserve the wrong thing: the row's height comes
   * from the CHIP, which is taller than its own text by its padding and border.
   * So the placeholder is a chip too.
   */
  pending?: boolean;
  pendingLabel?: string;
}) {
  const { colors, isDark } = useTheme();

  if (pending) {
    return (
      <View style={[compact ? styles.readingCompact : styles.readingBlock, styles.readingRow]}>
        <View
          style={[
            styles.readingChip,
            { backgroundColor: colors.cardRaised, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.readingChipText, { color: colors.textSubtle }]} numberOfLines={1}>
            {pendingLabel ?? 'Checking water…'}
          </Text>
        </View>
      </View>
    );
  }

  if (!status) return null;

  const reading =
    status.cfs != null
      ? formatReading(status.cfs, 'cfs')
      : status.heightFt != null
        ? formatReading(status.heightFt, 'ft')
        : null;

  return (
    <Pressable
      onPress={() => onOpenGauge(status.usgsId)}
      // One tap target over the number, the chip and the station name, because
      // all three are the same fact and all three lead to the same screen.
      style={({ pressed }) => [
        compact ? styles.readingCompact : styles.readingBlock,
        { opacity: pressed ? 0.6 : 1 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${status.gaugeName}, ${status.label}. Open the gauge`}
    >
      <View style={styles.readingRow}>
        {reading ? (
          <Text
            style={[
              compact ? styles.readingSmall : styles.reading,
              { color: conditionText(status.level, isDark) },
            ]}
          >
            {reading}
          </Text>
        ) : null}
        {/* The number and its verdict on one line: a reading means nothing
            without the band it sits in, and the band means less without the
            number. The same rule the river row is built on. */}
        <View
          style={[
            styles.readingChip,
            {
              backgroundColor: conditionBg(status.level),
              borderColor: conditionChipBorder(status.level),
            },
          ]}
        >
          <Text style={[styles.readingChipText, { color: conditionInk(status.level) }]}>
            {status.label}
          </Text>
        </View>
        {/* Compact keeps the station on the SAME line and lets it truncate.
            Dropping it instead would have been smaller and dishonest: this is
            the reach's nearest at-or-upstream gauge, not a sensor at the put-in,
            and a reading with no station on it reads as measured here. Truncated
            is still attributed; absent is not. */}
        {compact ? (
          <Text style={[styles.gaugeNameInline, { color: colors.textMuted }]} numberOfLines={1}>
            at {status.gaugeName}
          </Text>
        ) : null}
      </View>
      {compact ? null : (
        <Text style={[styles.gaugeName, { color: colors.textMuted }]} numberOfLines={2}>
          at {status.gaugeName}
        </Text>
      )}
    </Pressable>
  );
}

/**
 * A tappable row. Chevron for somewhere in the app, the outward arrow for
 * somewhere that is not — the distinction is worth a glyph, because one of
 * them leaves for Safari or the phone app.
 *
 * ── `symbol` marks the DESTINATION, and only sometimes ────────────────────
 * A leading Eddy mark says what kind of thing is on the other side of the tap —
 * a river, a gauge, a place. That is worth drawing on rows that leave for
 * somewhere, and it is emphatically not worth drawing on every row: a sheet
 * where each fact has a picture beside it is a sticker sheet. Identity at the
 * top and on destinations; everything else stays quiet and native.
 *
 * The mark is decorative, so it carries no accessibility text of its own — the
 * label beside it already names where the row goes, and EddySymbol hides itself
 * from the tree.
 */
export function LinkRow({
  label,
  detail,
  external = false,
  externalTint,
  symbol,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  detail?: string | null;
  external?: boolean;
  /**
   * A colour for the outbound glyph, where the DESTINATION has one.
   *
   * The glyph only. Not the label, not the row — see AIRBNB_LINK_COLOR in
   * lib/stays.ts for the contrast arithmetic that draws the line exactly there,
   * and for why a third party's hex does not belong in the palette. Omitted
   * everywhere else, which is nearly everywhere: `colors.textSubtle` is the
   * default because an outbound arrow is chrome, and a row that is not going
   * somewhere branded has no business being tinted.
   */
  externalTint?: string;
  /** The kind of thing this row opens. Omit on rows that are not destinations. */
  symbol?: EddySymbolName;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.linkRow, { opacity: pressed ? 0.6 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
    >
      {symbol ? (
        <View style={[styles.linkWell, { backgroundColor: colors.cardRaised }]}>
          <EddySymbol name={symbol} size={16} />
        </View>
      ) : null}
      <View style={styles.linkText}>
        <Text style={[styles.linkLabel, { color: colors.text }]} numberOfLines={1}>
          {label}
        </Text>
        {detail ? (
          <Text style={[styles.linkDetail, { color: colors.textMuted }]} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
      <Ionicons
        name={external ? 'open-outline' : 'chevron-forward'}
        size={16}
        color={external && externalTint ? externalTint : colors.textSubtle}
      />
    </Pressable>
  );
}

/**
 * What a tab says when the request has not landed, or landed with nothing.
 *
 * One line, in the quiet ink, and never a spinner: the sheet is already useful
 * without any of this, and a spinner would claim otherwise.
 */
export function Absent({ children }: { children: string }) {
  const { colors } = useTheme();
  return <Text style={[styles.absent, { color: colors.textMuted }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  section: { marginTop: 14 },
  // The mark sits on the heading's row, and the row carries the margin the
  // title used to. Keeping `marginBottom` on the text as well would double it
  // for a marked heading and leave marked and unmarked sections on different
  // rhythms down one scroll.
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  sectionTitle: { ...t.sm, fontFamily: fonts.semibold },
  fact: { flexDirection: 'row', gap: 10, marginTop: 4 },
  factLabel: { ...t.sm, fontFamily: fonts.medium, width: 96 },
  factValue: { ...t.sm, fontFamily: fonts.body, flex: 1 },
  prose: { ...t.sm, fontFamily: fonts.body, marginTop: 4, lineHeight: 20 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  // A row, because a badge may carry a mark before its label. The gap does
  // nothing on the ones that do not, so both kinds keep the same pill.
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  chipText: { ...t.sm, fontFamily: fonts.medium },
  // ── A METADATA ROW, NOT A SECOND TAB BAR ────────────────────────────────
  // AccessTypeBadges used to borrow `chips`/`chip` above. In the tabbed sheet
  // it lands directly on top of SheetTabBar, so a row of filled pills read as
  // a second row of navigation: two horizontal bands of rounded things, only
  // one of which moves you anywhere. The FILL and the RADIUS were the whole of
  // that signal — the marks and the labels never were, so they stay.
  //
  // Kept apart from `chip` deliberately, not for tidiness. `Chips` draws the
  // amenity tags on the Camping tab and those genuinely are tags; de-pilling
  // them as a side effect of editing a shared style is the exact collateral
  // the readingChip note below already warns about.
  //
  // Still wraps. A metadata LINE would have to truncate — PlaceHead's subtitle
  // is numberOfLines={1} — and "campground" is the word that would go.
  types: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 8 },
  // A row, because a type may carry a mark before its label. The gap collapses
  // to nothing on the three that have no art yet.
  type: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  typeText: { ...t.sm, fontFamily: fonts.medium },
  // The reading's own chip is NOT the badge chip above it: it carries a
  // condition tint and therefore a border, and its label is the verdict rather
  // than a category. Same pill, different weight — kept apart so restyling the
  // type badges cannot quietly restyle a condition.
  readingBlock: { marginTop: 10 },
  // No marginTop: PeekSlot owns the spacing above it, and a second one here
  // would be added to the reserved box rather than absorbed by it.
  readingCompact: {},
  readingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reading: { ...t.lg, fontFamily: fonts.mono },
  // t.sm, so the row's height is the chip's and the whole thing fits
  // WATER_SLOT_HEIGHT. The number keeps the mono face and the condition ink —
  // it is the same fact at a different rank, not a different fact.
  readingSmall: { ...t.sm, fontFamily: fonts.mono },
  readingChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  readingChipText: { ...t.sm, fontFamily: fonts.semibold },
  gaugeName: { ...t.sm, fontFamily: fonts.body, marginTop: 3 },
  // flexShrink so the station is what gives way on a narrow screen — the number
  // and its verdict are fixed-width and must never be the thing that truncates.
  gaugeNameInline: { ...t.sm, fontFamily: fonts.body, flexShrink: 1, minWidth: 0 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  // A well rather than a bare mark, for the reason MapLayersSheet's rows use
  // one: the catalog's aspect ratios vary, so an unframed drawing changes the
  // row's optical left edge from one destination to the next.
  linkWell: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkText: { flex: 1, minWidth: 0 },
  linkLabel: { ...t.sm, fontFamily: fonts.medium },
  linkDetail: { ...t.sm, fontFamily: fonts.body, marginTop: 1 },
  absent: { ...t.sm, fontFamily: fonts.body, marginTop: 14 },
});
