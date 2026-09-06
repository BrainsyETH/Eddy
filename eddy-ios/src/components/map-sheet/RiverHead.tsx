// eddy-ios/src/components/map-sheet/RiverHead.tsx
// WHO the river sheet is about, and what the water is doing — the river's
// PlaceHead.
//
// ── Why this exists ───────────────────────────────────────────────────────
//
// A pin got a 44pt art well, a semantic badge, a 16pt heading and 44pt controls;
// a river got a 14pt semibold string. The two sheets open in the same corner of
// the same screen seconds apart, so they were reading as though two different
// products had authored them. Same geometry as PlaceHead — FRAME 44, MARK 32,
// CONTROL 44, EDGE_BLEED 10 — because the point is that they are the same
// component family, not that they are similar.
//
// ── The condition is in the GLANCE, not below the fold ────────────────────
//
// It used to live in the Conditions tab, under the collapsed detent, so a reader
// had to drag a sheet to learn the one thing that decides whether they keep
// looking. Everything drawn here is built from memory — the statewide network
// carries each river's gauges and their ladders and the map screen holds the
// access points it drew — so there is no request behind any of it and no
// reservation is needed. See peekSlot.ts for what the pin sheet has to do
// instead, and why rivers are the easy case.
//
// ── Eddy's line reads the cache and NEVER fetches ─────────────────────────
//
// useCachedEddyUpdate, not useEddyUpdates. The ordinary hook initiates, and on a
// cold open of the Map tab the shared cache is empty — so mounting it here would
// fire a request on tap, which is exactly the rule above broken. The cached
// reader subscribes and reads, and if nothing has filled the cache the line is
// simply absent.
//
// It SUBSCRIBES rather than peeking once, and that distinction is the whole
// reason it is a hook. A sheet opened before the Today tab's fetch lands would
// read nothing and, with a one-shot peek, stay blank for its whole life even
// though the data arrived a moment later.
//
// ── NOT floatableHeadline ─────────────────────────────────────────────────
//
// The obvious move is to reuse `floatableHeadline`, and RiverConditionsTab did.
// It is the wrong helper here and it was saying something false: it counts a
// LIST OF RIVERS and phrases itself accordingly, so a river with three gauges of
// which two are floatable rendered "2 of 3 rivers are floatable right now" — on
// a sheet about one river. A river's own verdict is its condition, which is what
// the map already colours its line with.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import {
  conditionBg,
  conditionChipBorder,
  conditionChipInk,
  conditionColor,
  conditionLongLabel,
} from '@/theme/conditions';
import { EddySymbol } from '@/components/EddySymbol';
import { useCachedEddyUpdate } from '@/hooks/useEddyUpdates';
import { selectEddySays } from '@/lib/eddySays';
import type { RiverSheetData } from './riverTabs';

/** All four match PlaceHead's, deliberately. See the header. */
const FRAME = 44;
const MARK = 32;
const CONTROL = 44;
const EDGE_BLEED = 10;

