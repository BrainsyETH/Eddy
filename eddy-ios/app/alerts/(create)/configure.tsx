// eddy-ios/app/alerts/(create)/configure.tsx
// Step two: what should it tell you, and when?
//
// ── Two modes, and why both ─────────────────────────────────────────────────
//
// "Eddy's call" defers to the same ladder the river screen shows, so the alert
// and the app can never disagree about what is floatable. That is the right
// default and what most people want. But a ladder is an editorial judgement
// about a whole river, and plenty of people have a number of their own — a
// canoe that needs 2.8 ft, a play wave that works between 900 and 1,400 cfs.
// "My own level" is that, and it is the only option at all on the ~16,500
// national gauges, which Eddy rates for no river.
//
// ── Where a rule actually goes ──────────────────────────────────────────────
//
// A river + Eddy's call is a subscription to the global condition outbox
// (/api/me/alert-subscriptions), because that verdict is one shared fact fanned
// out to everybody watching. Everything else is a per-rule row evaluated on its
// own (/api/me/gauge-alerts). The user sees one screen; the split is ours.
//
// ── The seeded reading ──────────────────────────────────────────────────────
//
// The server starts a rule knowing which side of the threshold the river is on,
// so a rule set on water already above its level waits for a real crossing
// rather than firing immediately. That is right, and it is invisible — so when
// it happens we say it out loud, or a rule that correctly declines to fire looks
// like one that is broken.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { ControlIcon as Ionicons } from '@/components/ControlIcon';
import { Stack, useLocalSearchParams, useNavigation } from 'expo-router';
import {
  describeAlertRule,
  formatAlertValue,
  GAUGE_ALERT_LATENCY_NOTE,
  type AlertComparator,
  type AlertMetric,
  type AlertRuleMode,
  type AlertSubscriptionKind,
  type GaugeDetailThreshold,
} from '@eddy/types';
import { ApiError, createGaugeAlert, fetchCondition, fetchGaugeDetail, subscribeToRiver } from '@/api/client';
import { AppleSignInButton } from '@/components/AppleSignInButton';
import { AlertCreationFrame } from '@/components/AlertCreationFrame';
import { useCloseAlertCreation } from '@/hooks/useCloseAlertCreation';
import { useSession } from '@/hooks/useSession';
import { usePreventRemove } from 'expo-router/react-navigation';
import { alertAnchor, alertDraftChanged, createAlertSaveTask } from '@/lib/alertCreation';
import { successFeedback } from '@/lib/haptics';
import { ConditionCodeChips } from '@/components/ConditionCodeChips';
import { Otter } from '@/components/Otter';
import { CONDITION_KINDS, codesForKind } from '@/lib/alertKinds';
import { readingAge } from '@/lib/readingCopy';
import { useAlertRules } from '@/hooks/useAlertRules';
import { useAlertGate } from '@/hooks/useAlertGate';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

/** What the screen learned about the water it is configuring. */
interface Context {
  gaugeName: string | null;
  /** Null for a river with no gauge wired — nothing to set a level against. */
  usgsSiteId: string | null;
  gaugeStationId: string | null;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  /** True when Eddy rates this water and can therefore issue a verdict. */
  rated: boolean;
  /** The unit that ladder is defined in, when there is one. */
  ladderUnit: 'ft' | 'cfs' | null;
  /** False for a national-tier station: hourly refresh, so a slower alert. */
  curated: boolean;
  /**
   * How old the number below the "Right now" label actually is.
   *
   * This card sets the anchor for the threshold field, so an unlabelled reading
   * is an invitation to type a level one step above a number that has already
   * moved. The gauge screen has always shown this; the screen where it decides
   * something did not.
   */
  readingAgeHours: number | null;
}

/**
 * Whether a threshold link carries an actual ladder, as against merely existing.
 *
 * A `river_gauges` row can have every level NULL and still be a correct,
 * intentional row — migration 00198 wires Clearwater Dam's release to the Black
 * exactly that way, on the stated grounds that calibrating a floatability
 * ladder for a dam release is a safety judgement Eddy would be held to. The
 * flood stage is deliberately NOT counted: it is the NWS's number, quoted, and
 * it drives a warning rather than the condition ladder this gates.
 *
 * Any one level is enough. A partial ladder still produces a verdict — the
 * classifier reads whichever bands are set — and demanding all six would hide
 * Eddy's call on water it genuinely does grade.
 */
