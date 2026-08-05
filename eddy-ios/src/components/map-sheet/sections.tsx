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
import { EddySymbol } from '@/components/EddySymbol';
import { accessTypeSymbol } from './placeSymbol';

export function Section({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  if (!children) return null;
  return (
    <View style={styles.section}>
      {title ? (
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{title}</Text>
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
    <View style={styles.chips}>
      {types.map((type) => {
        const symbol = accessTypeSymbol(type);
        return (
          <View key={type} style={[styles.chip, { backgroundColor: colors.cardRaised }]}>
            {symbol ? <EddySymbol name={symbol} size={14} /> : null}
            <Text style={[styles.chipText, { color: colors.textMuted }]}>
              {accessTypeLabel(type)}
            </Text>
          </View>
        );
      })}
      {accessPoint.feeRequired ? (
        <View style={[styles.chip, { backgroundColor: colors.cardRaised }]}>
          <Text style={[styles.chipText, { color: colors.textMuted }]}>Fee required</Text>
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
 * ── Late, never blocking ──────────────────────────────────────────────────
 * Absent until the detail request lands, and absent for good if it fails. The
 * sheet is fully usable without it — Directions and "Use as put-in" are live
 * from the first frame — so this appears underneath them rather than reserving
 * a space that then has to be filled or explained.
 */
export function AccessGaugeReading({
  status,
  onOpenGauge,
}: {
  status: AccessPointGaugeStatus | null | undefined;
  onOpenGauge: (siteId: string) => void;
}) {
  const { colors, isDark } = useTheme();
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
      style={({ pressed }) => [styles.readingBlock, { opacity: pressed ? 0.6 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={`${status.gaugeName}, ${status.label}. Open the gauge`}
    >
      <View style={styles.readingRow}>
        {reading ? (
          <Text style={[styles.reading, { color: conditionText(status.level, isDark) }]}>
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
      </View>
      <Text style={[styles.gaugeName, { color: colors.textMuted }]} numberOfLines={2}>
        at {status.gaugeName}
      </Text>
    </Pressable>
  );
}

/**
 * A tappable row. Chevron for somewhere in the app, the outward arrow for
 * somewhere that is not — the distinction is worth a glyph, because one of
 * them leaves for Safari or the phone app.
 */
export function LinkRow({
  label,
  detail,
  external = false,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  detail?: string | null;
  external?: boolean;
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
        color={colors.textSubtle}
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
  sectionTitle: { ...t.sm, fontFamily: fonts.semibold, marginBottom: 6 },
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
  // The reading's own chip is NOT the badge chip above it: it carries a
  // condition tint and therefore a border, and its label is the verdict rather
  // than a category. Same pill, different weight — kept apart so restyling the
  // type badges cannot quietly restyle a condition.
  readingBlock: { marginTop: 10 },
  readingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reading: { ...t.lg, fontFamily: fonts.mono },
  readingChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  readingChipText: { ...t.sm, fontFamily: fonts.semibold },
  gaugeName: { ...t.sm, fontFamily: fonts.body, marginTop: 3 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  linkText: { flex: 1, minWidth: 0 },
  linkLabel: { ...t.sm, fontFamily: fonts.medium },
  linkDetail: { ...t.sm, fontFamily: fonts.body, marginTop: 1 },
  absent: { ...t.sm, fontFamily: fonts.body, marginTop: 14 },
});
