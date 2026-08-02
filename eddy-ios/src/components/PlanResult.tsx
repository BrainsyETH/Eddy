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
// ── Float time is a CEILING, and sometimes nothing ──────────────────────────
// The server returns `floatTime: null` in dangerous water rather than an
// estimate, and that null is a verdict, not a gap. Printing "about 5 hours" for
// a river in flood would be an invitation, so the absence is rendered as the
// refusal it is.
//
// When a time does exist the headline is the LONG end of the server's range,
// worded "Up to ~4 hours". This is still not a point estimate — it is an upper
// bound, and it keeps the honesty a bare number would lose — but it stops
// making the reader subtract two quarter-hour-rounded strings to work out
// whether they get off the water before dark. The short end was never the
// useful one.

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
import { primary } from '@/theme/palette';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import {
  floatTimeCeilingBasisNote,
  formatFloatTimeCeiling,
} from '@eddy/conditions/float-time-format';
import { formatReading, primaryReading, readingAge } from '@/lib/readingCopy';
import { driveBetweenUrl, driveToUrl, usgsGaugeUrl } from '@/lib/directions';
import { Otter, otterForCondition } from '@/components/Otter';
import { PlanAlongRoute } from '@/components/PlanAlongRoute';
import { PlanRoutePreview } from '@/components/PlanRoutePreview';
import { PlanNearby } from '@/components/PlanNearby';
import { EddySymbol } from '@/components/EddySymbol';
import { SafetyDisclaimer } from '@/components/SafetyDisclaimer';

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

      {/* ── The stretch ─────────────────────────────────────────────
          ABOVE the numbers, inside the same card, because it is what the
          numbers are about. It renders itself away when the plan came back
          without usable geometry — see PlanRoutePreview, which never draws a
          route it had to invent.

          Saved floats get it for free: this component is the whole of what
          both screens render, which is the reason it exists. */}
      <View style={[styles.card, { backgroundColor: colors.card }, elevation(2)]}>
        <PlanRoutePreview geometry={plan.route?.geometry} />

        <View style={styles.segmentRow}>
          <Text style={[styles.segment, { color: colors.textMuted }]} numberOfLines={2}>
            {plan.putIn.name} → {plan.takeOut.name}
          </Text>
          {/* Distance rides here rather than in a stat row of its own. It used
              to share that row with Shuttle drive; with the shuttle gone, a
              lone stat sat left-aligned under a full-width rule with half the
              card empty beside it. One number does not need a table. */}
          {/* Raised out of the muted grey it shared with the endpoint names.
              How far is one of the two questions the card exists to answer —
              the other is how long, printed at 3xl below — and it was being
              set at the same size and colour as the caption beside it. */}
          <Text style={[styles.segmentDistance, { color: colors.text }]}>
            {plan.distance.formatted}
          </Text>
        </View>

        {plan.floatTime ? (
          <>
            {/* A CEILING, NOT A RANGE. "~2 hours 30 minutes – ~4 hours" makes
                the reader do arithmetic before they can answer the only
                question they actually have — will I be off the water before
                dark? The long end answers it outright, and it is the end that
                matters; nobody was ever caught out by finishing early.
                `timeRange` has always been on the wire and was never read. */}
            <Text style={[styles.headline, { color: colors.text }]}>
              {plan.floatTime.timeRange
                ? formatFloatTimeCeiling(plan.floatTime.timeRange.max)
                : plan.floatTime.formatted}
            </Text>
            <Text style={[styles.headlineNote, { color: colors.textSubtle }]}>
              {/* NOT "no stops". The long end is moving time x1.6 — a relaxed
                  pace that stops on gravel bars — so "no stops" would describe
                  the SHORT end while printing the long one.

                  The vessel is named here because nothing else names it. The
                  boat picker is gone from this flow and the server defaults to
                  a canoe, which the header of this file has claimed the
                  estimate "still says" for a while without it being true
                  anywhere on screen. See floatTimeCeilingBasisNote. */}
              {floatTimeCeilingBasisNote(plan.vessel?.name)}
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
          <View style={styles.sectionTitleRow}>
            <EddySymbol name="hazard" size={18} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              On this stretch ({plan.hazards.length})
            </Text>
          </View>
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

      <SafetyDisclaimer />

      {actions}
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

      {/* The shuttle is its own drive, and the one people underestimate. This
          hands it to Apple Maps, which is the only thing here that can time it
          honestly — see the note on driveBack in the plan route for why we no
          longer print a number of our own. */}
      <Pressable
        onPress={() => void Linking.openURL(driveBetweenUrl(plan.takeOut, plan.putIn))}
        style={({ pressed }) => [
          styles.shuttleRow,
          { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Shuttle route, driving directions from point to point"
      >
        {/* The same badge the website's "Drive Route" row wears: a car in a
            filled teal disc, not a loose outline glyph. Teal rather than the
            accent coral because the shuttle is the one thing in this card that
            is NOT the float — it is the drive that bookends it. */}
        <View style={[styles.shuttleBadge, { backgroundColor: primary[600] }]}>
          <Ionicons name="car" size={14} color={colors.onAccent} />
        </View>
        <View style={styles.shuttleText}>
          <Text style={[styles.shuttleTitle, { color: colors.text }]}>Shuttle route</Text>
          <Text style={[styles.shuttleMeta, { color: colors.textMuted }]} numberOfLines={1}>
            Driving directions from point-to-point
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
      <Ionicons name="navigate-outline" size={17} color={colors.interactive} />
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
      <Ionicons name="open-outline" size={14} color={colors.interactive} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 40 },
  warnings: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 10, gap: 8 },
  warningRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  warningText: { ...t.xs, fontFamily: fonts.medium, flex: 1 },
  card: { padding: 16, borderRadius: 16, marginBottom: 10 },
  cardTitle: { ...t.base, fontFamily: fonts.heading, marginBottom: 6 },
  // `center`, now that the distance is taller than the endpoint line it sits
  // beside — top-aligned, a larger number hangs above the text it belongs to.
  segmentRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  segment: { ...t.xs, fontFamily: fonts.semibold, flex: 1 },
  // Mono for the same reason readings use it: the number changes between plans
  // and a proportional face makes it shift against the endpoints beside it.
  // One step up from the caption it used to match, and no further: the float
  // time below is the headline and this must not start competing with it.
  segmentDistance: { ...t.base, fontFamily: fonts.mono },
  headline: { ...t['3xl'], fontFamily: fonts.display, marginTop: 6 },
  headlineNote: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
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
  // 28pt disc, 14pt glyph — the website's proportions (w-8 around a 14px svg),
  // taken down one step because a phone row is tighter than a card column.
  shuttleBadge: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shuttleText: { flex: 1, minWidth: 0 },
  shuttleTitle: { ...t.sm, fontFamily: fonts.semibold },
  shuttleMeta: { ...t.xs, fontFamily: fonts.body, marginTop: 1 },
  section: { marginTop: 8, marginBottom: 10 },
  sectionTitle: { ...t.base, fontFamily: fonts.heading },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
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
});
