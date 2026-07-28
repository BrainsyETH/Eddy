// eddy-ios/app/alerts/configure.tsx
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
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  describeAlertRule,
  formatAlertValue,
  GAUGE_ALERT_LATENCY_NOTE,
  type AlertComparator,
  type AlertMetric,
  type AlertRuleMode,
  type AlertSubscriptionKind,
} from '@eddy/types';
import { ApiError, createGaugeAlert, fetchCondition, fetchGaugeDetail, subscribeToRiver } from '@/api/client';
import { AlertSignInSheet } from '@/components/AlertSignInSheet';
import { ConditionCodeChips } from '@/components/ConditionCodeChips';
import { Otter } from '@/components/Otter';
import { PushPrimer } from '@/components/PushPrimer';
import { CONDITION_KINDS, codesForKind } from '@/lib/alertKinds';
import { useAlertRules } from '@/hooks/useAlertRules';
import { usePush } from '@/hooks/usePush';
import { useSession } from '@/hooks/useSession';
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

  const router = useRouter();
  const { colors, elevation } = useTheme();
  const { getAccessToken } = useSession();
  const { add, refresh } = useAlertRules();
  const { permission, enable } = usePush();

  const [context, setContext] = useState<Context | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signInOpen, setSignInOpen] = useState(false);
  const [primerOpen, setPrimerOpen] = useState(false);

  const [mode, setMode] = useState<AlertRuleMode>('condition');
  const [conditionKind, setConditionKind] = useState<AlertSubscriptionKind>('all');
  const [metric, setMetric] = useState<AlertMetric>('gauge_height_ft');
  const [comparator, setComparator] = useState<AlertComparator>('above');
  const [value, setValue] = useState('');
  const [valueMax, setValueMax] = useState('');
  const [oneShot, setOneShot] = useState(false);

  const targetName = riverName ?? params.gaugeName ?? 'this water';

  // ── Load the live reading and whatever ladder applies ────────────────────
  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
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
            rated: Boolean(link),
            ladderUnit: link?.thresholdUnit ?? null,
            curated: gauge?.curated ?? false,
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
          });
        }
      } catch {
        // A gauge we cannot read is still one you can set a level on — the
        // server re-checks everything on save. Losing the current reading costs
        // the helpful default, not the feature.
        if (!controller.signal.aborted) setContext(null);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [scope, params.siteId, params.gaugeId, params.gaugeName, riverId]);

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
    if (!context) return;
    // Eddy's call when Eddy has one, because it is the answer that cannot
    // disagree with the rest of the app.
    setMode(canUseCondition ? 'condition' : 'threshold');
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
  }, [context, canUseCondition]);

  const currentValue = metric === 'discharge_cfs' ? context?.dischargeCfs ?? null : context?.gaugeHeightFt ?? null;

  /** The reading, formatted the way that unit is reported. */
  const anchorFor = useCallback(
    (value: number | null, forMetric: AlertMetric) =>
      value == null ? '' : forMetric === 'discharge_cfs' ? String(Math.round(value)) : value.toFixed(2),
    [],
  );

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
    setValue(anchorFor(currentValue, metric));
    // The upper bound is cleared rather than re-anchored: both ends of a range
    // cannot be the one current reading, and a max left over from the other
    // unit is the same bug one field along.
    setValueMax('');
  }, [context, metric, currentValue, anchorFor]);

  const parsedValue = Number(value);
  const parsedMax = Number(valueMax);
  const valueValid = Number.isFinite(parsedValue) && value.trim() !== '';
  const maxValid = comparator !== 'between' || (Number.isFinite(parsedMax) && parsedMax > parsedValue);

  // A level needs a station to measure it at, and a river with no gauge wired
  // has none. Without this the screen happily takes a number and the save
  // answers 404 "Gauge not found" — a true statement about a request the user
  // never knowingly made.
  const hasStation = Boolean(context?.usgsSiteId || context?.gaugeStationId);
  const canSave =
    mode === 'condition' ? canUseCondition : hasStation && valueValid && maxValid;

  /** The sentence under the controls — the same one the row and push will use. */
  const preview = useMemo(
    () =>
      describeAlertRule({
        id: '',
        source: 'gauge',
        scope,
        mode,
        riverId,
        riverName,
        riverSlug: params.riverSlug || null,
        gaugeId: null,
        gaugeName: context?.gaugeName ?? null,
        usgsSiteId: null,
        curated: context?.curated ?? false,
        conditionKind,
        metric,
        comparator,
        thresholdValue: valueValid ? parsedValue : null,
        thresholdValueMax: comparator === 'between' && Number.isFinite(parsedMax) ? parsedMax : null,
        enabled: true,
        oneShot,
        firedAt: null,
        lastTriggeredAt: null,
        createdAt: '',
      }),
    [
      scope, mode, riverId, riverName, params.riverSlug, context, conditionKind,
      metric, comparator, valueValid, parsedValue, parsedMax, oneShot,
    ],
  );

  const finish = useCallback(
    (seedNote: string | null) => {
      const goBack = () => {
        // The one-shot iOS prompt is worth spending only now: a notification is
        // genuinely waiting to be delivered, which is the strongest case this
        // app will ever have. Asking earlier burns it on a hypothetical.
        if (permission === 'undetermined') setPrimerOpen(true);
        else router.back();
      };

      if (seedNote) Alert.alert('Alert saved', seedNote, [{ text: 'OK', onPress: goBack }]);
      else goBack();
    },
    [permission, router],
  );

  const save = useCallback(async () => {
    setError(null);
    setSaving(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        setSignInOpen(true);
        return;
      }

      // River + Eddy's call is the existing subscription path, and deliberately
      // so: that alert is fanned out from one shared event, and duplicating it
      // as a per-user rule would mean two mechanisms racing on one river.
      if (scope === 'river' && mode === 'condition') {
        if (!riverId) throw new ApiError('This river is missing an id', 400);
        await subscribeToRiver(token, riverId, conditionKind);
        await refresh();
        finish(null);
        return;
      }

      const { rule, seed } = await createGaugeAlert(token, {
        gaugeStationId: context?.gaugeStationId ?? undefined,
        usgsSiteId: context?.usgsSiteId ?? undefined,
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

      add(rule);

      // `inside` means the condition is already true. Saying so is the whole
      // reason the server returns the seed.
      const note =
        seed?.state === 'inside' && seed.value != null
          ? `${targetName} is already at ${formatAlertValue(seed.value, metric)}. We'll tell you the next time it crosses your level, not right now.`
          : null;
      finish(note);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setSignInOpen(true);
      } else if (err instanceof ApiError && err.status && err.status >= 400 && err.status < 500) {
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
    getAccessToken, scope, mode, riverId, conditionKind, refresh, finish, context,
    params.riverSlug, metric, comparator, parsedValue, parsedMax, oneShot, add, targetName,
  ]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered, { backgroundColor: colors.bg }]} edges={['top']}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  const chip = (selected: boolean) => [
    styles.chip,
    { borderColor: colors.border },
    selected && { backgroundColor: colors.accent, borderColor: colors.accent },
  ];
  const chipText = (selected: boolean) => [
    styles.chipText,
    { color: selected ? colors.onAccent : colors.textMuted },
  ];

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.navRow}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={[styles.navTitle, { color: colors.text }]} numberOfLines={1}>
          {targetName}
        </Text>
        <View style={styles.navSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
        {!canUseCondition && hasStation ? (
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
                  color={conditionKind === kind.value ? colors.accent : colors.textSubtle}
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
                  <Pressable onPress={() => setMetric('gauge_height_ft')} style={chip(metric === 'gauge_height_ft')}>
                    <Text style={chipText(metric === 'gauge_height_ft')}>Feet</Text>
                  </Pressable>
                  <Pressable onPress={() => setMetric('discharge_cfs')} style={chip(metric === 'discharge_cfs')}>
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
            <View style={styles.valueRow}>
              <TextInput
                value={value}
                onChangeText={setValue}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.textSubtle}
                style={[
                  styles.valueInput,
                  { backgroundColor: colors.card, borderColor: colors.border, color: colors.text },
                ]}
                accessibilityLabel={comparator === 'between' ? 'Lower level' : 'Level'}
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
                      styles.valueInput,
                      { backgroundColor: colors.card, borderColor: colors.border, color: colors.text },
                    ]}
                    accessibilityLabel="Upper level"
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
        <Pressable
          onPress={() => setOneShot((v) => !v)}
          style={({ pressed }) => [
            styles.optionRow,
            { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
            elevation(1),
          ]}
        >
          <View style={styles.optionBody}>
            <Text style={[styles.optionTitle, { color: colors.text }]}>Just once</Text>
            <Text style={[styles.optionHint, { color: colors.textMuted }]}>
              {oneShot
                ? 'We’ll tell you the first time, then switch this alert off.'
                : 'Keep telling me every time it happens.'}
            </Text>
          </View>
          <Switch
            value={oneShot}
            onValueChange={setOneShot}
            trackColor={{ true: colors.accent, false: colors.border }}
          />
        </Pressable>

        {/* The rule, in one sentence, before they commit to it. */}
        <View style={[styles.preview, { borderColor: colors.border }]}>
          <Text style={[styles.previewText, { color: colors.textMuted }]}>
            Notify me about{' '}
            <Text style={{ color: colors.text, fontFamily: fonts.semibold }}>{targetName}</Text>{' '}
            {preview}.
          </Text>
        </View>

        {error ? <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text> : null}

        <Pressable
          onPress={() => void save()}
          disabled={!canSave || saving}
          style={({ pressed }) => [
            styles.saveButton,
            {
              backgroundColor: canSave ? colors.accent : colors.cardRaised,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
          accessibilityRole="button"
        >
          {saving ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text
              style={[styles.saveText, { color: canSave ? colors.onAccent : colors.textSubtle }]}
            >
              Set alert
            </Text>
          )}
        </Pressable>
      </ScrollView>

      <AlertSignInSheet
        visible={signInOpen}
        riverName={targetName}
        onSignedIn={() => {
          setSignInOpen(false);
          void save();
        }}
        onDismiss={() => setSignInOpen(false)}
      />
      <PushPrimer
        visible={primerOpen}
        riverName={targetName}
        onAllow={() => {
          setPrimerOpen(false);
          void enable();
          router.back();
        }}
        onDismiss={() => {
          setPrimerOpen(false);
          // The alert is saved either way — declining the prompt is a choice
          // about this phone, not a reason to lose the rule.
          router.back();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  navTitle: { ...t.base, fontFamily: fonts.semibold, flex: 1, textAlign: 'center' },
  navSpacer: { width: 26 },
  content: { paddingHorizontal: 16, paddingBottom: 48 },
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
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
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
  valueInput: {
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
  errorText: { ...t.sm, fontFamily: fonts.body, marginTop: 12 },
  saveButton: { marginTop: 20, paddingVertical: 15, borderRadius: 999, alignItems: 'center' },
  saveText: { ...t.base, fontFamily: fonts.semibold },
});
