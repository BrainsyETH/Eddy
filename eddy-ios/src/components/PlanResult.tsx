// eddy-ios/src/components/PlanResult.tsx
// A finished float plan, rendered.
//
// Split out of PlanSheet because two screens show a plan: the sheet you build
// one in, and the screen you open a saved one on. Those must not be two
// renderings of the same object — a shared float that reads differently from the
// plan that produced it is a plan nobody trusts.
//
// ── What the answer says, in order ──────────────────────────────────────────
//   1. warnings, if any            — a worse gauge in the span, a flood, a
//                                    stale reading. Before the numbers, always.
//   2. how long, how far, shuttle  — the questions people came with
//   3. the water it was built from — a plan is only as good as its reading
//   4. getting there               — the drives, handed to Apple Maps
//   5. hazards along the route     — free, and never summarised away
//   6. bail-outs along the way     — where a car can meet you
//   7. shuttles near the put-in    — who can move your car
//
// ── Why 4-7 exist ───────────────────────────────────────────────────────────
// This screen used to end at the hazards, and then offer to pick a boat and
// count nights on the river. Both of those were the app asking the user for
// input; none of it was the app answering the question that follows "yes, let's
// float this" — which is entirely logistics. The website's plan page has known
// that for a while (directions, shuttle route, outfitters, points along the
// route), so those are the shapes borrowed here.
//
// ── Float time is a RANGE, and sometimes nothing ────────────────────────────
// The server returns `floatTime: null` in dangerous water rather than an
// estimate, and that null is a verdict, not a gap. Printing "about 5 hours" for
// a river in flood would be an invitation, so the absence is rendered as the
// refusal it is. When a time does exist, the range is the headline wherever the
// server gave one: a single number implies a precision that a river with a
// headwind and a lunch stop does not have.

import type { ReactNode } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { FloatPlan, MapAccessPoint } from '@eddy/types';
import { hazardConditionCode, hazardTypeLabel, portageNote, sortHazards } from '@eddy/hazards';
import {
  conditionBg,
  conditionChipBorder,
  conditionColor,
  conditionInk,
  conditionLongLabel,
  conditionText,
} from '@/theme/conditions';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { formatReading, primaryReading, readingAge } from '@/lib/readingCopy';
import { driveBetweenUrl, driveToUrl, usgsGaugeUrl } from '@/lib/directions';
import { Otter, otterForCondition } from '@/components/Otter';
import { PlanAlongRoute } from '@/components/PlanAlongRoute';
import { PlanNearby } from '@/components/PlanNearby';

interface Props {
  plan: FloatPlan;
  /** Share, start over — whatever the host screen offers. */
  actions?: ReactNode;
}

