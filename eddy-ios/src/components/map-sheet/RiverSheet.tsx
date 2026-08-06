// eddy-ios/src/components/map-sheet/RiverSheet.tsx
// What a river says when you tap its line.
//
// ── This is net-new behaviour ─────────────────────────────────────────────
// Tapping a river used to produce no UI at all. onSelectNetworkRiver set the
// slug, CLOSED whatever callout was open, and cleared the focus so the map
// could re-frame — and the only thing that appeared was a header chip whose
// single action was to leave the screen. The map could choose a river and then
// had nothing to say about one.
//
// ── Every tab is built from memory ────────────────────────────────────────
// No request is made here. The statewide network already carries each river's
// gauges with their ladders, and the map screen already holds every access
// point and hazard it draws. Tapping a river is the cheapest interaction on
// this screen and it should stay that way — it is how you browse.
//
// ── Floats hands off, it does not re-implement ────────────────────────────
// The rows are pairs of access points and a distance. The float TIME is not
// computed here: calculateFloatTime lives in the web tree, which Metro does
// not resolve, and the honest answer is that the planner already knows how.
// Tapping a pair fills the existing PlanSheet, which is the same bridge the
// access sheet's Float trips tab uses. One planner, two ways in.
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { MapAccessPoint } from '@eddy/types';
import type { RiverSheetData } from './riverTabs';
import { criticalHazards, hazardTypeLabel, portageNote, severityLabel, sortHazards } from '@eddy/hazards';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { conditionBg, conditionChipBorder, conditionInk, conditionLabel } from '@/theme/conditions';
import { Absent, Fact, LinkRow, Prose, Section } from './sections';
import { RiverHead } from './RiverHead';

// The registry and its shapes live in riverTabs.ts, which imports no React
// Native at all so the web suite can load it. Re-exported here so callers that
// want the tabs and the bodies together need only one import.
export type { RiverGaugeRow, RiverSheetData, RiverTabKey } from './riverTabs';
export { riverTabs } from './riverTabs';

export interface RiverTabProps {
  river: RiverSheetData;
  onOpenGauge: (siteId: string) => void;
  onSelectAccess: (point: MapAccessPoint) => void;
  onPlanPair: (putIn: MapAccessPoint, takeOut: MapAccessPoint) => void;
  onOpenRiver: (slug: string) => void;
}

/* ── Conditions ─────────────────────────────────────────────────────────── */

/**
 * ── THIS TAB ONLY EXISTS ON A RIVER WITH MORE THAN ONE GAUGE ──────────────
 *
 * riverTabs gates it, because the glance now carries the river's verdict and its
 * primary station's reading. What is left for a page to add is the DISAGREEMENT
 * between stations — which is a real thing on a long river and is exactly what
 * one row cannot show.
 *
 * ── The headline that used to be here was false ───────────────────────────
 *
 * It called `floatableHeadline(river.gauges.map(g => g.code))`. That helper
 * counts a LIST OF RIVERS and says so in words, so three gauges on one river
 * with two floatable rendered "2 of 3 rivers are floatable right now" — on a
 * sheet whose heading is a single river's name. The comment above it claimed
 * this kept the map and the Today list from disagreeing about the same water;
 * in fact it made the map state something about a set of rivers that did not
 * exist. Removed rather than reworded: the river's own verdict is in the glance,
 * where it is drawn from the river's own condition code.
 */
