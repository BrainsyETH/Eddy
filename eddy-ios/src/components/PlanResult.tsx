// eddy-ios/src/components/PlanResult.tsx
// A finished float plan, rendered.
//
// Split out of PlanSheet because two screens show a plan: the sheet you build
// one in, and the screen you open a saved one on. Those must not be two
// renderings of the same object — a shared float that reads differently from
// the plan that produced it is a plan nobody trusts.
//
// ── What the answer says, in order ──────────────────────────────────────────
//   1. warnings, if any            — a worse gauge in the span, a flood, a
//                                    stale reading. Before the numbers, always.
//   2. how long                    — the question people came with
//   3. how far, and the shuttle    — the two facts that decide the logistics
//   4. the water it was built from — a plan is only as good as its reading
//   5. overnight legs (slot)       — nothing on a day trip
//   6. hazards along the route     — free, and never summarised away
//
// ── Float time is a RANGE, and sometimes nothing ────────────────────────────
// The server returns `floatTime: null` in dangerous water rather than an
// estimate, and that null is a verdict, not a gap. Printing "about 5 hours" for
// a river in flood would be an invitation, so the absence is rendered as the
// refusal it is. When a time does exist, the range is the headline wherever the
// server gave one: a single number implies a precision that a river with a
// headwind and a lunch stop does not have.

import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { FloatPlan } from '@eddy/types';
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
import { Otter, otterForCondition } from '@/components/Otter';

interface Props {
  plan: FloatPlan;
  /** Overnight planning. Sits between the water and the hazards. */
  overnight?: ReactNode;
  /** Share, start over — whatever the host screen offers. */
  actions?: ReactNode;
}

export function PlanResult({ plan, overnight, actions }: Props) {
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
              {plan.vessel?.name ? ` · ${plan.vessel.name}` : ''}
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
      </View>

      {overnight}

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

      {actions}

      <Text style={[styles.footnote, { color: colors.textSubtle }]}>
        Times assume the flow at the put-in gauge right now. Wind, stops and a loaded boat all move
        them. Judge the water in front of you.
      </Text>
    </ScrollView>
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
