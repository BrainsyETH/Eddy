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

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useIsFocused, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ControlIcon } from '@/components/ControlIcon';
import type { FloatPlan, MapAccessPoint, RiverListItem } from '@eddy/types';
import { saveFloatPlan } from '@/api/client';
import { selectionFeedback, successFeedback } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { EddyScene } from '@/components/EddyScene';
import { EddySymbol } from '@/components/EddySymbol';
import { PlanRouteFields } from '@/components/PlanRouteFields';
import { PlanAccessPicker } from '@/components/PlanAccessPicker';
import { Otter } from '@/components/Otter';
import { SavedTripDownload } from '@/float/SavedTripDownload';
import { PlanResult } from '@/components/PlanResult';
import type { FloatPlanState } from '@/hooks/useFloatPlan';
import { matchesPlan, useSavedFloats } from '@/hooks/useSavedFloats';
import type { Coords } from '@/hooks/useLocation';
import { damControlledLabel } from '@/lib/readingCopy';
import { conditionColor } from '@/theme/conditions';
import { createPlanActions } from '@/lib/planActions';
import { createPlanDetailNavigation } from '@/lib/planDetailNavigation';
import type { PlanDetailDestination } from '@/lib/planDestinations';
import { usePlanSupport } from '@/hooks/usePlanSupport';
import { useFloatSession } from '@/hooks/useFloatSession';
import { useAppConfig } from '@/hooks/useAppConfig';