function hasLadderLevels(link: GaugeDetailThreshold | null): boolean {
  if (!link) return false;
  return [
    link.levelTooLow,
    link.levelLow,
    link.levelOptimalMin,
    link.levelOptimalMax,
    link.levelHigh,
    link.levelDangerous,
  ].some((level) => level != null);
}

const COMPARATORS: { value: AlertComparator; label: string }[] = [
  { value: 'above', label: 'Rises above' },
  { value: 'below', label: 'Drops below' },
  { value: 'between', label: 'Is between' },
];

export default function ConfigureAlertScreen() {
  const params = useLocalSearchParams<{
    scope?: string;
    riverId?: string;
    riverSlug?: string;
    riverName?: string;
    gaugeId?: string;
    siteId?: string;
    gaugeName?: string;
  }>();

  const scope: 'river' | 'gauge' = params.scope === 'river' ? 'river' : 'gauge';
  const riverId = params.riverId || null;
  const riverName = params.riverName || null;

  const navigation = useNavigation();
  const { fontScale } = useWindowDimensions();
  const close = useCloseAlertCreation();
  const { accountsConfigured } = useSession();
  const [saveTask] = useState(createAlertSaveTask);
  const [saving, setSaving] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [enablingPush, setEnablingPush] = useState(false);
  const signingInRef = useRef(false);
  const enablingPushRef = useRef(false);
  const confirmingDiscard = useRef(false);
  const [completion, setCompletion] = useState<{ seedNote: string | null; primed: boolean } | null>(null);
  const { colors, elevation } = useTheme();
  const { add, refresh } = useAlertRules();
  // Reuse the one-tap bell's session and permission policy. This task renders
  // sign-in and the primer inline, without adding another modal.
  const gate = useAlertGate();

  const [context, setContext] = useState<Context | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // A null `context` has two causes that owe the user opposite sentences: the
  // route carried no station at all, or the request for its reading failed.
  // Without this flag the screen cannot tell them apart, and it chose the
  // wrong one — telling someone who had just tapped "Alert me" on a gauge that
  // the river has no gauge. See the hints under the mode chips.
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const [mode, setMode] = useState<AlertRuleMode>('condition');
  const [conditionKind, setConditionKind] = useState<AlertSubscriptionKind>('safety');
  const [metric, setMetric] = useState<AlertMetric>('gauge_height_ft');
  const [comparator, setComparator] = useState<AlertComparator>('above');
  const [value, setValue] = useState('');
  const [valueMax, setValueMax] = useState('');
  const [oneShot, setOneShot] = useState(false);

  const targetName = (scope === 'gauge' ? params.gaugeName || riverName : riverName) || 'this water';

  // ── Load the live reading and whatever ladder applies ────────────────────
  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        setLoadFailed(false);
        if (scope === 'gauge' && params.siteId) {
          const gauge = await fetchGaugeDetail(params.siteId, controller.signal);
          if (controller.signal.aborted) return;
          // FIND-PRIMARY, not [0]. A station can rate several rivers with
          // different ladders, and the second one's bands under this reading
          // would be quietly wrong. Same rule gaugeLink() applies everywhere.
          const link = gauge?.thresholds?.find((l) => l.isPrimary) ?? gauge?.thresholds?.[0] ?? null;
          setContext({
            gaugeName: gauge?.name ?? params.gaugeName ?? null,
            usgsSiteId: gauge?.siteId ?? params.siteId,
            gaugeStationId: gauge?.id ?? params.gaugeId ?? null,
            gaugeHeightFt: gauge?.gaugeHeightFt ?? null,
            dischargeCfs: gauge?.dischargeCfs ?? null,
            // A LADDER WITH LEVELS IN IT, not merely a row.
            //
            // A river_gauges link can exist with every level NULL, and that is
            // a deliberate state rather than incomplete data — migration 00198
            // wires Clearwater Dam's release to the Black that way, because
            // calibrating a floatability ladder for a dam release is a safety
            // judgement Eddy would be held to. `Boolean(link)` called those
            // stations rated, offered "Eddy's call", and let someone fill in a
            // form the server answers with 422 no_ladder on save.
            rated: hasLadderLevels(link),
            ladderUnit: link?.thresholdUnit ?? null,
            curated: gauge?.curated ?? false,
            readingAgeHours: gauge?.readingAgeHours ?? null,
          });
        } else if (riverId) {
          const condition = await fetchCondition(riverId, controller.signal);
          if (controller.signal.aborted) return;
          setContext({
            gaugeName: condition?.gaugeName ?? null,
            usgsSiteId: condition?.gaugeUsgsId ?? null,
            gaugeStationId: null,
            gaugeHeightFt: condition?.gaugeHeightFt ?? null,
            dischargeCfs: condition?.dischargeCfs ?? null,
            rated: Boolean(condition),
            ladderUnit: condition?.thresholdUnit ?? null,
            // A river is wired to a station, and everything wired is curated
            // by definition (migration 00196).
            curated: true,
            readingAgeHours: condition?.readingAgeHours ?? null,
          });
        }
      } catch {
        // A gauge we cannot read is still one you can set a level on — the
        // server re-checks everything on save. Losing the current reading costs
        // the helpful default, not the feature.
        //
        // Keeping that promise takes more than this catch: `hasStation`, the
        // save payload and the mode default all used to read the station out of
        // `context` alone, so a failure here disabled the form it claims to
        // preserve. Each of the three now falls back to the route params.
        if (!controller.signal.aborted) {
          setContext(null);
          setLoadFailed(true);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [scope, params.siteId, params.gaugeId, params.gaugeName, riverId, loadAttempt]);

  // ── Defaults that follow from what we found ──────────────────────────────
  //
  // Either identifier will do, and both have to be accepted: a gauge reached
  // from search carries the river's id, while one reached from the star store
  // carries only its slug — StarredItem has never held an id. Requiring the id
  // would silently hide Eddy's call on exactly the gauges someone cared enough
  // about to star.
  const hasRiver = Boolean(riverId || params.riverSlug);
  const canUseCondition = Boolean(context?.rated && hasRiver);
  const hasHeight = context?.gaugeHeightFt != null;
  const hasDischarge = context?.dischargeCfs != null;

  useEffect(() => {
    if (loading) return;
    // Eddy's call when Eddy has one, because it is the answer that cannot
    // disagree with the rest of the app.
    //
    // This runs once loading finishes rather than only when `context` arrived.
    // `mode` initialises to 'condition', and a failed load left it there with
    // `canUseCondition` false — so `canSave` was false and the form was dead no
    // matter what else was fixed. Falling to 'threshold' is the honest default
    // when there is no verdict to offer.
    setMode(canUseCondition ? 'condition' : 'threshold');
    // The rest needs a reading to choose between units; without one the
    // initial metric stands and the field simply opens empty.
    if (!context) return;
    // Prefer the unit the water is actually rated in; otherwise whichever
    // series this station publishes. Never a unit with no reading behind it.
    const preferred: AlertMetric =
      context.ladderUnit === 'cfs'
        ? 'discharge_cfs'
        : context.ladderUnit === 'ft'
          ? 'gauge_height_ft'
          : context.gaugeHeightFt != null
            ? 'gauge_height_ft'
            : 'discharge_cfs';
    setMetric(preferred);
  }, [loading, context, canUseCondition]);

  const currentValue = metric === 'discharge_cfs' ? context?.dischargeCfs ?? null : context?.gaugeHeightFt ?? null;

  // Which unit the number currently in the field was entered against. Without
  // this the screen cannot tell "the user typed 3.40 feet" from "the user typed
  // 3.40 cfs", which is the whole of the bug below.
  const enteredMetric = useRef<AlertMetric | null>(null);

  // ── Anchor the field to the river, and RE-anchor when the unit changes ────
  //
  // FEET AND CFS DO NOT CONVERT. Stage and discharge relate only through that
  // station's own rating curve, which Eddy does not hold, so there is no
  // arithmetic that turns 3.40 ft into a cfs number. This effect used to write
  // the field only when it was empty, which meant switching the unit left the
  // digits alone: "rises above 3.40 ft" quietly became "rises above 3.40 cfs",
  // a threshold roughly two orders of magnitude off and one the user never
  // typed.
  //
  // What it can honestly do instead is offer the gauge's live reading in the
  // newly chosen unit — the same number the screen would have opened with had
  // that unit been the default. Typing WITHIN a unit is still never overwritten.
  useEffect(() => {
    if (!context) return;
    if (enteredMetric.current === metric) return;

    enteredMetric.current = metric;
    setValue(alertAnchor(currentValue, metric));
    // The upper bound is cleared rather than re-anchored: both ends of a range
    // cannot be the one current reading, and a max left over from the other
    // unit is the same bug one field along.
    setValueMax('');
  }, [context, metric, currentValue]);

  const parsedValue = Number(value);
  const parsedMax = Number(valueMax);
  const valueValid = Number.isFinite(parsedValue) && value.trim() !== '';
  const maxValid = comparator !== 'between' || (valueMax.trim() !== '' && Number.isFinite(parsedMax) && parsedMax > parsedValue);

  // A level needs a station to measure it at, and a river with no gauge wired
  // has none. Without this the screen happily takes a number and the save
  // answers 404 "Gauge not found" — a true statement about a request the user
  // never knowingly made.
  //
  // The ROUTE PARAMS count as a station, not just the loaded context. Reaching
  // this screen with scope 'gauge' means a gauge pin or row was tapped, and its
  // id came along in the link — so a reading we could not fetch says nothing
  // about whether the station exists. Reading `context` alone turned a dropped
  // request into "this river has no gauge" and a permanently dead Save button.
  const hasStation = Boolean(
    context?.usgsSiteId ||
      context?.gaugeStationId ||
      (scope === 'gauge' && (params.siteId || params.gaugeId)),
  );
  const canSave =
    mode === 'condition' ? canUseCondition : hasStation && valueValid && maxValid;

  /**
   * The sentence under the controls — the same one the row, the push body and
   * the primer will use.
   *
   * Only the TRIGGER fields. This used to assemble a whole fabricated AlertRule
   * — an empty id, a made-up createdAt, a `source` this screen cannot know yet
   * — because describeAlertRule asked for one; it reads six fields and ignored
   * the rest, so the other fourteen were scaffolding that implied they mattered
   * and had to be kept plausible as the type changed. AlertRuleTrigger is that
   * function's real input.
   */
  const preview = useMemo(
    () =>
      describeAlertRule({
        mode,
        conditionKind,
        metric,
        comparator,
        thresholdValue: valueValid ? parsedValue : null,
        thresholdValueMax: comparator === 'between' && Number.isFinite(parsedMax) ? parsedMax : null,
      }),
    [mode, conditionKind, metric, comparator, valueValid, parsedValue, parsedMax],
  );

  const initialMetric: AlertMetric = context?.ladderUnit === 'cfs'
    ? 'discharge_cfs' : context?.ladderUnit === 'ft' || context?.gaugeHeightFt != null || !context
      ? 'gauge_height_ft' : 'discharge_cfs';
  const initialValue = initialMetric === 'discharge_cfs' ? context?.dischargeCfs : context?.gaugeHeightFt;
  const usesOneShot = !(scope === 'river' && mode === 'condition');
  const dirty = !loading && alertDraftChanged(
    { mode, conditionKind, metric, comparator, value, valueMax, oneShot: usesOneShot && oneShot },
    { mode: canUseCondition ? 'condition' : 'threshold', conditionKind: 'safety', metric: initialMetric,
      comparator: 'above', value: alertAnchor(initialValue ?? null, initialMetric), valueMax: '', oneShot: false },
  );

  // This also propagates through the nested navigator to the sheet's native
  // swipe dismissal. Re-dispatch the exact action only after confirmation.
  usePreventRemove((dirty && !completion) || saving || signingIn || enablingPush, ({ data }) => {
    if (saveTask.busy || signingInRef.current || enablingPushRef.current) return;
    if (saveTask.saved || !dirty) { navigation.dispatch(data.action); return; }
    if (confirmingDiscard.current) return;
    confirmingDiscard.current = true;
    Keyboard.dismiss();
    Alert.alert('Discard this alert?', 'Your changes have not been saved.', [
      { text: 'Keep editing', style: 'cancel', onPress: () => { confirmingDiscard.current = false; } },
      { text: 'Discard', style: 'destructive', onPress: () => {
        confirmingDiscard.current = false;
        navigation.dispatch(data.action);
      } },
    ], { cancelable: false });
  });

  const save = useCallback(async () => {
    if (!canSave || saveTask.busy || saveTask.saved) return;
    Keyboard.dismiss();
    setSaving(true);
    setError(null);
    try {
      const result = await saveTask.run(async (commit) => {
        // Collected inside the write and acted on after it, so the navigation
        // decision can see whether the gate opened the primer.
        let seedNote: string | null = null;
        const { wrote, primed } = await gate.run(async (token) => {
          // River + Eddy's call is the existing subscription path, and deliberately
          // so: that alert is fanned out from one shared event, and duplicating it
          // as a per-user rule would mean two mechanisms racing on one river.
          if (scope === 'river' && mode === 'condition') {
            if (!riverId) throw new ApiError('This river is missing an id', 400);
            await subscribeToRiver(token, riverId, conditionKind);
            commit();
            successFeedback();
            void refresh().catch(() => {
              setError('Your alert is saved. Pull to refresh the alert list when you are online.');
            });
            return;
          }

          // No parentSubscriptionId. A rule made here stands on its own, by
          // design — the only surface that parents one to a river alert is the
          // section inside that alert's own edit screen. See RiverGaugeAlerts.
          const { rule, seed } = await createGaugeAlert(token, {
            // Same params fallback as `hasStation`, and required by it: enabling
            // Save on the strength of a route param and then sending neither id
            // would answer 404 for a station the user plainly selected. The
            // success path above already prefers the fetched ids the same way.
            gaugeStationId: context?.gaugeStationId ?? params.gaugeId ?? undefined,
            usgsSiteId: context?.usgsSiteId ?? params.siteId ?? undefined,
            riverId: riverId ?? undefined,
            riverSlug: params.riverSlug || undefined,
            scope,
            mode,
            conditionKind: mode === 'condition' ? conditionKind : undefined,
            metric: mode === 'threshold' ? metric : undefined,
            comparator: mode === 'threshold' ? comparator : undefined,
            thresholdValue: mode === 'threshold' ? parsedValue : undefined,
            thresholdValueMax:
              mode === 'threshold' && comparator === 'between' ? parsedMax : undefined,
            oneShot,
          });

          commit();
          successFeedback();
          add(rule);

          // `inside` means the condition is already true. Saying so is the whole
          // reason the server returns the seed.
          seedNote =
            seed?.state === 'inside' && seed.value != null
              ? `${targetName} is already at ${formatAlertValue(seed.value, metric)}. Eddy tells you the next time it crosses your level, not right now.`
              : null;
        });

        // Nothing was written when the gate stopped at the sign-in sheet, and
        // leaving then would drop somebody back on the alerts list having just
        // been asked to sign in.
        return { wrote, seedNote, primed };
      });
      if (result?.wrote) setCompletion({ seedNote: result.seedNote, primed: result.primed });
    } catch (err) {
      if (saveTask.saved) {
        setCompletion({ seedNote: null, primed: false });
        setError('Your alert is saved. The alert list could not refresh. Check it again when you are online.');
        return;
      }
      // The gate has already absorbed 401 and 403 and opened the sign-in
      // sheet for them; what is left is the route's own refusals.
      if (err instanceof ApiError && err.status && err.status >= 400 && err.status < 500) {
        // The route answers 409 and 422 with a sentence written for a person —
        // "You already have this alert", "This gauge does not report discharge".
        // Showing ours instead would be inventing a reason we do not know.
        setError(err.message);
      } else {
        setError('Could not save that alert. Try again.');
      }
    } finally {
      setSaving(false);
    }
  }, [
    gate, scope, mode, riverId, conditionKind, refresh, context, canSave, saveTask,
    params.riverSlug, params.siteId, params.gaugeId,
    metric, comparator, parsedValue, parsedMax, oneShot, add, targetName,
  ]);

  const cancel = { label: 'Cancel', onPress: close, disabled: saving || signingIn || enablingPush };
  if (loading) {
    return <AlertCreationFrame secondary={cancel}>
      <View style={[styles.centered, styles.flex]} accessibilityRole="progressbar" accessibilityLabel="Loading alert options">
        <ActivityIndicator color={colors.interactive} />
      </View>
    </AlertCreationFrame>;
  }

  // A failed river lookup hasn't told us whether a gauge exists. Don't show
  // the no-gauge empty state or an unusable editor on the strength of a failure.
  if (loadFailed && !hasStation) {
    return <AlertCreationFrame secondary={cancel} primary={{ label: 'Try again', onPress: () => {
      setLoading(true);
      setLoadAttempt((attempt) => attempt + 1);
    } }}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={[styles.stepTitle, { color: colors.text }]}>Couldn&apos;t load alert options</Text>
        <Text style={[styles.stepBody, { color: colors.textMuted }]}>Check your connection and try again to set an alert for {targetName}.</Text>
      </ScrollView>
    </AlertCreationFrame>;
  }

  if (completion) {
    const allowPush = async () => {
      if (enablingPushRef.current) return;
      enablingPushRef.current = true;
      setEnablingPush(true);
      setError(null);
      try {
        await gate.enablePush();
        gate.setPrimerOpen(false);
        enablingPushRef.current = false;
        close();
      } catch {
        setError('Your alert is saved. Notifications could not be enabled. Try again, or change them later in Settings.');
      } finally {
        enablingPushRef.current = false;
        setEnablingPush(false);
      }
    };
    return <AlertCreationFrame error={error}
      secondary={{ label: completion.primed ? 'Not right now' : 'Done', onPress: close, disabled: enablingPush }}
      primary={completion.primed ? { label: 'Turn on notifications', onPress: () => void allowPush(), busy: enablingPush } : undefined}
    >
      <Stack.Screen options={{ title: 'Alert saved', headerBackVisible: false, gestureEnabled: false }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={[styles.stepTitle, { color: colors.text }]}>Alert saved</Text>
        <Text style={[styles.stepBody, { color: colors.text }]}>Notify me about {targetName} {preview}.</Text>
        {completion.seedNote ? <Text style={[styles.stepBody, { color: colors.text }]}>{completion.seedNote}</Text> : null}
        {completion.primed ? <>
          <Text style={[styles.stepBody, { color: colors.text }]}>Turn on notifications to hear when this alert triggers. Your alert stays saved if you choose Not right now.</Text>
          <Text style={[styles.stepBody, { color: colors.textMuted }]}>
            Gauge reporting and processing mean alerts can trail the river by roughly 20–75 minutes. Check conditions again before getting on the water.
          </Text>
        </> : null}
      </ScrollView>
    </AlertCreationFrame>;
  }

  if (gate.signInOpen) {
    return <AlertCreationFrame error={error} secondary={{ label: 'Back to alert', onPress: () => gate.setSignInOpen(false), disabled: signingIn }}>
      <Stack.Screen options={{ title: 'Sign in' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" style={[styles.stepTitle, { color: colors.text }]}>Sign in to save your alert</Text>
        <Text style={[styles.stepBody, { color: colors.textMuted }]}>Eddy needs an account to keep your alert for {targetName}. Your choices will stay here while you sign in.</Text>
        {accountsConfigured ? <AppleSignInButton
          onBusyChange={(busy) => { signingInRef.current = busy; setSigningIn(busy); }}
          onSignedIn={() => { gate.setSignInOpen(false); void save(); }}
        /> : <Text style={[styles.stepBody, { color: colors.error }]}>Accounts are unavailable in this build. Go back to keep your alert choices.</Text>}
      </ScrollView>
    </AlertCreationFrame>;
  }

  const chip = (selected: boolean) => [
    styles.chip,
    { borderColor: colors.border },
    selected && { backgroundColor: colors.selectionBg, borderColor: colors.interactive },
  ];
  const chipText = (selected: boolean) => [
    styles.chipText,
    { color: selected ? colors.selectionText : colors.textMuted },
  ];

  return (
    <AlertCreationFrame error={error} secondary={cancel}
      primary={{ label: saving ? 'Saving…' : 'Save', onPress: () => void save(), disabled: !canSave, busy: saving }}>
      <Stack.Screen options={{ title: 'New alert', gestureEnabled: true }} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        pointerEvents={saving ? 'none' : 'auto'}
        accessibilityElementsHidden={saving}
        importantForAccessibility={saving ? 'no-hide-descendants' : 'auto'}
      >
        <Text accessibilityRole="header" style={[styles.stepTitle, { color: colors.text }]}>{targetName}</Text>
        {/* The reading, first. Every number below this is a decision about it. */}
        <View style={[styles.card, { backgroundColor: colors.card }, elevation(1)]}>
          <Text style={[styles.cardLabel, { color: colors.textSubtle }]}>Right now</Text>
          <Text style={[styles.reading, { color: colors.text }]}>
            {currentValue != null
              ? formatAlertValue(currentValue, metric)
              : 'No current reading'}
          </Text>
          {context?.gaugeName ? (
            <Text style={[styles.cardMeta, { color: colors.textMuted }]} numberOfLines={2}>
              {context.gaugeName}
            </Text>
          ) : null}
          {/* The age, in the same words the gauge screen uses. "Right now" over
              an unlabelled number invites a threshold set one step above a
              reading that has already moved — which is precisely how a rule
              gets created already on the far side of its own level. */}
          {currentValue != null && readingAge(context?.readingAgeHours) ? (
            <Text style={[styles.cardMeta, { color: colors.textSubtle }]}>
              {readingAge(context?.readingAgeHours)}
            </Text>
          ) : null}
          {context && !context.curated ? (
            <Text style={[styles.cardMeta, { color: colors.textSubtle }]}>
              {GAUGE_ALERT_LATENCY_NOTE}
            </Text>
          ) : null}
        </View>

        {/* ── Mode ─────────────────────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: colors.textSubtle }]}>Tell me</Text>
        <View style={styles.chipRow}>
          <Pressable
            onPress={() => setMode('condition')}
            disabled={!canUseCondition}
            style={[
              ...chip(mode === 'condition'),
              styles.brandChip,
              !canUseCondition && styles.disabled,
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: mode === 'condition', disabled: !canUseCondition }}
          >
            {/* The mark, not an icon. This option means "defer to Eddy's
                judgement", and the otter is what that judgement looks like
                everywhere else in the app — the same face the river screens
                put beside a condition. Decorative by construction: Otter is
                accessibilityElementsHidden, and the label already says it. */}
            <Otter mood="favicon" size={18} style={styles.brandMark} />
            <Text style={chipText(mode === 'condition')}>Eddy&apos;s call</Text>
          </Pressable>
          <Pressable
            onPress={() => setMode('threshold')}
            style={chip(mode === 'threshold')}
            accessibilityRole="button"
            accessibilityState={{ selected: mode === 'threshold' }}
          >
            <Text style={chipText(mode === 'threshold')}>My own level</Text>
          </Pressable>
        </View>
        {/* Three mutually exclusive sentences, and which one shows is the
            whole of the fix. The rating hint is a claim about a ladder we only
            know from the request that failed, so it must not stand in for the
            failure — and "no gauge on this river" must not stand in for
            either. */}
        {loadFailed && hasStation ? (
          <Text style={[styles.hint, { color: colors.textSubtle }]}>
            Couldn&apos;t load the current reading, so there&apos;s no verdict to watch and no
            number to start you off. You can still set your own level, and Eddy checks it
            against the gauge when you save.
          </Text>
        ) : !loadFailed && !canUseCondition && hasStation ? (
          <Text style={[styles.hint, { color: colors.textSubtle }]}>
            Eddy doesn&apos;t rate this gauge for a river, so there&apos;s no floatable verdict to
            watch — set your own level instead.
          </Text>
        ) : null}
        {!hasStation ? (
          // Said once, plainly, instead of letting the form look usable and
          // fail on save.
          <Text style={[styles.hint, { color: colors.textSubtle }]}>
            There&apos;s no gauge on this river yet, so there&apos;s nothing to measure an alert
            against. Try setting one on a nearby gauge instead.
          </Text>
        ) : null}

        {/* ── Condition mode ───────────────────────────────────────────── */}
        {mode === 'condition' ? (
          <View style={styles.group}>
            {CONDITION_KINDS.map((kind) => (
              <Pressable
                key={kind.value}
                onPress={() => setConditionKind(kind.value)}
                style={({ pressed }) => [
                  styles.optionRow,
                  { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
                  elevation(1),
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected: conditionKind === kind.value }}
              >
                <View style={styles.optionBody}>
                  <Text style={[styles.optionTitle, { color: colors.text }]}>{kind.label}</Text>
                  <Text style={[styles.optionHint, { color: colors.textMuted }]}>{kind.hint}</Text>
                  {/* The conditions this option will actually push about, in
                      their own colours — "only high and dangerous water" is a
                      sentence you have to translate; a red Flood chip is not. */}
                  <ConditionCodeChips codes={codesForKind(kind.value)} />
                </View>
                <Ionicons
                  name={conditionKind === kind.value ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={conditionKind === kind.value ? colors.interactive : colors.textSubtle}
                />
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={styles.group}>
            {/* ── Unit ─────────────────────────────────────────────────── */}
            {hasHeight && hasDischarge ? (
              <>
                <Text style={[styles.sectionLabel, { color: colors.textSubtle }]}>Measured in</Text>
                <View style={styles.chipRow}>
                  <Pressable accessibilityRole="button" accessibilityState={{ selected: metric === 'gauge_height_ft' }} onPress={() => setMetric('gauge_height_ft')} style={chip(metric === 'gauge_height_ft')}>
                    <Text style={chipText(metric === 'gauge_height_ft')}>Feet</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityState={{ selected: metric === 'discharge_cfs' }} onPress={() => setMetric('discharge_cfs')} style={chip(metric === 'discharge_cfs')}>
                    <Text style={chipText(metric === 'discharge_cfs')}>CFS</Text>
                  </Pressable>
                </View>
              </>
            ) : null}

            {/* ── Comparator ───────────────────────────────────────────── */}
            <Text style={[styles.sectionLabel, { color: colors.textSubtle }]}>When it</Text>
            <View style={styles.chipRow}>
              {COMPARATORS.map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() => setComparator(option.value)}
                  style={chip(comparator === option.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: comparator === option.value }}
                >
                  <Text style={chipText(comparator === option.value)}>{option.label}</Text>
                </Pressable>
              ))}
            </View>

            {/* ── Value ────────────────────────────────────────────────── */}
            <View style={[styles.valueRow, fontScale > 1.3 && styles.valueColumn]}>
              <TextInput
                value={value}
                onChangeText={setValue}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.textSubtle}
                style={[
                  styles.valueInput, fontScale > 1.3 && styles.valueInputWide,
                  { backgroundColor: colors.card, borderColor: colors.border, color: colors.text },
                ]}
                accessibilityLabel={`${comparator === 'between' ? 'Lower level' : 'Level'}, ${metric === 'discharge_cfs' ? 'cubic feet per second' : 'feet'}`}
              />
              {comparator === 'between' ? (
                <>
                  <Text style={[styles.andText, { color: colors.textMuted }]}>and</Text>
                  <TextInput
                    value={valueMax}
                    onChangeText={setValueMax}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={colors.textSubtle}
                    style={[
                      styles.valueInput, fontScale > 1.3 && styles.valueInputWide,
                      { backgroundColor: colors.card, borderColor: colors.border, color: colors.text },
                    ]}
                    accessibilityLabel={`Upper level, ${metric === 'discharge_cfs' ? 'cubic feet per second' : 'feet'}`}
                  />
                </>
              ) : null}
              <Text style={[styles.unitText, { color: colors.textMuted }]}>
                {metric === 'discharge_cfs' ? 'cfs' : 'ft'}
              </Text>
            </View>
            {!maxValid ? (
              <Text style={[styles.hint, { color: colors.error }]}>
                The upper level has to be higher than the lower one.
              </Text>
            ) : null}
          </View>
        )}

        {/* ── Repeat ───────────────────────────────────────────────────── */}
        {usesOneShot ? <View style={[styles.optionRow, { backgroundColor: colors.card }, elevation(1)]}>
          <View style={styles.optionBody}>
            <Text style={[styles.optionTitle, { color: colors.text }]}>Just once</Text>
            <Text style={[styles.optionHint, { color: colors.textMuted }]}>
              {oneShot
                ? 'Eddy tells you the first time, then switches this alert off.'
                : 'Eddy tells you every time it happens.'}
            </Text>
          </View>
          <Switch
            value={oneShot}
            accessibilityLabel="Just once"
            accessibilityHint="Turn this alert off after its first notification"
            onValueChange={setOneShot}
            trackColor={{ true: colors.interactive, false: colors.border }}
          />
        </View> : null}

        {/* The rule, in one sentence, before they commit to it. */}
        <View style={[styles.preview, { borderColor: colors.border }]}>
          <Text style={[styles.previewText, { color: colors.textMuted }]}>
            Notify me about{' '}
            <Text style={{ color: colors.text, fontFamily: fonts.semibold }}>{targetName}</Text>{' '}
            {preview}.
          </Text>
        </View>

      </ScrollView>
    </AlertCreationFrame>
  );
}

const styles = StyleSheet.create({
  stepTitle: { ...t.xl, fontWeight: '600', marginBottom: 16 },
  stepBody: { ...t.base, marginBottom: 24 },
  flex: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 24 },
  card: { padding: 16, borderRadius: 14, marginBottom: 8 },
  cardLabel: {
    ...t.xs,
    fontFamily: fonts.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  reading: { ...t['2xl'], fontFamily: fonts.display, marginTop: 4 },
  cardMeta: { ...t.xs, fontFamily: fonts.body, marginTop: 6 },
  sectionLabel: {
    ...t.xs,
    fontFamily: fonts.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 18,
    marginBottom: 8,
    marginHorizontal: 4,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  chipText: { ...t.xs, fontFamily: fonts.semibold },
  brandChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 10 },
  // Otter centres itself by default, which fights a row layout.
  brandMark: { alignSelf: 'center' },
  disabled: { opacity: 0.4 },
  group: { marginTop: 4 },
  hint: { ...t.xs, fontFamily: fonts.body, marginTop: 8, marginHorizontal: 4 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    marginTop: 8,
  },
  optionBody: { flex: 1 },
  optionTitle: { ...t.base, fontFamily: fonts.semibold },
  optionHint: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  valueColumn: { flexDirection: 'column', alignItems: 'stretch' },
  valueInputWide: { flex: 0 },
  valueInput: {
    minHeight: 44,
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...t.lg,
    fontFamily: fonts.mono,
  },
  andText: { ...t.sm, fontFamily: fonts.body },
  unitText: { ...t.base, fontFamily: fonts.semibold },
  preview: { marginTop: 22, padding: 14, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed' },
  previewText: { ...t.sm, fontFamily: fonts.body, lineHeight: 20 },

});
