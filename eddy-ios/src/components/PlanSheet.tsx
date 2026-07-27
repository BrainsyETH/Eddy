// eddy-ios/src/components/PlanSheet.tsx
// The float plan flow: put-in, take-out, boat, answer.
//
// Everything on this screen is FREE. The plan is the reason someone opens Eddy
// on a Thursday night, and gating it would gate the product. The paid line runs
// somewhere else entirely — being told when a river changes, and carrying the
// map past the end of cell coverage.
//
// ── What the answer has to say, in order ────────────────────────────────────
//   1. warnings, if any            — a worse gauge in the span, a flood, a
//                                    stale reading. Before the numbers, always.
//   2. how long                    — the question people came with
//   3. how far, and the shuttle    — the two facts that decide the logistics
//   4. the water it was built from — a plan is only as good as its reading
//   5. hazards along the route     — free, and never summarised away
//
// ── Float time is a RANGE, and sometimes nothing ────────────────────────────
// The server returns `floatTime: null` in dangerous water rather than an
// estimate, and that null is a verdict, not a gap. Printing "about 5 hours" for
// a river in flood would be an invitation, so the absence is rendered as the
// refusal it is. When a time does exist, the range is shown as the headline
// wherever the server gave one: a single number implies a precision that a
// river with a headwind and a lunch stop does not have.

import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { FloatPlan, MapAccessPoint, VesselType } from '@eddy/types';
import { hazardConditionCode, hazardTypeLabel, portageNote, sortHazards } from '@eddy/hazards';
import { saveFloatPlan } from '@/api/client';
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
import type { FloatPlanState } from '@/hooks/useFloatPlan';

interface Props {
  visible: boolean;
  onClose: () => void;
  riverName: string;
  state: FloatPlanState;
}

const ACCESS_TYPE_LABELS: Record<string, string> = {
  boat_ramp: 'Boat ramp',
  gravel_bar: 'Gravel bar',
  campground: 'Campground',
  bridge: 'Bridge',
  access: 'Access',
  park: 'Park',
};

function accessTypeLabel(type: string): string {
  return ACCESS_TYPE_LABELS[type] ?? type.replace(/_/g, ' ');
}

export function PlanSheet({ visible, onClose, riverName, state }: Props) {
  const { colors, elevation, isDark } = useTheme();
  const [sharing, setSharing] = useState(false);

  const { step, putIn, takeOut, vessel, vessels, plan, calculating, error } = state;

  const onShare = useCallback(async () => {
    if (!plan) return;
    setSharing(true);
    try {
      const saved = await saveFloatPlan(plan);
      const time = plan.floatTime?.formatted ?? 'no estimate in this water';
      await Share.share({
        message: `${plan.putIn.name} → ${plan.takeOut.name} on the ${plan.river.name} · ${plan.distance.formatted} · ${time}\n${saved.url}`,
      });
    } catch {
      // A share that cannot be saved falls back to the numbers themselves.
      // Losing the short link is worth far less than losing the share.
      await Share.share({
        message: `${plan.putIn.name} → ${plan.takeOut.name} on the ${plan.river.name} · ${plan.distance.formatted} · ${plan.floatTime?.formatted ?? 'no estimate in this water'}`,
      });
    } finally {
      setSharing(false);
    }
  }, [plan]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.sheet, { backgroundColor: colors.bg }]}>
        <View style={styles.head}>
          <View style={styles.headText}>
            <Text style={[styles.title, { color: colors.text }]}>Plan a float</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>{riverName}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={26} color={colors.textMuted} />
          </Pressable>
        </View>

        <Breadcrumb state={state} />

        {step === 'put-in' ? (
          <AccessPointList
            points={state.putInOptions}
            emptyMessage="This river has no mapped access points yet."
            onSelect={state.choosePutIn}
            selectedId={putIn?.id ?? null}
          />
        ) : step === 'take-out' ? (
          <AccessPointList
            points={state.takeOutOptions}
            fromMile={putIn?.riverMile ?? null}
            emptyMessage={`There is nothing downstream of ${putIn?.name ?? 'that put-in'}. Pick one further up the river.`}
            onSelect={state.chooseTakeOut}
            selectedId={takeOut?.id ?? null}
          />
        ) : step === 'vessel' ? (
          <VesselList
            vessels={vessels}
            loaded={state.vesselsLoaded}
            selectedId={vessel?.id ?? null}
            onSelect={state.chooseVessel}
            onSkip={state.skipVessel}
          />
        ) : calculating ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.accent} />
            <Text style={[styles.calculating, { color: colors.textMuted }]}>
              Reading the gauge and driving the shuttle…
            </Text>
          </View>
        ) : error || !plan ? (
          <View style={styles.centered}>
            <Otter mood="flag" size={100} />
            <Text style={[styles.errorText, { color: colors.text }]}>
              {error ?? 'Could not build that float plan'}
            </Text>
            <Pressable onPress={state.reset} hitSlop={10}>
              <Text style={[styles.link, { color: colors.accent }]}>Start over</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.body}>
            {/* Warnings sit ABOVE the numbers on purpose. Everything below is a
                plan; this is the reason the plan might be wrong, or the reason
                not to go at all. */}
            {plan.warnings.length > 0 ? (
              <View
                style={[
                  styles.warnings,
                  { backgroundColor: conditionBg(plan.condition.code), borderColor: conditionChipBorder(plan.condition.code) },
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
                  <Text style={[styles.headline, { color: colors.text }]}>
                    {plan.floatTime.formatted}
                  </Text>
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

            {/* The water the plan was built from. A float time is a function of
                the flow, so the reading belongs with the plan rather than only
                on the river screen. */}
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

            <View style={styles.actions}>
              <Pressable
                onPress={() => void onShare()}
                disabled={sharing}
                style={({ pressed }) => [
                  styles.primaryButton,
                  { backgroundColor: pressed ? colors.accentPressed : colors.accent },
                ]}
                accessibilityRole="button"
              >
                {sharing ? (
                  <ActivityIndicator color={colors.onAccent} size="small" />
                ) : (
                  <Ionicons name="share-outline" size={17} color={colors.onAccent} />
                )}
                <Text style={[styles.primaryButtonText, { color: colors.onAccent }]}>
                  Share this float
                </Text>
              </Pressable>

              <Pressable
                onPress={state.reset}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
                ]}
                accessibilityRole="button"
              >
                <Text style={[styles.secondaryButtonText, { color: colors.textMuted }]}>
                  Plan a different stretch
                </Text>
              </Pressable>
            </View>

            <Text style={[styles.footnote, { color: colors.textSubtle }]}>
              Times assume the flow at the put-in gauge right now. Wind, stops and a loaded boat all
              move them. Judge the water in front of you.
            </Text>
          </ScrollView>
        )}
      </View>
    </Modal>
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
 * Where you are in the flow, and the way back.
 *
 * Every completed step is a button. Changing the put-in three taps in is the
 * single most common correction in a planner, and making it a back-out-and-
 * start-again is what makes people give up on one.
 */
