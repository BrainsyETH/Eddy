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
import { floatableHeadline } from '@eddy/conditions/floatable-headline';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { conditionBg, conditionChipBorder, conditionInk, conditionLabel } from '@/theme/conditions';
import { Absent, Fact, LinkRow, Prose, Section } from './sections';

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

export function RiverConditionsTab({ river, onOpenGauge }: RiverTabProps) {
  const { colors } = useTheme();
  // The river's verdict in one sentence, from the same helper the Today list
  // uses — so the map and the list cannot disagree about the same water.
  const headline = floatableHeadline(river.gauges.map((g) => g.code));

  if (!river.gauges.length) {
    return <Absent>No gauge grades this river yet, so Eddy has no reading for it.</Absent>;
  }

  return (
    <View>
      {headline ? <Prose>{headline}</Prose> : null}

      <Section title={river.gauges.length > 1 ? 'Gauges' : 'Gauge'}>
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

export function RiverSheetHeader({
  river,
  onClose,
  onOpenRiver,
}: {
  river: RiverSheetData;
  onClose: () => void;
  onOpenRiver: (slug: string) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.header}>
      <View style={styles.headRow}>
        <View style={styles.gaugeText}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>
            {river.name}
          </Text>
          <Text style={[styles.rowMeta, { color: colors.textMuted }]} numberOfLines={1}>
            {[river.region, `${river.accesses.length} access points`].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
          <Text style={[styles.close, { color: colors.textMuted }]}>✕</Text>
        </Pressable>
      </View>
      <View style={styles.headerLink}>
        <LinkRow label={`Open ${river.name}`} onPress={() => onOpenRiver(river.slug)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { ...t.sm, fontFamily: fonts.semibold },
  close: { ...t.base, fontFamily: fonts.medium },
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