export function RiverConditionsTab({ river, onOpenGauge }: RiverTabProps) {
  const { colors } = useTheme();

  if (!river.gauges.length) {
    return <Absent>No gauge grades this river yet, so Eddy has no reading for it.</Absent>;
  }

  return (
    <View>
      <Section title="Gauges">
        {river.gauges.map((gauge) => (
          <Pressable
            key={gauge.siteId}
            onPress={() => onOpenGauge(gauge.siteId)}
            style={({ pressed }) => [styles.gaugeRow, { opacity: pressed ? 0.6 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={`${gauge.name}, ${conditionLabel(gauge.code)}. Open the gauge`}
          >
            <View style={styles.gaugeText}>
              <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
                {gauge.name}
              </Text>
              {gauge.reading ? (
                <Text style={[styles.rowMeta, { color: colors.textMuted }]} numberOfLines={1}>
                  {gauge.reading}
                  {gauge.isPrimary && river.gauges.length > 1 ? ' · primary' : ''}
                </Text>
              ) : null}
            </View>
            <View
              style={[
                styles.chip,
                {
                  backgroundColor: conditionBg(gauge.code),
                  borderColor: conditionChipBorder(gauge.code),
                },
              ]}
            >
              <Text style={[styles.chipText, { color: conditionInk(gauge.code) }]}>
                {conditionLabel(gauge.code)}
              </Text>
            </View>
          </Pressable>
        ))}
      </Section>
    </View>
  );
}

/* ── Floats ─────────────────────────────────────────────────────────────── */

export function RiverFloatsTab({ river, onPlanPair }: RiverTabProps) {
  const { colors } = useTheme();

  // CONSECUTIVE pairs only. Every combination of twelve access points is
  // sixty-six rows, most of them a two-day trip nobody asked about; the
  // neighbouring pairs are the floats people actually run, and anything else
  // is a pair of taps away in the planner.
  const pairs = useMemo(() => {
    const ordered = [...river.accesses].sort((a, b) => a.riverMile - b.riverMile);
    const out: { putIn: MapAccessPoint; takeOut: MapAccessPoint; miles: number }[] = [];
    for (let i = 0; i < ordered.length - 1; i += 1) {
      const putIn = ordered[i];
      const takeOut = ordered[i + 1];
      const miles = Math.abs(takeOut.riverMile - putIn.riverMile);
      // Two points at the same mile are a mapping artefact, not a float.
      if (miles >= 0.5) out.push({ putIn, takeOut, miles });
    }
    return out;
  }, [river.accesses]);

  if (!pairs.length) {
    return <Absent>Not enough access points are mapped on this river to build a float.</Absent>;
  }

  return (
    <Section>
      {pairs.map(({ putIn, takeOut, miles }) => (
        <Pressable
          key={`${putIn.id}-${takeOut.id}`}
          onPress={() => onPlanPair(putIn, takeOut)}
          style={({ pressed }) => [styles.floatRow, { opacity: pressed ? 0.6 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={`Plan a float from ${putIn.name} to ${takeOut.name}, ${miles.toFixed(1)} miles`}
        >
          <View style={styles.gaugeText}>
            <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
              {putIn.name} → {takeOut.name}
            </Text>
            {/* Distance only. The time depends on the vessel and on what the
                water is doing, and the planner is what knows both. */}
            <Text style={[styles.rowMeta, { color: colors.textMuted }]} numberOfLines={1}>
              {miles.toFixed(1)} mi
            </Text>
          </View>
          <Text style={[styles.action, { color: colors.interactive }]}>Plan</Text>
        </Pressable>
      ))}
    </Section>
  );
}

/* ── Accesses ───────────────────────────────────────────────────────────── */

export function RiverAccessesTab({ river, onSelectAccess }: RiverTabProps) {
  const { colors } = useTheme();
  const ordered = useMemo(
    () => [...river.accesses].sort((a, b) => a.riverMile - b.riverMile),
    [river.accesses],
  );

  return (
    <Section>
      {ordered.map((point) => (
        <Pressable
          key={point.id}
          // Selecting the pin rather than pushing a screen: this is how the
          // sheet becomes a way of walking down the river without leaving the
          // map, which is the whole reason it is the primary surface.
          onPress={() => onSelectAccess(point)}
          style={({ pressed }) => [styles.floatRow, { opacity: pressed ? 0.6 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={`${point.name}, mile ${point.riverMile.toFixed(1)}`}
        >
          <View style={styles.gaugeText}>
            <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
              {point.name}
            </Text>
            <Text style={[styles.rowMeta, { color: colors.textMuted }]} numberOfLines={1}>
              Mile {point.riverMile.toFixed(1)}
              {point.isPublic ? '' : ' · private'}
            </Text>
          </View>
        </Pressable>
      ))}
    </Section>
  );
}

/* ── Hazards ────────────────────────────────────────────────────────────── */

export function RiverHazardsTab({ river }: RiverTabProps) {
  const { colors } = useTheme();
  const ordered = useMemo(() => sortHazards(river.hazards), [river.hazards]);
  const critical = useMemo(() => criticalHazards(river.hazards).length, [river.hazards]);

  if (!ordered.length) {
    return <Absent>Eddy carries no hazards for this river.</Absent>;
  }

  return (
    <View>
      {critical > 0 ? (
        <Prose>
          {critical === 1
            ? '1 of these needs care or a portage.'
            : `${critical} of these need care or a portage.`}
        </Prose>
      ) : null}

      {ordered.map((hazard) => (
        <Section key={hazard.id} title={hazard.name}>
          <Fact label="Type" value={hazardTypeLabel(hazard.type)} />
          <Fact label="Severity" value={severityLabel(hazard.severity)} />
          <Fact label="Mile" value={hazard.riverMile.toFixed(1)} />
          <Fact label="Portage" value={portageNote(hazard)} />
          <Prose>{hazard.description}</Prose>
          {hazard.seasonalNotes ? (
            <Text style={[styles.rowMeta, { color: colors.textMuted }]}>{hazard.seasonalNotes}</Text>
          ) : null}
        </Section>
      ))}
    </View>
  );
}

/* ── The header ─────────────────────────────────────────────────────────── */

/**
 * The glance: who, what the water is doing, and the way to the full screen.
 *
 * The identity row itself is RiverHead — a real sibling of PlaceHead rather than
 * the 14pt string that used to sit here. What stays in this file is the one
 * navigation row underneath it, which is river-sheet business rather than
 * identity.
 *
 * ── "Open {river}" is no longer duplicated ────────────────────────────────
 * The map screen used to draw its own selected-river line above the map with the
 * name, the condition and a chevron to the very same screen this row opens. That
 * line is gone (see the Map tab's header), so this is the only copy.
 */
export function RiverSheetHeader({
  river,
  onClose,
  onOpenRiver,
  onOpenGauge,
}: {
  river: RiverSheetData;
  onClose: () => void;
  onOpenRiver: (slug: string) => void;
  onOpenGauge: (siteId: string) => void;
}) {
  return (
    <View>
      <RiverHead river={river} onClose={onClose} onOpenGauge={onOpenGauge} />
      <View style={styles.header}>
        <View style={styles.headerLink}>
          <LinkRow
            label={`Open ${river.name}`}
            symbol="river"
            onPress={() => onOpenRiver(river.slug)}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16 },
  // The identity row's own styles left with it — see RiverHead, which holds the
  // 44pt frame, the heading scale and the close this file used to declare.
  headerLink: { marginTop: 2 },
  gaugeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  gaugeText: { flex: 1, minWidth: 0 },
  floatRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  rowName: { ...t.sm, fontFamily: fonts.medium },
  rowMeta: { ...t.sm, fontFamily: fonts.body, marginTop: 1 },
  action: { ...t.sm, fontFamily: fonts.semibold },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  chipText: { ...t.sm, fontFamily: fonts.semibold },
});