interface Props {
  visible: boolean;
  /** 'started' when the sheet closed because a float started from it. */
  onClose: (reason?: 'started' | 'map') => void;
  /** Existing Map planner can reveal its own route without navigating/recalculating. */
  onViewMap?: () => void;
  /** Standalone planners pop only after the native sheet finishes dismissing. */
  onClosed?: () => void;
  replaceOnStart?: boolean;
  rivers: RiverListItem[];
  riversLoading: boolean;
  riversError: string | null;
  onRetryRivers: () => void;
  river: RiverListItem | null;
  riverDistances: ReadonlyMap<string, number> | null;
  onSelectRiver: (river: RiverListItem) => void;
  onClearRiver: () => void;
  riverLoading: boolean;
  accessError?: string | null;
  onRetryAccess?: () => void;
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
  onClosed,
  replaceOnStart = false,
  onViewMap,
  rivers,
  riversLoading,
  riversError,
  onRetryRivers,
  river,
  riverDistances,
  onSelectRiver,
  onClearRiver,
  riverLoading,
  accessError,
  onRetryAccess,
  state,
  accessPoints,
  userCoords,
}: Props) {
  const { colors } = useTheme();
  const { floats, remember, isSaved, forgetPlan, ready: savedFloatsReady } = useSavedFloats();
  const { features } = useAppConfig();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale > 1.3;
  const [actions] = useState(createPlanActions);
  useSyncExternalStore(actions.subscribe, actions.getSnapshot, actions.getSnapshot);
  const { step, putIn, takeOut, plan, calculating, error } = state;
  const resultReady = Boolean(river && !riverLoading && step === 'result' && !calculating && !error && plan && plan.river.id === river.id);
  const router = useRouter();
  const activeFloat = useFloatSession();
  const focused = useIsFocused();
  const closeRequested = useRef(false);
  const [detailNavigation] = useState(createPlanDetailNavigation);
  const suspended = useSyncExternalStore(detailNavigation.subscribe, detailNavigation.getSnapshot, detailNavigation.getSnapshot);
  // A dismissed native Modal unmounts its children. Keep logistics and the
  // scroll position here so Back restores the same result without a reload.
  const support = usePlanSupport(resultReady ? plan : null);
  const [scrollPositions] = useState(() => new WeakMap<FloatPlan, number>());
  useLayoutEffect(() => { detailNavigation.focus(focused); }, [detailNavigation, focused]);
  useLayoutEffect(() => { if (!visible) detailNavigation.reset(); }, [detailNavigation, visible]);
  useLayoutEffect(() => () => detailNavigation.reset(), [detailNavigation, plan]);
  const openDetail = useCallback((destination: PlanDetailDestination) => {
    if (!visible || !resultReady || !focused) return;
    actions.cancelShare();
    detailNavigation.open(destination);
  }, [actions, detailNavigation, visible, resultReady, focused]);
  const presentDetail = useCallback(() => {
    const destination = detailNavigation.dismissed();
    if (!destination) return;
    if (!visible || !resultReady || !focused) { detailNavigation.reset(); return; }
    if (destination.pathname === '/') {
      if (onViewMap) onViewMap();
      else {
        if (replaceOnStart && router.canGoBack()) router.back();
        router.navigate(destination);
      }
      onClose('map');
      detailNavigation.reset();
      return;
    }
    const openingFloat = destination.pathname === '/float-start' || destination.pathname === '/float-mode';
    if (destination.pathname === '/float-mode' && replaceOnStart) {
      router.back();
      router.push(destination);
    } else if (openingFloat && replaceOnStart) router.replace(destination);
    else router.push(destination);
    // A started float is where the paddler is going, not a detail to come
    // back from: the planner does not reopen over the map afterwards.
    if (openingFloat) onClose('started');
  }, [detailNavigation, router, visible, resultReady, focused, onClose, replaceOnStart, onViewMap]);
  // iOS waits for the native dismissal callback. Other platforms remove the
  // modal when visible becomes false and do not emit that callback.
  useEffect(() => {
    if (Platform.OS !== 'ios' && suspended) presentDetail();
  }, [suspended, presentDetail]);
  useEffect(() => {
    if (Platform.OS !== 'ios' && !visible) onClosed?.();
  }, [visible, onClosed]);
  const saved = plan ? isSaved(plan) : false;
  const keptPlan = plan ? floats.find(f => matchesPlan(f, plan)) : undefined;
  const actionState = plan ? actions.stateFor(plan) : null;
  const saving = actionState?.saving ?? false;
  const sharing = actions.isSharing();

  // Close/edit/recalculate invalidates a pending presentation, even if the
  // same plan is reopened before its link arrives. Explicit saves still finish
  // for their original plan; their busy/error state never moves to a new one.
  useLayoutEffect(() => () => actions.cancelShare(), [actions, visible, plan, resultReady]);
  const close = useCallback(() => {
    closeRequested.current = true;
    actions.cancelShare();
    detailNavigation.reset();
    onClose();
  }, [actions, detailNavigation, onClose]);
  const onShare = useCallback(() => {
    if (!plan || !visible || !resultReady) return;
    return actions.share(plan, {
      savePlan: saveFloatPlan,
      present: (message) => Share.share({ message }),
    });
  }, [actions, plan, visible, resultReady]);
  const onToggleSave = useCallback(async () => {
    if (!plan || !visible || !resultReady || !savedFloatsReady) return;
    const result = await actions.toggleSave(plan, { isSaved, forgetPlan, savePlan: saveFloatPlan, remember });
    if (result === 'saved') successFeedback();
    else if (result === 'removed') selectionFeedback();
  }, [actions, plan, visible, resultReady, savedFloatsReady, isSaved, forgetPlan, remember]);

  // Every route opens readiness in this tab, or resumes the active recorder.
  const canStart = features.floatMode && resultReady && plan != null;
  const onStart = useCallback(() => {
    if (!plan || !visible || !resultReady || !focused) return;
    const kept = floats.find((f) => f.riverSlug === plan.river.slug && f.putInId === plan.putIn.id && f.takeOutId === plan.takeOut.id);
    actions.cancelShare();
    detailNavigation.open(activeFloat ? { pathname: '/float-mode' } : {
      pathname: '/float-start',
      params: {
        riverSlug: plan.river.slug,
        boatType: plan.vessel.slug,
        putInId: plan.putIn.id,
        takeOutId: plan.takeOut.id,
        ...(kept ? { shortCode: kept.shortCode } : {}),
      },
    });
  }, [actions, detailNavigation, floats, plan, visible, resultReady, focused, activeFloat]);

  const heading = (
    <View style={styles.headText}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{resultReady ? 'Your float plan' : 'Build a Route'}</Text>
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>{river?.name ?? 'Choose a river'}</Text>
    </View>
  );
  const breadcrumb = river ? (
    <PlanRouteFields state={state} riverName={river.name} onChooseRiver={onClearRiver}
      onChooseStep={state.goToStep} stacked={stacked}
      style={[styles.breadcrumb, stacked && styles.breadcrumbStacked, { borderBottomColor: colors.border }]} />
  ) : null;
  // Large titles/names must scroll too: three full-size rows fixed above two
  // persistent actions would leave no result viewport on a small iPhone.
  const contentHeader = stacked ? <View style={styles.contentHeader}>{heading}{breadcrumb}</View> : undefined;
  const actionErrors = [actionState?.saveError, actionState?.shareError].filter((message): message is string => Boolean(message));

  return (
    <Modal
      visible={visible && focused && !suspended}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
      allowSwipeDismissal
      onDismiss={() => {
        if (closeRequested.current) {
          closeRequested.current = false;
          onClosed?.();
        } else presentDetail();
      }}
    >
      <SafeAreaProvider>
      <SafeAreaView edges={resultReady ? ['top', 'left', 'right'] : ['top', 'left', 'right', 'bottom']} style={[styles.sheet, { backgroundColor: colors.bg }]} onAccessibilityEscape={close}>
        <View style={[styles.head, stacked && styles.compactHead]}>
          {!stacked ? heading : null}
          <Pressable onPress={close} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close planner">
            <ControlIcon name="close" size={26} color={colors.textMuted} />
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
        ) : accessError ? (
          <ScrollView style={styles.flex} contentContainerStyle={styles.statusContent}>
            {contentHeader}
            <Text accessibilityRole="alert" style={[styles.errorText, { color: colors.text }]}>{accessError}</Text>
            <Pressable onPress={onRetryAccess} style={styles.secondaryButton} accessibilityRole="button">
              <Text style={[styles.link, { color: colors.interactive }]}>Try again</Text>
            </Pressable>
          </ScrollView>
        ) : step === 'put-in' ? (
          <PlanAccessPicker
            header={contentHeader}
            points={state.putInOptions}
            emptyMessage="This river has no mapped access points yet."
            onSelect={state.choosePutIn}
            selectedId={putIn?.id ?? null}
            userCoords={userCoords}
          />
        ) : step === 'take-out' ? (
          <PlanAccessPicker
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
                  onPress={state.retry}
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
            support={support}
            initialScrollOffset={scrollPositions.get(plan) ?? 0}
            onScrollOffsetChange={(offset) => { scrollPositions.set(plan, offset); }}
            onOpenDetail={openDetail}
            accessPoints={plan.river.id === river?.id ? accessPoints : undefined}
            header={contentHeader}
            actions={<>
              {features.floatMode && keptPlan ? <SavedTripDownload key={keptPlan.shortCode} riverSlug={plan.river.slug} shortCode={keptPlan.shortCode}
                putInId={plan.putIn.id} takeOutId={plan.takeOut.id} /> : features.floatMode ? <View>
                <Text style={[styles.subtitle, { color: colors.textMuted }]}>Save this route to download its offline map.</Text>
                <Pressable accessibilityRole="button" disabled={saving || !savedFloatsReady} onPress={() => void onToggleSave()}
                  style={styles.secondaryButton}>
                  <Text style={[styles.link, { color: colors.interactive }]}>{saving ? 'Saving…' : 'Save route for offline'}</Text>
                </Pressable>
              </View> : null}
              <Pressable
                onPress={state.reset}
                style={({ pressed }) => [styles.secondaryButton, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
                accessibilityRole="button"
              >
                <Text style={[styles.secondaryButtonText, { color: colors.textMuted }]}>Plan a different stretch</Text>
              </Pressable>
            </>}
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
            {canStart ? (
              <Pressable
                onPress={onStart}
                style={({ pressed }) => [styles.primaryButton, styles.startButton, { backgroundColor: pressed ? colors.accentFillPressed : colors.accentFill }]}
                accessibilityRole="button"
                accessibilityHint={activeFloat ? 'Returns to your float in progress' : 'Review this route before starting tracking'}
              >
                <ControlIcon name="navigate-outline" size={17} color={colors.onAccent} />
                <Text style={[styles.primaryButtonText, { color: colors.onAccent }]}>{activeFloat ? 'Resume float' : 'Float this route'}</Text>
              </Pressable>
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
                  <ControlIcon name={saved ? 'star' : 'star-outline'} size={17} color={saved ? colors.warm : colors.textMuted} />
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
                  <ControlIcon name="share-outline" size={17} color={colors.onAccent} />
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
            <ControlIcon name="chevron-forward" size={17} color={colors.textSubtle} />
          </Pressable>
        );
      })}
    </ScrollView>
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
  list: { padding: 16, gap: 8 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13, borderRadius: 12 },
  optionBody: { flex: 1, minWidth: 0 },
  optionName: { ...t.sm, fontFamily: fonts.semibold },
  optionMeta: { ...t.sm, fontFamily: fonts.body, marginTop: 2 },
  pickerIntro: { ...t.sm, fontFamily: fonts.body, marginBottom: 4 },
  riverMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  conditionDot: { width: 8, height: 8, borderRadius: 4 },
  centered: { flexGrow: 1, flexShrink: 0, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  calculating: { ...t.sm, fontFamily: fonts.body, textAlign: 'center' },
  errorText: { ...t.base, fontFamily: fonts.semibold, textAlign: 'center' },
  link: { ...t.base, fontFamily: fonts.semibold },
  actionFooter: { flexShrink: 0, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  actionErrorArea: { maxHeight: 96, flexShrink: 1 },
  actionErrorContent: { paddingVertical: 4, gap: 8 },
  retryButton: { flex: 0, paddingHorizontal: 24, minHeight: 44 },
  actionRow: { flexDirection: 'row', gap: 12 },
  actionRowStacked: { flexDirection: 'column' },
  stackedButton: { flex: 0 },
  startButton: { flex: 0 },
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