function Breadcrumb({ state }: { state: FloatPlanState }) {
  const { colors } = useTheme();
  const crumbs: { step: 'put-in' | 'take-out' | 'vessel'; label: string; value?: string }[] = [
    { step: 'put-in', label: 'Put-in', value: state.putIn?.name },
    { step: 'take-out', label: 'Take-out', value: state.takeOut?.name },
    { step: 'vessel', label: 'Boat', value: state.vessel?.name },
  ];

  return (
    <View style={[styles.breadcrumb, { borderBottomColor: colors.border }]}>
      {crumbs.map((crumb, index) => {
        const current = state.step === crumb.step;
        // A step is reachable once the one before it has an answer. Nothing
        // below can be tapped into out of order, so the machine cannot be put
        // into a state where a take-out exists without a put-in.
        const reachable = index === 0 || Boolean(crumbs[index - 1].value);
        return (
          <Pressable
            key={crumb.step}
            disabled={!reachable}
            onPress={() => state.goToStep(crumb.step)}
            style={styles.crumb}
            accessibilityRole="button"
            accessibilityState={{ selected: current, disabled: !reachable }}
          >
            <Text
              style={[
                styles.crumbLabel,
                { color: current ? colors.accent : reachable ? colors.textMuted : colors.textSubtle },
              ]}
            >
              {crumb.label}
            </Text>
            <Text
              style={[styles.crumbValue, { color: crumb.value ? colors.text : colors.textSubtle }]}
              numberOfLines={1}
            >
              {crumb.value ?? '—'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function AccessPointList({
  points,
  onSelect,
  selectedId,
  emptyMessage,
  fromMile,
}: {
  points: MapAccessPoint[];
  onSelect: (point: MapAccessPoint) => void;
  selectedId: string | null;
  emptyMessage: string;
  /** Set on the take-out step so each row can show the float length it makes. */
  fromMile?: number | null;
}) {
  const { colors, elevation } = useTheme();

  if (points.length === 0) {
    return (
      <View style={styles.centered}>
        <Otter mood="yellow" size={100} />
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>{emptyMessage}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.list}>
      {points.map((point) => {
        const selected = point.id === selectedId;
        const miles = fromMile != null ? point.riverMile - fromMile : null;
        return (
          <Pressable
            key={point.id}
            onPress={() => onSelect(point)}
            style={({ pressed }) => [
              styles.option,
              { backgroundColor: selected ? colors.cardRaised : colors.card, opacity: pressed ? 0.65 : 1 },
              elevation(1),
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <Ionicons
              name={point.isPublic ? 'location' : 'lock-closed-outline'}
              size={17}
              color={point.isPublic ? colors.accent : colors.textSubtle}
            />
            <View style={styles.optionBody}>
              <Text style={[styles.optionName, { color: colors.text }]} numberOfLines={1}>
                {point.name}
              </Text>
              <Text style={[styles.optionMeta, { color: colors.textMuted }]} numberOfLines={1}>
                {[
                  accessTypeLabel(point.type),
                  `Mile ${point.riverMile.toFixed(1)}`,
                  point.isPublic ? null : 'Private',
                  // The number that actually decides a take-out. Reading it off
                  // two river miles in your head is exactly the arithmetic an
                  // app should be doing for you.
                  miles != null ? `${miles.toFixed(1)} mi float` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            {selected ? <Ionicons name="checkmark" size={18} color={colors.accent} /> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function VesselList({
  vessels,
  loaded,
  selectedId,
  onSelect,
  onSkip,
}: {
  vessels: VesselType[];
  loaded: boolean;
  selectedId: string | null;
  onSelect: (vessel: VesselType) => void;
  onSkip: () => void;
}) {
  const { colors, elevation } = useTheme();

  if (!loaded) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  // Loaded and empty means the boat list failed to reach us, not that there are
  // no boats. The plan does not depend on it — the server falls back to its own
  // default vessel — so this offers the answer rather than a dead end.
  if (vessels.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>
          We could not load the boat list. Your float time will assume a canoe.
        </Text>
        <Pressable
          onPress={onSkip}
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: pressed ? colors.accentPressed : colors.accent, alignSelf: 'stretch' },
          ]}
          accessibilityRole="button"
        >
          <Text style={[styles.primaryButtonText, { color: colors.onAccent }]}>
            Build the plan anyway
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.list}>
      {vessels.map((vesselType) => {
        const selected = vesselType.id === selectedId;
        return (
          <Pressable
            key={vesselType.id}
            onPress={() => onSelect(vesselType)}
            style={({ pressed }) => [
              styles.option,
              { backgroundColor: selected ? colors.cardRaised : colors.card, opacity: pressed ? 0.65 : 1 },
              elevation(1),
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <View style={styles.optionBody}>
              <Text style={[styles.optionName, { color: colors.text }]}>{vesselType.name}</Text>
              {vesselType.description ? (
                <Text style={[styles.optionMeta, { color: colors.textMuted }]} numberOfLines={2}>
                  {vesselType.description}
                </Text>
              ) : null}
            </View>
            {selected ? <Ionicons name="checkmark" size={18} color={colors.accent} /> : null}
          </Pressable>
        );
      })}
    </ScrollView>
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
  sheet: { flex: 1 },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 10,
  },
  headText: { flex: 1 },
  title: { ...t['2xl'], fontFamily: fonts.display },
  subtitle: { ...t.sm, fontFamily: fonts.body, marginTop: 1 },
  breadcrumb: { flexDirection: 'row', paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, gap: 12 },
  crumb: { flex: 1, minWidth: 0 },
  crumbLabel: { ...t.xs, fontFamily: fonts.semibold },
  crumbValue: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  list: { padding: 16, gap: 8 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13, borderRadius: 12 },
  optionBody: { flex: 1, minWidth: 0 },
  optionName: { ...t.sm, fontFamily: fonts.semibold },
  optionMeta: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  calculating: { ...t.sm, fontFamily: fonts.body, textAlign: 'center' },
  emptyText: { ...t.sm, fontFamily: fonts.body, textAlign: 'center' },
  errorText: { ...t.base, fontFamily: fonts.semibold, textAlign: 'center' },
  link: { ...t.sm, fontFamily: fonts.semibold },
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
  hazard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, marginBottom: 8 },
  hazardDot: { width: 10, height: 10, borderRadius: 999 },
  hazardBody: { flex: 1, minWidth: 0 },
  hazardName: { ...t.sm, fontFamily: fonts.semibold },
  hazardMeta: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  actions: { gap: 10, marginTop: 6 },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  primaryButtonText: { ...t.base, fontFamily: fonts.heading },
  secondaryButton: { alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  secondaryButtonText: { ...t.sm, fontFamily: fonts.semibold },
  footnote: { ...t.xs, fontFamily: fonts.body, textAlign: 'center', marginTop: 18, paddingHorizontal: 12 },
});
