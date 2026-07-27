// eddy-ios/src/components/PlanSheet.tsx
// The float plan flow: put-in, take-out, answer.
//
// Everything on this screen is FREE. The plan is the reason someone opens Eddy
// on a Thursday night, and gating it would gate the product. The paid line runs
// somewhere else entirely — being told when a river changes, and carrying the
// map past the end of cell coverage.
//
// ── Two taps to an answer ───────────────────────────────────────────────────
// There used to be a third step here: pick a boat. It is gone. A required tap
// that moves the answer less than the wind does is a tap that only ever loses
// people between "I picked two access points" and "how long is it" — see the
// note at the top of useFloatPlan. The estimate still says which boat it assumed.
//
// ── Structure ───────────────────────────────────────────────────────────────
// This file owns the FLOW — the breadcrumb, the two pickers, and the sheet they
// live in. The answer itself is PlanResult, which is shared with the screen that
// opens a saved float: a shared plan that read differently from the plan that
// produced it would be a plan nobody trusts.

import { useCallback, useMemo, useState } from 'react';
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
import type { MapAccessPoint } from '@eddy/types';
import { saveFloatPlan } from '@/api/client';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { Otter } from '@/components/Otter';
import { PlanResult } from '@/components/PlanResult';
import type { FloatPlanState } from '@/hooks/useFloatPlan';
import { useSavedFloats } from '@/hooks/useSavedFloats';
import { milesBetween, type Coords } from '@/hooks/useLocation';

interface Props {
  visible: boolean;
  onClose: () => void;
  riverName: string;
  state: FloatPlanState;
  /**
   * Where the user is, if they have already granted it on the map. Never
   * requested from in here — a sheet that prompts for location the moment it
   * opens spends the one-shot iOS dialog on a screen the user came to for a
   * different reason.
   */
  userCoords?: Coords | null;
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

export function PlanSheet({ visible, onClose, riverName, state, userCoords }: Props) {
  const { colors } = useTheme();
  const { remember } = useSavedFloats();
  const [sharing, setSharing] = useState(false);

  const { step, putIn, takeOut, plan, calculating, error } = state;

  const onShare = useCallback(async () => {
    if (!plan) return;
    setSharing(true);
    try {
      const saved = await saveFloatPlan(plan);
      // Recorded BEFORE the share sheet opens. Whether they actually send it is
      // between them and their group chat; the plan exists either way, and this
      // is the only place its code is ever handed to us.
      remember(plan, saved);
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
  }, [plan, remember]);

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
            userCoords={userCoords}
          />
        ) : step === 'take-out' ? (
          <AccessPointList
            points={state.takeOutOptions}
            fromMile={putIn?.riverMile ?? null}
            emptyMessage={`There is nothing downstream of ${putIn?.name ?? 'that put-in'}. Pick one further up the river.`}
            onSelect={state.chooseTakeOut}
            selectedId={takeOut?.id ?? null}
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
          <PlanResult
            plan={plan}
            actions={
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
            }
          />
        )}
      </View>
    </Modal>
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
  const crumbs: { step: 'put-in' | 'take-out'; label: string; value?: string }[] = [
    { step: 'put-in', label: 'Put-in', value: state.putIn?.name },
    { step: 'take-out', label: 'Take-out', value: state.takeOut?.name },
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
  userCoords,
}: {
  points: MapAccessPoint[];
  onSelect: (point: MapAccessPoint) => void;
  selectedId: string | null;
  emptyMessage: string;
  /** Set on the take-out step so each row can show the float length it makes. */
  fromMile?: number | null;
  /** Set on the PUT-IN step only, enabling a nearest-first ordering. */
  userCoords?: Coords | null;
}) {
  const { colors, elevation } = useTheme();
  // Headwaters-first by default. That is the order a river runs in, and it is
  // the order someone who knows the river thinks in — so nearest-first is an
  // option rather than the default, even when we know where they are.
  const [nearestFirst, setNearestFirst] = useState(false);

  const distances = useMemo(() => {
    if (!userCoords) return null;
    const map = new Map<string, number>();
    for (const point of points) {
      map.set(point.id, milesBetween(userCoords, point.coordinates));
    }
    return map;
  }, [points, userCoords]);

  const ordered = useMemo(() => {
    if (!nearestFirst || !distances) return points;
    return [...points].sort(
      (a, b) => (distances.get(a.id) ?? Infinity) - (distances.get(b.id) ?? Infinity),
    );
  }, [points, nearestFirst, distances]);

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
      {/* Shown only when we already know where they are — the map's locate
          button is the one place that asks. A sort control that prompts for a
          permission when tapped is a trap. */}
      {distances ? (
        <Pressable
          onPress={() => setNearestFirst((prev) => !prev)}
          style={({ pressed }) => [
            styles.sortRow,
            { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityState={{ selected: nearestFirst }}
        >
          <Ionicons
            name={nearestFirst ? 'navigate' : 'navigate-outline'}
            size={14}
            color={nearestFirst ? colors.accent : colors.textMuted}
          />
          <Text
            style={[styles.sortText, { color: nearestFirst ? colors.text : colors.textMuted }]}
          >
            {nearestFirst ? 'Nearest to you' : 'Downstream order'}
          </Text>
        </Pressable>
      ) : null}

      {ordered.map((point) => {
        const selected = point.id === selectedId;
        const miles = fromMile != null ? point.riverMile - fromMile : null;
        const away = distances?.get(point.id) ?? null;
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
                  // Straight-line, and labelled "away" rather than "drive" for
                  // exactly that reason — an Ozark put-in eight miles off can be
                  // forty minutes of gravel road.
                  away != null ? `${away < 10 ? away.toFixed(1) : away.toFixed(0)} mi away` : null,
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
  breadcrumb: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  crumb: { flex: 1, minWidth: 0 },
  crumbLabel: { ...t.xs, fontFamily: fonts.semibold },
  crumbValue: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  list: { padding: 16, gap: 8 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13, borderRadius: 12 },
  optionBody: { flex: 1, minWidth: 0 },
  optionName: { ...t.sm, fontFamily: fonts.semibold },
  optionMeta: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 4,
  },
  sortText: { ...t.xs, fontFamily: fonts.semibold },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  calculating: { ...t.sm, fontFamily: fonts.body, textAlign: 'center' },
  emptyText: { ...t.sm, fontFamily: fonts.body, textAlign: 'center' },
  errorText: { ...t.base, fontFamily: fonts.semibold, textAlign: 'center' },
  link: { ...t.sm, fontFamily: fonts.semibold },
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
});
