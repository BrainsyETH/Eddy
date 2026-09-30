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
// note at the top of useFloatPlan. The plan still carries the vessel the speed
// model used; the basis line under the estimate no longer names it, and
// floatTimeCeilingBasisNote says why.
//
// ── Structure ───────────────────────────────────────────────────────────────
// This file owns the FLOW — the breadcrumb, the two pickers, and the sheet they
// live in. The answer itself is PlanResult, which is shared with the screen that
// opens a saved float: a shared plan that read differently from the plan that
// produced it would be a plan nobody trusts.

import { radii } from '@/theme/layout';
import { useCallback, useLayoutEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { MapAccessPoint, RiverListItem } from '@eddy/types';
import { accessTypeLabel } from '@eddy/types';
import { saveFloatPlan } from '@/api/client';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { EddyScene } from '@/components/EddyScene';
import { EddySymbol, type EddySymbolName } from '@/components/EddySymbol';
import { PlanAccessPhoto } from '@/components/PlanAccessPhoto';
import { Otter } from '@/components/Otter';
import { PlanResult } from '@/components/PlanResult';
import type { FloatPlanState } from '@/hooks/useFloatPlan';
import { useSavedFloats } from '@/hooks/useSavedFloats';
import { milesBetween, type Coords } from '@/hooks/useLocation';
import { damControlledLabel } from '@/lib/readingCopy';
import { conditionColor } from '@/theme/conditions';
import { createPlanActions } from '@/lib/planActions';

interface Props {
  visible: boolean;
  onClose: () => void;
  rivers: RiverListItem[];
  riversLoading: boolean;
  riversError: string | null;
  onRetryRivers: () => void;
  river: RiverListItem | null;
  riverDistances: ReadonlyMap<string, number> | null;
  onSelectRiver: (river: RiverListItem) => void;
  onClearRiver: () => void;
  riverLoading: boolean;
  state: FloatPlanState;
  accessPoints: MapAccessPoint[];
  /**
   * Where the user is, if they have already granted it on the map. Never
   * requested from in here — a sheet that prompts for location the moment it
   * opens spends the one-shot iOS dialog on a screen the user came to for a
   * different reason.
   */
  userCoords?: Coords | null;
}

export function PlanSheet({
  visible,
  onClose,
  rivers,
  riversLoading,
  riversError,
  onRetryRivers,
  river,
  riverDistances,
  onSelectRiver,
  onClearRiver,
  riverLoading,
  state,
  accessPoints,
  userCoords,
}: Props) {
  const { colors } = useTheme();
  const { remember, isSaved, forgetPlan, ready: savedFloatsReady } = useSavedFloats();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale > 1.3;
  const [actions] = useState(createPlanActions);
  useSyncExternalStore(actions.subscribe, actions.getSnapshot, actions.getSnapshot);
  const { step, putIn, takeOut, plan, calculating, error } = state;
  const resultReady = Boolean(river && !riverLoading && step === 'result' && !calculating && !error && plan && plan.river.id === river.id);
  const saved = plan ? isSaved(plan) : false;
  const actionState = plan ? actions.stateFor(plan) : null;
  const saving = actionState?.saving ?? false;
  const sharing = actions.isSharing();

  // Close/edit/recalculate invalidates a pending presentation, even if the
  // same plan is reopened before its link arrives. Explicit saves still finish
  // for their original plan; their busy/error state never moves to a new one.
  useLayoutEffect(() => () => actions.cancelShare(), [actions, visible, plan, resultReady]);
  const close = useCallback(() => {
    actions.cancelShare();
    onClose();
  }, [actions, onClose]);
  const onShare = useCallback(() => {
    if (!plan || !visible || !resultReady) return;
    return actions.share(plan, {
      savePlan: saveFloatPlan,
      present: (message) => Share.share({ message }),
    });
  }, [actions, plan, visible, resultReady]);
  const onToggleSave = useCallback(() => {
    if (!plan || !visible || !resultReady || !savedFloatsReady) return;
    return actions.toggleSave(plan, { isSaved, forgetPlan, savePlan: saveFloatPlan, remember });
  }, [actions, plan, visible, resultReady, savedFloatsReady, isSaved, forgetPlan, remember]);

  const heading = (
    <View style={styles.headText}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Plan a float</Text>
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>{river?.name ?? 'Choose a river'}</Text>
    </View>
  );
  const breadcrumb = river ? (
    <Breadcrumb state={state} riverName={river.name} onChooseRiver={onClearRiver} stacked={stacked} />
  ) : null;
  // Large titles/names must scroll too: three full-size rows fixed above two
  // persistent actions would leave no result viewport on a small iPhone.
  const contentHeader = stacked ? <View style={styles.contentHeader}>{heading}{breadcrumb}</View> : undefined;
  const actionErrors = [actionState?.saveError, actionState?.shareError].filter((message): message is string => Boolean(message));

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      <SafeAreaProvider>
      <SafeAreaView edges={resultReady ? ['top', 'left', 'right'] : ['top', 'left', 'right', 'bottom']} style={[styles.sheet, { backgroundColor: colors.bg }]} onAccessibilityEscape={close}>
        <View style={[styles.head, stacked && styles.compactHead]}>
          {!stacked ? heading : null}
          <Pressable onPress={close} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close planner">
            <Ionicons name="close" size={26} color={colors.textMuted} />
          </Pressable>
        </View>

        {!river ? (
          <RiverList
            header={contentHeader}
            rivers={rivers}
            loading={riversLoading}
            error={riversError}
            onRetry={onRetryRivers}
            distances={riverDistances}
            onSelect={onSelectRiver}
          />
        ) : (
          !stacked ? breadcrumb : null
        )}

        {!river ? null : riverLoading ? (
          <ScrollView style={styles.flex} contentInsetAdjustmentBehavior="never" contentContainerStyle={styles.statusContent}>
            {contentHeader}
            <View style={styles.centered}>
              <ActivityIndicator color={colors.interactive} />
              <Text style={[styles.calculating, { color: colors.textMuted }]}>Loading put-ins…</Text>
            </View>
          </ScrollView>
        ) : step === 'put-in' ? (
          <AccessPointList
            header={contentHeader}
            points={state.putInOptions}
            emptyMessage="This river has no mapped access points yet."
            onSelect={state.choosePutIn}
            selectedId={putIn?.id ?? null}
            userCoords={userCoords}
          />
        ) : step === 'take-out' ? (
          <AccessPointList
            header={contentHeader}
            points={state.takeOutOptions}
            fromPoint={putIn}
            emptyMessage={`There is nothing downstream of ${putIn?.name ?? 'that put-in'}. Pick one further up the river.`}
            onSelect={state.chooseTakeOut}
            selectedId={takeOut?.id ?? null}
          />
        ) : calculating ? (
          <ScrollView style={styles.flex} contentInsetAdjustmentBehavior="never" contentContainerStyle={styles.statusContent}>
            {contentHeader}
            <View style={styles.centered}>
              <ActivityIndicator color={colors.interactive} />
              <Text style={[styles.calculating, { color: colors.textMuted }]}>
                Checking current conditions and building your plan…
              </Text>
            </View>
          </ScrollView>
        ) : error || !plan ? (
          <ScrollView style={styles.flex} contentInsetAdjustmentBehavior="never" contentContainerStyle={styles.statusContent}>
            {contentHeader}
            <View style={styles.centered}>
              <Otter mood="flag" size={100} />
              <Text style={[styles.errorText, { color: colors.text }]}>
                {error ?? 'Could not build that float plan'}
              </Text>
              {putIn && takeOut ? (
                <Pressable
                  onPress={() => state.planFloat(putIn, takeOut)}
                  style={[styles.primaryButton, styles.retryButton, { backgroundColor: colors.accentFill }]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.primaryButtonText, { color: colors.onAccent }]}>Try again</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={() => state.goToStep('put-in')} style={styles.secondaryButton} accessibilityRole="button">
                <Text style={[styles.link, { color: colors.interactive }]}>Change access points</Text>
              </Pressable>
            </View>
          </ScrollView>
        ) : (
          <PlanResult
            plan={plan}
            accessPoints={plan.river.id === river?.id ? accessPoints : undefined}
            header={contentHeader}
            actions={
              <Pressable
                onPress={state.reset}
                style={({ pressed }) => [styles.secondaryButton, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
                accessibilityRole="button"
              >
                <Text style={[styles.secondaryButtonText, { color: colors.textMuted }]}>Plan a different stretch</Text>
              </Pressable>
            }
          />
        )}
        {resultReady ? (
          <SafeAreaView edges={['bottom']} style={[styles.actionFooter, { backgroundColor: colors.chrome, borderTopColor: colors.border }]}>
            {actionErrors.length > 0 ? (
              <ScrollView style={styles.actionErrorArea} contentContainerStyle={styles.actionErrorContent}>
                {actionErrors.map((message) => (
                  <Text key={message} accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.actionError, { color: colors.error }]}>{message}</Text>
                ))}
              </ScrollView>
            ) : null}
            <View style={[styles.actionRow, stacked && styles.actionRowStacked]}>
              <Pressable
                onPress={() => void onToggleSave()}
                disabled={saving || !savedFloatsReady}
                style={({ pressed }) => [styles.saveButton, stacked && styles.stackedButton, {
                  borderColor: saved ? colors.warm : colors.border,
                  backgroundColor: saved ? colors.cardRaised : colors.card,
                  opacity: saving || !savedFloatsReady ? 0.7 : pressed ? 0.6 : 1,
                }]}
                accessibilityRole="button"
                accessibilityState={{ selected: saved, disabled: saving || !savedFloatsReady, busy: saving }}
                accessibilityLabel={saving ? 'Saving float' : saved ? 'Remove this float from favorites' : 'Save this float to favorites'}
              >
                {saving ? <ActivityIndicator color={colors.interactive} size="small" /> : (
                  <Ionicons name={saved ? 'star' : 'star-outline'} size={17} color={saved ? colors.warm : colors.textMuted} />
                )}
                <Text style={[styles.saveButtonText, { color: saved ? colors.text : colors.textMuted }]}>
                  {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => void onShare()}
                disabled={sharing}
                style={({ pressed }) => [styles.primaryButton, stacked && styles.stackedButton, {
                  backgroundColor: pressed ? colors.accentFillPressed : colors.accentFill,
                  opacity: sharing ? 0.7 : 1,
                }]}
                accessibilityRole="button"
                accessibilityLabel={sharing ? 'Preparing to share float' : 'Share float'}
                accessibilityState={{ disabled: sharing, busy: sharing }}
              >
                {sharing ? <ActivityIndicator color={colors.onAccent} size="small" /> : (
                  <Ionicons name="share-outline" size={17} color={colors.onAccent} />
                )}
                <Text style={[styles.primaryButtonText, { color: colors.onAccent }]}>{sharing ? 'Sharing…' : 'Share'}</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        ) : null}
      </SafeAreaView>
      </SafeAreaProvider>
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
function Breadcrumb({
  state,
  riverName,
  onChooseRiver,
  stacked,
}: {
  state: FloatPlanState;
  riverName: string;
  onChooseRiver: () => void;
  stacked: boolean;
}) {
  const { colors } = useTheme();
  /**
   * Each step wears Eddy's own mark for the thing it is asking about.
   *
   * A river is Eddy's river; both ends of the float are Eddy's access-point
   * mark, and they are deliberately THE SAME mark — a put-in and a take-out are
   * one kind of place, and inventing two drawings would claim a distinction the
   * data does not make. What separates them is the crumb's own text, which is
   * either the step's name or the place chosen for it.
   */
  const crumbs: {
    step: 'river' | 'put-in' | 'take-out';
    label: string;
    symbol: EddySymbolName;
    value?: string;
  }[] = [
    { step: 'river', label: 'River', symbol: 'river', value: riverName },
    { step: 'put-in', label: 'Put-in', symbol: 'accessPoint', value: state.putIn?.name },
    { step: 'take-out', label: 'Take-out', symbol: 'accessPoint', value: state.takeOut?.name },
  ];

  return (
    <View style={[styles.breadcrumb, stacked && styles.breadcrumbStacked, { borderBottomColor: colors.border }]}>
      {crumbs.map((crumb, index) => {
        const current = crumb.step !== 'river' && state.step === crumb.step;
        // A step is reachable once the one before it has an answer. Nothing
        // below can be tapped into out of order, so the machine cannot be put
        // into a state where a take-out exists without a put-in.
        const reachable = index < 2 || Boolean(crumbs[index - 1].value);
        // Answered AND not the step being edited. A crumb you are standing in
        // is not done, however much data it holds.
        const done = Boolean(crumb.value) && !current;
        const ink = current
          ? colors.interactive
          : reachable
            ? colors.text
            : colors.textSubtle;
        return (
          <Pressable
            key={crumb.step}
            disabled={!reachable}
            onPress={() =>
              crumb.step === 'river' ? onChooseRiver() : state.goToStep(crumb.step)
            }
            /* ── A chip, not three columns of grey text ──────────────
               Changing the put-in is the single most common correction anybody
               makes in this flow, and the control for it was three stacked
               12pt labels whose only signal that they could be tapped was a
               colour change — which is to say, no signal at all for anyone not
               comparing two of them side by side, and none whatsoever for
               anyone who cannot distinguish the two greys.

               A bordered chip reads as a control at a glance.

               ── The mark took the checkmark's slot ──────────────────
               A checkmark used to lead an answered crumb, and it cannot share
               the leading position with the symbol: a third of a phone's width
               minus a 15pt mark, a 13pt tick and two gaps leaves about eight
               characters for a place called Meramec State Park. The state is
               still carried without colour — an answered crumb reads the place
               and an unanswered one reads the step, which is a stronger signal
               than a tick was, and its mark is dimmed until it has an answer. */
            style={({ pressed }) => [
              styles.crumb,
              stacked && styles.crumbStacked,
              {
                borderColor: current
                  ? colors.interactive
                  : reachable
                    ? colors.border
                    : 'transparent',
                backgroundColor: current ? colors.selectionBg : 'transparent',
                opacity: pressed && reachable ? 0.6 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${crumb.label}${crumb.value ? `: ${crumb.value}` : ', not chosen yet'}`}
            accessibilityHint={reachable ? `Change ${crumb.label.toLowerCase()}` : undefined}
            accessibilityState={{ selected: current, disabled: !reachable }}
          >
            <EddySymbol
              name={crumb.symbol}
              size={15}
              style={{ opacity: done || current ? 1 : 0.45 }}
            />
            <View style={styles.crumbText}>
              <Text style={[styles.crumbLabel, { color: ink }]}>{crumb.label}</Text>
              <Text style={[styles.crumbValue, { color: ink }]} numberOfLines={stacked ? undefined : 2}>
                {crumb.value ?? (crumb.step === 'put-in' ? 'Where you launch' : 'Where you finish')}
              </Text>
            </View>
            {stacked && reachable ? <Ionicons name="chevron-forward" size={17} color={ink} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function RiverList({
  header,
  rivers,
  loading,
  error,
  onRetry,
  distances,
  onSelect,
}: {
  header?: ReactNode;
  rivers: RiverListItem[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  distances: ReadonlyMap<string, number> | null;
  onSelect: (river: RiverListItem) => void;
}) {
  const { colors, elevation } = useTheme();

  if (rivers.length === 0) {
    return (
      <ScrollView style={styles.flex} contentInsetAdjustmentBehavior="never" contentContainerStyle={styles.statusContent}>
        {header}
        <View style={styles.centered}>
          {loading ? <ActivityIndicator color={colors.interactive} /> : <EddyScene name="routePlanning" size={100} />}
          <Text style={[styles.calculating, { color: colors.textMuted }]}>
            {loading ? 'Loading rivers…' : error ? 'Could not load rivers. Check your connection and try again.' : 'No rivers are available to plan right now.'}
          </Text>
          {!loading ? (
            <Pressable onPress={onRetry} style={styles.secondaryButton} accessibilityRole="button">
              <Text style={[styles.link, { color: colors.interactive }]}>Try again</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.flex} contentInsetAdjustmentBehavior="never" contentContainerStyle={styles.list}>
      {header}
      <Text style={[styles.pickerIntro, { color: colors.textMuted }]}>Where do you want to float?</Text>
      {rivers.map((river) => {
        const distance = distances?.get(river.slug) ?? null;
        const code = river.currentCondition?.code ?? 'unknown';
        return (
          <Pressable
            key={river.id}
            onPress={() => onSelect(river)}
            style={({ pressed }) => [
              styles.option,
              { backgroundColor: colors.card, opacity: pressed ? 0.65 : 1 },
              elevation(1),
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Plan a float on ${river.name}`}
          >
            <EddySymbol name="river" size={20} />
            <View style={styles.optionBody}>
              <Text style={[styles.optionName, { color: colors.text }]} numberOfLines={1}>
                {river.name}
              </Text>
              <View style={styles.riverMetaRow}>
                <View style={[styles.conditionDot, { backgroundColor: conditionColor(code) }]} />
                <Text style={[styles.optionMeta, { color: colors.textMuted }]} numberOfLines={1}>
                  {[
                    damControlledLabel(river.riverType, code) ?? river.currentCondition?.label ?? 'Condition unknown',
                    river.region,
                    distance != null
                      ? `${distance < 10 ? distance.toFixed(1) : distance.toFixed(0)} mi away`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={17} color={colors.textSubtle} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function AccessPointList({
  header,
  points,
  onSelect,
  selectedId,
  emptyMessage,
  fromPoint,
  userCoords,
}: {
  header?: ReactNode;
  points: MapAccessPoint[];
  onSelect: (point: MapAccessPoint) => void;
  selectedId: string | null;
  emptyMessage: string;
  /** Set on the take-out step so each row can show the float length it makes. */
  fromPoint?: MapAccessPoint | null;
  /** Set on the PUT-IN step only, enabling a nearest-first ordering. */
  userCoords?: Coords | null;
}) {
  const { colors, elevation } = useTheme();
  // Headwaters-first by default. That is the order a river runs in, and it is
  // the order someone who knows the river thinks in — so nearest-first is an
  // option rather than the default, even when we know where they are.
  const [nearestFirst, setNearestFirst] = useState(false);

  const downstreamOrder = !(nearestFirst && userCoords);
  const fromMile = fromPoint?.riverMile;

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
      <ScrollView style={styles.flex} contentInsetAdjustmentBehavior="never" contentContainerStyle={styles.statusContent}>
        {header}
        <View style={styles.centered}>
          {/* Both messages this renders are about picking a point — no mapped
              access points, or nothing downstream of the put-in — so it shows
              Eddy over a map, not a mood for a river nobody has read.
              The error branch above keeps the canonical `flag` otter. */}
          <EddyScene name="routePlanning" size={100} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>{emptyMessage}</Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <FlatList
      style={styles.flex}
      contentInsetAdjustmentBehavior="never"
      data={ordered}
      keyExtractor={(point) => point.id}
      contentContainerStyle={styles.accessList}
      initialNumToRender={4}
      maxToRenderPerBatch={4}
      windowSize={5}
      extraData={selectedId}
      ListHeaderComponent={
        <View>
          {header}
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
                color={nearestFirst ? colors.interactive : colors.textMuted}
              />
              <Text
                style={[styles.sortText, { color: nearestFirst ? colors.text : colors.textMuted }]}
              >
                {nearestFirst ? 'Nearest to you' : 'Downstream order'}
              </Text>
            </Pressable>
          ) : null}
          <View style={styles.timelineIntro}>
            <Text style={[styles.optionName, { color: colors.text }]}>
              {downstreamOrder ? '↓ Upstream to downstream' : 'Nearest to you'}
            </Text>
            <Text style={[styles.optionMeta, { color: colors.textMuted }]}>
              {downstreamOrder
                ? 'Follow the river miles. Distances are along the river; spacing is not to scale.'
                : 'Sorted by straight-line distance from you, not river order.'}
            </Text>
          </View>
          {downstreamOrder && fromPoint ? (
            <View style={styles.timelineRow}>
              <View style={styles.timelineRail} accessible={false} importantForAccessibility="no-hide-descendants">
                <View style={[styles.timelineLine, { backgroundColor: colors.border }]} />
                <View style={[styles.timelineDot, { backgroundColor: colors.interactive, borderColor: colors.bg }]} />
              </View>
              <View style={styles.timelineContent}>
                <Text style={[styles.mileLabel, { color: colors.interactive }]}>YOUR PUT-IN · MILE {fromPoint.riverMile.toFixed(1)}</Text>
                <Text style={[styles.optionName, { color: colors.text }]}>{fromPoint.name}</Text>
              </View>
            </View>
          ) : null}
        </View>
      }
      renderItem={({ item: point, index }) => {
        const selected = point.id === selectedId;
        const miles = fromMile != null ? point.riverMile - fromMile : null;
        const away = distances?.get(point.id) ?? null;
        const previous = index > 0 ? ordered[index - 1] : fromPoint;
        const gap = previous ? point.riverMile - previous.riverMile : null;
        const segmentLabel = gap == null ? null : gap === 0
          ? 'Same river mile as previous access'
          : `${gap < 0.1 ? '<0.1' : gap.toFixed(1)} mi downstream ${index === 0 ? 'from your put-in' : 'from previous access'}`;
        return (
          <View style={!downstreamOrder ? styles.nearestItem : undefined}>
            {downstreamOrder && segmentLabel ? (
              <View style={styles.timelineRow}>
                <View style={styles.timelineRail} accessible={false} importantForAccessibility="no-hide-descendants">
                  <View style={[styles.timelineLine, styles.segmentLine, { backgroundColor: colors.border }]} />
                </View>
                <Text style={[styles.segmentLabel, { color: colors.textMuted }]}>{segmentLabel}</Text>
              </View>
            ) : null}
            <View style={styles.timelineRow}>
              {downstreamOrder ? (
                <View style={styles.timelineRail} accessible={false} importantForAccessibility="no-hide-descendants">
                  {index < ordered.length - 1 ? <View style={[styles.timelineLine, { backgroundColor: colors.border }]} /> : null}
                  <View style={[styles.timelineDot, { backgroundColor: selected ? colors.interactive : colors.bg, borderColor: colors.interactive }]} />
                </View>
              ) : null}
              <View style={styles.timelineContent}>
                {downstreamOrder ? (
                  <Text style={[styles.mileLabel, { color: colors.interactive }]}>MILE {point.riverMile.toFixed(1)}{miles != null ? ` · ${miles < 0.1 ? '<0.1' : miles.toFixed(1)} mi from put-in` : ''}</Text>
                ) : null}
                <Pressable
                  key={point.id}
                  onPress={() => onSelect(point)}
                  style={({ pressed }) => [
                    styles.accessCard,
                    elevation(1),
                    {
                      backgroundColor: selected ? colors.cardRaised : colors.card,
                      borderColor: selected ? colors.interactive : colors.border,
                      opacity: pressed ? 0.65 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`${point.name}, river mile ${point.riverMile.toFixed(1)}${miles != null ? `, ${miles < 0.1 ? 'less than 0.1' : miles.toFixed(1)} miles downstream from your put-in` : ''}, ${point.isPublic ? 'public access' : 'private access, check permission'}, ${accessTypeLabel(point.type)}${away != null ? `, ${away.toFixed(1)} miles away` : ''}`}
                  accessibilityState={{ selected }}
                >
                  <PlanAccessPhoto point={point} style={styles.accessPhoto} compactFallback />
                  <View style={styles.accessDetails}>
                    <View style={styles.optionBody}>
                      <Text style={[styles.optionName, { color: colors.text }]}>
                        {point.name}
                      </Text>
                      <Text style={[styles.accessStatus, { color: colors.text }]}>
                        {point.isPublic ? 'Public access' : 'Private access · Check permission'}
                      </Text>
                      <Text style={[styles.optionMeta, { color: colors.textMuted }]}>
                        {[
                          accessTypeLabel(point.type),
                          !downstreamOrder ? `Mile ${point.riverMile.toFixed(1)}` : null,
                          // The number that actually decides a take-out. Reading it off
                          // two river miles in your head is exactly the arithmetic an
                          // app should be doing for you.
                          !downstreamOrder && miles != null ? `${miles.toFixed(1)} mi float` : null,
                          // Straight-line, and labelled "away" rather than "drive" for
                          // exactly that reason — an Ozark put-in eight miles off can be
                          // forty minutes of gravel road.
                          away != null ? `${away < 10 ? away.toFixed(1) : away.toFixed(0)} mi away` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                    {selected ? <Ionicons name="checkmark-circle" size={22} color={colors.interactive} /> : null}
                  </View>
                </Pressable>
              </View>
            </View>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  flex: { flex: 1 },
  statusContent: { flexGrow: 1, padding: 16 },
  contentHeader: { gap: 12, marginBottom: 12 },
  compactHead: { paddingTop: 4, paddingBottom: 4, justifyContent: 'flex-end' },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 10,
  },
  headText: { flexShrink: 1 },
  title: { ...t['2xl'], fontFamily: fonts.display },
  subtitle: { ...t.sm, fontFamily: fonts.body, marginTop: 1 },
  breadcrumb: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    // Top padding it never had. The row sat directly against the sheet's title
    // block, so the three pills read as attached to "Plan a float" rather than
    // as the step control under it.
    paddingTop: 4,
    paddingBottom: 14,
    borderBottomWidth: 1,
    // Tighter between the pills now that each one is wider inside. The row is
    // three equal thirds either way; what changed is where the space went —
    // into the pills, where it separates the mark from the place name, rather
    // than into the gaps, where it only separated the pills from each other.
    gap: 8,
  },
  breadcrumbStacked: { flexDirection: 'column', paddingHorizontal: 0, borderBottomWidth: 0 },
  crumbStacked: { flex: 0, justifyContent: 'flex-start', paddingHorizontal: 12, gap: 12 },
  crumb: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 10,
    minHeight: 60,
    borderRadius: 12,
    borderWidth: 1,
  },
  crumbText: { flex: 1, minWidth: 0, gap: 3 },
  crumbLabel: { ...t.sm, fontFamily: fonts.semibold },
  crumbValue: { ...t.sm, fontFamily: fonts.body },
  accessStatus: { ...t.sm, fontFamily: fonts.semibold, marginTop: 4 },
  list: { padding: 16, gap: 8 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13, borderRadius: 12 },
  accessList: { padding: 16 },
  timelineIntro: { gap: 4, marginBottom: 16 },
  timelineRow: { flexDirection: 'row', alignItems: 'stretch' },
  timelineRail: { width: 24, alignItems: 'center', marginRight: 8 },
  timelineLine: { position: 'absolute', width: 2, top: 8, bottom: 0 },
  segmentLine: { top: 0 },
  timelineDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, marginTop: 3 },
  timelineContent: { flex: 1, minWidth: 0 },
  mileLabel: { ...t.sm, fontFamily: fonts.mono, marginBottom: 8 },
  segmentLabel: { flex: 1, ...t.sm, fontFamily: fonts.body, paddingVertical: 14 },
  nearestItem: { marginBottom: 12 },
  accessCard: { borderRadius: radii.card, borderWidth: 1 },
  accessPhoto: { width: '100%', aspectRatio: 16 / 9, borderTopLeftRadius: radii.card - 1, borderTopRightRadius: radii.card - 1 },
  accessDetails: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  optionBody: { flex: 1, minWidth: 0 },
  optionName: { ...t.sm, fontFamily: fonts.semibold },
  optionMeta: { ...t.sm, fontFamily: fonts.body, marginTop: 2 },
  pickerIntro: { ...t.sm, fontFamily: fonts.body, marginBottom: 4 },
  riverMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  conditionDot: { width: 8, height: 8, borderRadius: 4 },
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
    minHeight: 44,
  },
  sortText: { ...t.sm, fontFamily: fonts.semibold },
  centered: { flexGrow: 1, flexShrink: 0, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  calculating: { ...t.sm, fontFamily: fonts.body, textAlign: 'center' },
  emptyText: { ...t.sm, fontFamily: fonts.body, textAlign: 'center' },
  errorText: { ...t.base, fontFamily: fonts.semibold, textAlign: 'center' },
  link: { ...t.base, fontFamily: fonts.semibold },
  actionFooter: { flexShrink: 0, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  actionErrorArea: { maxHeight: 96, flexShrink: 1 },
  actionErrorContent: { paddingVertical: 4, gap: 8 },
  retryButton: { flex: 0, paddingHorizontal: 24, minHeight: 44 },
  actionRow: { flexDirection: 'row', gap: 12 },
  actionRowStacked: { flexDirection: 'column' },
  stackedButton: { flex: 0 },
  // Both flex:1, so the two intentions carry the same weight. Share keeps the
  // accent — it is still the thing most people do with a finished plan — and
  // Save is outlined until it is on, when it wears the star's own warm edge.
  saveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
  },
  saveButtonText: { ...t.base, fontFamily: fonts.heading, flexShrink: 1, textAlign: 'center' },
  primaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    minHeight: 48,
    borderRadius: 12,
  },
  primaryButtonText: { ...t.base, fontFamily: fonts.heading, flexShrink: 1, textAlign: 'center' },
  actionError: { ...t.sm, fontFamily: fonts.body, textAlign: 'center' },
  secondaryButton: { minHeight: 44, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  secondaryButtonText: { ...t.sm, fontFamily: fonts.semibold, textAlign: 'center' },
});