export function PlanResult({ plan, actions }: Props) {
  const { colors, elevation, isDark } = useTheme();

  return (
    <ScrollView contentContainerStyle={styles.body}>
      {/* Warnings sit ABOVE the numbers on purpose. Everything below is a plan;
          this is the reason the plan might be wrong, or the reason not to go. */}
      {plan.warnings.length > 0 ? (
        <View
          style={[
            styles.warnings,
            {
              backgroundColor: conditionBg(plan.condition.code),
              borderColor: conditionChipBorder(plan.condition.code),
            },
          ]}
        >
          {plan.warnings.map((warning) => (
            <View key={warning} style={styles.warningRow}>
              <Ionicons name="alert-circle" size={15} color={conditionInk(plan.condition.code)} />
              <Text style={[styles.warningText, { color: conditionInk(plan.condition.code) }]}>
                {warning}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={[styles.card, { backgroundColor: colors.card }, elevation(2)]}>
        <Text style={[styles.segment, { color: colors.textMuted }]} numberOfLines={2}>
          {plan.putIn.name} → {plan.takeOut.name}
        </Text>

        {plan.floatTime ? (
          <>
            <Text style={[styles.headline, { color: colors.text }]}>{plan.floatTime.formatted}</Text>
            <Text style={[styles.headlineNote, { color: colors.textSubtle }]}>
              {plan.floatTime.isEstimate ? 'Estimated' : 'Published time'}
              {plan.floatTime.basis === 'moving'
                ? ' · paddling only, no stops'
                : ' · includes typical stops'}
              {/* The boat is no longer something anyone picks — the server's
                  default carries the estimate — but which boat it assumed is
                  still the difference between a plausible time and a wrong one,
                  so it is stated rather than hidden. */}
              {plan.vessel?.name ? ` · assumes a ${plan.vessel.name.toLowerCase()}` : ''}
            </Text>
          </>
        ) : (
          <>
            <Text style={[styles.headline, { color: conditionColor(plan.condition.code) }]}>
              No float time
            </Text>
            <Text style={[styles.headlineNote, { color: colors.textSubtle }]}>
              We do not estimate a time in this water. Wait for it to drop.
            </Text>
          </>
        )}

        <View style={[styles.statRow, { borderTopColor: colors.border }]}>
          <Stat label="Distance" value={plan.distance.formatted} />
          <Stat
            label="Shuttle drive"
            value={plan.driveBack.formatted}
            note={
              plan.driveBack.miles > 0
                ? `${plan.driveBack.miles.toFixed(0)} mi back to the put-in`
                : null
            }
          />
        </View>
      </View>

      {/* The water the plan was built from. A float time is a function of the
          flow, so the reading belongs with the plan rather than only on the
          river screen. */}
      <View style={[styles.card, { backgroundColor: colors.card }, elevation(1)]}>
        <View style={styles.conditionHead}>
          <Otter mood={otterForCondition(plan.condition.code)} size={52} />
          <View style={styles.conditionText}>
            <Text
              style={[styles.conditionLabel, { color: conditionText(plan.condition.code, isDark) }]}
            >
              {conditionLongLabel(plan.condition.code)}
            </Text>
            <PlanReading plan={plan} />
          </View>
        </View>

        <GaugeSourceLink plan={plan} />
      </View>

      <GettingThere plan={plan} />

      {plan.hazards.length > 0 ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            On this stretch ({plan.hazards.length})
          </Text>
          {sortHazards(plan.hazards).map((hazard) => {
            const code = hazardConditionCode(hazard.severity);
            const portage = portageNote(hazard);
            return (
              <View
                key={hazard.id}
                style={[styles.hazard, { backgroundColor: colors.card }, elevation(1)]}
              >
                <View style={[styles.hazardDot, { backgroundColor: conditionColor(code) }]} />
                <View style={styles.hazardBody}>
                  <Text style={[styles.hazardName, { color: colors.text }]}>{hazard.name}</Text>
                  <Text style={[styles.hazardMeta, { color: colors.textMuted }]}>
                    {hazardTypeLabel(hazard.type)}
                    {hazard.riverMile ? ` · Mile ${hazard.riverMile}` : ''}
                    {portage ? ` · ${portage}` : ''}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      <PlanAlongRoute plan={plan} />

      <PlanNearby plan={plan} />

      {actions}

      <Text style={[styles.footnote, { color: colors.textSubtle }]}>
        Times assume the flow at the put-in gauge right now. Wind, stops and a loaded boat all move
        them. Judge the water in front of you.
      </Text>
    </ScrollView>
  );
}

/**
 * The drives, in the order they happen.
 *
 * Every one of these is a handoff to Apple Maps rather than something Eddy tries
 * to draw itself: turn-by-turn on a gravel county road is a whole product, and
 * the phone already has one.
 */
function GettingThere({ plan }: { plan: FloatPlan }) {
  const { colors, elevation } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: colors.card }, elevation(1)]}>
      <Text style={[styles.cardTitle, { color: colors.text }]}>Getting there</Text>

      {/* Put-in and take-out wear the same two colours they wear on the map, so
          the card and the pins are obviously the same two places. */}
      <EndpointRow
        role="Put-in"
        point={plan.putIn}
        dotColor={colors.success}
        onPress={() => void Linking.openURL(driveToUrl(plan.putIn))}
      />
      <View style={[styles.endpointRule, { borderLeftColor: colors.border }]} />
      <EndpointRow
        role="Take-out"
        point={plan.takeOut}
        dotColor={colors.accent}
        onPress={() => void Linking.openURL(driveToUrl(plan.takeOut))}
      />

      {/* The shuttle is its own drive, and the one people underestimate. The
          plan already has a time for it; this is the route behind that number. */}
      <Pressable
        onPress={() => void Linking.openURL(driveBetweenUrl(plan.takeOut, plan.putIn))}
        style={({ pressed }) => [
          styles.shuttleRow,
          { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Shuttle route, take-out back to the put-in"
      >
        <Ionicons name="car-outline" size={16} color={colors.accent} />
        <View style={styles.shuttleText}>
          <Text style={[styles.shuttleTitle, { color: colors.text }]}>Shuttle route</Text>
          <Text style={[styles.shuttleMeta, { color: colors.textMuted }]} numberOfLines={1}>
            Take-out back to the put-in
            {plan.driveBack.formatted ? ` · ${plan.driveBack.formatted}` : ''}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={15} color={colors.textSubtle} />
      </Pressable>
    </View>
  );
}

function EndpointRow({
  role,
  point,
  dotColor,
  onPress,
}: {
  role: string;
  point: MapAccessPoint;
  dotColor: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.endpointRow, { opacity: pressed ? 0.6 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={`Directions to ${point.name}, the ${role.toLowerCase()}`}
    >
      <View style={[styles.endpointDot, { backgroundColor: dotColor }]} />
      <View style={styles.endpointText}>
        <Text style={[styles.endpointRole, { color: colors.textSubtle }]}>
          {role} · Mile {point.riverMile.toFixed(1)}
          {point.isPublic ? '' : ' · Private'}
        </Text>
        <Text style={[styles.endpointName, { color: colors.text }]} numberOfLines={1}>
          {point.name}
        </Text>
      </View>
      <Ionicons name="navigate-outline" size={17} color={colors.accent} />
    </Pressable>
  );
}

/** The reading behind the plan, in the unit this river is actually rated in. */
function PlanReading({ plan }: { plan: FloatPlan }) {
  const { colors } = useTheme();
  const reading = primaryReading(plan.condition);
  const age = readingAge(plan.condition.readingAgeHours);

  return (
    <>
      <Text style={[styles.planReading, { color: reading ? colors.text : colors.textSubtle }]}>
        {reading ? formatReading(reading.value, reading.unit) : 'No gauge reading'}
      </Text>
      {age || plan.condition.gaugeName ? (
        <Text style={[styles.planReadingMeta, { color: colors.textSubtle }]} numberOfLines={2}>
          {[age, plan.condition.gaugeName].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
    </>
  );
}

/**
 * Where the number came from.
 *
 * The website puts a USGS link on its condition strip and it is worth carrying
 * over: this is a safety-adjacent number, and "check it yourself" has to be one
 * tap away rather than an act of faith. Absent when the plan came back without a
 * site id — see usgsGaugeUrl.
 */
function GaugeSourceLink({ plan }: { plan: FloatPlan }) {
  const { colors } = useTheme();
  const url = usgsGaugeUrl(plan.condition.gaugeUsgsId);
  if (!url) return null;

  return (
    <Pressable
      onPress={() => void Linking.openURL(url)}
      style={({ pressed }) => [
        styles.sourceRow,
        { borderTopColor: colors.border, opacity: pressed ? 0.6 : 1 },
      ]}
      accessibilityRole="link"
      accessibilityLabel="Open this gauge on USGS"
    >
      <Text style={[styles.sourceText, { color: colors.textMuted }]}>
        Reading from USGS {plan.condition.gaugeUsgsId}
      </Text>
      <Ionicons name="open-outline" size={14} color={colors.accent} />
    </Pressable>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string | null }) {
  const { colors } = useTheme();
  return (
    <View style={styles.stat}>
      <Text style={[styles.statLabel, { color: colors.textSubtle }]}>{label}</Text>
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
      {note ? <Text style={[styles.statNote, { color: colors.textSubtle }]}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 40 },
  warnings: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 10, gap: 8 },
  warningRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  warningText: { ...t.xs, fontFamily: fonts.medium, flex: 1 },
  card: { padding: 16, borderRadius: 16, marginBottom: 10 },
  cardTitle: { ...t.base, fontFamily: fonts.heading, marginBottom: 6 },
  segment: { ...t.xs, fontFamily: fonts.semibold },
  headline: { ...t['3xl'], fontFamily: fonts.display, marginTop: 6 },
  headlineNote: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  statRow: { flexDirection: 'row', gap: 16, marginTop: 14, paddingTop: 14, borderTopWidth: 1 },
  stat: { flex: 1 },
  statLabel: { ...t.xs, fontFamily: fonts.semibold },
  // Mono for the same reason readings use it: these numbers change between
  // plans and a proportional face makes the two columns jitter against
  // each other.
  statValue: { ...t.lg, fontFamily: fonts.mono, marginTop: 2 },
  statNote: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  conditionHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  conditionText: { flex: 1, minWidth: 0 },
  conditionLabel: { ...t.sm, fontFamily: fonts.semibold },
  planReading: { ...t.xl, fontFamily: fonts.mono, marginTop: 4 },
  planReadingMeta: { ...t.xs, fontFamily: fonts.body, marginTop: 3 },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 12,
    paddingTop: 11,
    borderTopWidth: 1,
  },
  sourceText: { ...t.xs, fontFamily: fonts.body, flex: 1 },
  endpointRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  endpointDot: { width: 12, height: 12, borderRadius: 999, marginLeft: 1 },
  endpointText: { flex: 1, minWidth: 0 },
  endpointRole: { ...t.xs, fontFamily: fonts.semibold },
  endpointName: { ...t.sm, fontFamily: fonts.semibold, marginTop: 1 },
  // The dashed leg between the two ends, aligned under the put-in's dot so the
  // pair reads as one route rather than two unrelated rows.
  endpointRule: { height: 10, marginLeft: 7, borderLeftWidth: 1, borderStyle: 'dashed' },
  shuttleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginTop: 12,
    padding: 11,
    borderRadius: 12,
    borderWidth: 1,
  },
  shuttleText: { flex: 1, minWidth: 0 },
  shuttleTitle: { ...t.sm, fontFamily: fonts.semibold },
  shuttleMeta: { ...t.xs, fontFamily: fonts.body, marginTop: 1 },
  section: { marginTop: 8, marginBottom: 10 },
  sectionTitle: { ...t.base, fontFamily: fonts.heading, marginBottom: 8, paddingHorizontal: 2 },
  hazard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  hazardDot: { width: 10, height: 10, borderRadius: 999 },
  hazardBody: { flex: 1, minWidth: 0 },
  hazardName: { ...t.sm, fontFamily: fonts.semibold },
  hazardMeta: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  footnote: {
    ...t.xs,
    fontFamily: fonts.body,
    textAlign: 'center',
    marginTop: 18,
    paddingHorizontal: 12,
  },
});