export function RiverHead({
  river,
  onClose,
  onOpenGauge,
}: {
  river: RiverSheetData;
  onClose: () => void;
  onOpenGauge: (siteId: string) => void;
}) {
  const { colors, isDark } = useTheme();
  const says = selectEddySays(useCachedEddyUpdate(river.slug));

  // The station the river is graded on. Falls back to the first, because a river
  // with gauges but none flagged primary still has a reading worth showing and
  // an empty row would be a worse answer than an unflagged one.
  const primary = river.gauges.find((gauge) => gauge.isPrimary) ?? river.gauges[0] ?? null;

  return (
    <View style={styles.header}>
      <View style={styles.row}>
        <View style={styles.frame}>
          <View style={[styles.well, { backgroundColor: colors.cardRaised }]}>
            <EddySymbol name="river" size={MARK} />
          </View>
          {/* The art says WHAT it is, the badge says what the water is doing —
              the map's own split, and the reason the mark is not recoloured:
              these are fixed-colour three-tone drawings and a mark asked to
              carry state would lose it. borderColor inline, and white in BOTH
              schemes, for the reason PlaceHead's badge documents. */}
          <View
            style={[
              styles.badge,
              { backgroundColor: conditionColor(river.code), borderColor: '#FFFFFF' },
            ]}
          />
        </View>

        <View style={styles.text}>
          {/* The sheet's only heading, for the reason PlaceHead's is: the
              rotor's heading list is how a VoiceOver reader answers "which
              river am I reading now" on a screen whose subject changes under a
              stationary layout. */}
          <Text
            style={[styles.name, { color: colors.text }]}
            numberOfLines={2}
            accessibilityRole="header"
          >
            {river.name}
          </Text>
          <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
            {[river.region, `${river.accesses.length} access points`].filter(Boolean).join(' · ')}
          </Text>
        </View>

        <Pressable
          onPress={onClose}
          style={({ pressed }) => [styles.control, styles.lastControl, { opacity: pressed ? 0.6 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={19} color={colors.textMuted} />
        </Pressable>
      </View>

      {/* The verdict and the number behind it, on one line and behind one tap
          target — the same shape AccessGaugeReading takes in the pin sheet's
          peek, because a reader meets both within seconds and they are the same
          kind of claim about the same water. */}
      {primary ? (
        <Pressable
          onPress={() => onOpenGauge(primary.siteId)}
          style={({ pressed }) => [styles.state, { opacity: pressed ? 0.6 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={`${river.name}, ${conditionLongLabel(river.code)}. Open ${primary.name}`}
        >
          <View
            style={[
              styles.chip,
              {
                backgroundColor: conditionBg(river.code),
                borderColor: conditionChipBorder(river.code),
              },
            ]}
          >
            <Text style={[styles.chipText, { color: conditionChipInk(river.code, isDark) }]}>
              {conditionLongLabel(river.code)}
            </Text>
          </View>
          {primary.reading ? (
            <Text style={[styles.reading, { color: colors.textMuted }]} numberOfLines={1}>
              {primary.reading} at {primary.name}
            </Text>
          ) : null}
        </Pressable>
      ) : (
        <View style={styles.state}>
          <View style={[styles.chip, { backgroundColor: colors.cardRaised, borderColor: colors.border }]}>
            <Text style={[styles.chipText, { color: colors.textMuted }]}>Not rated</Text>
          </View>
          <Text style={[styles.reading, { color: colors.textMuted }]} numberOfLines={1}>
            No gauge grades this river yet
          </Text>
        </View>
      )}

      {/* Eddy's free line, under the verdict it elaborates on. Two lines at
          most: this is a glance above a collapsed detent, and a paragraph here
          would push the tabs off the peek. Absent whenever the app has not
          already fetched — see the header on why this sheet does not ask. */}
      {says ? (
        <Text style={[styles.says, { color: colors.textMuted }]} numberOfLines={2}>
          {says.text}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center' },
  frame: { width: FRAME, height: FRAME, marginRight: 10 },
  well: {
    width: FRAME,
    height: FRAME,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    left: 5,
    bottom: 5,
    width: 10,
    height: 10,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  text: { flex: 1, minWidth: 0 },
  name: { ...t.base, fontFamily: fonts.heading },
  meta: { ...t.sm, fontFamily: fonts.body, marginTop: 1 },
  control: { width: CONTROL, height: CONTROL, alignItems: 'center', justifyContent: 'center' },
  lastControl: { marginRight: -EDGE_BLEED },
  state: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  chipText: { ...t.sm, fontFamily: fonts.semibold },
  reading: { ...t.sm, fontFamily: fonts.body, flexShrink: 1, minWidth: 0 },
  says: { ...t.sm, fontFamily: fonts.body, lineHeight: 19, marginTop: 8 },
});
