// eddy-ios/app/alerts/[id].tsx
// Edit one existing alert.
//
// Reads the rule out of useAlertRules rather than fetching it. The list is
// already loaded — this screen is only ever reached by tapping a row in it —
// and a second request would put a spinner in front of data the app is holding.
// A rule that is genuinely gone (deleted on another device) falls through to the
// not-found state rather than hanging.
//
// Deliberately NOT the create form with values prefilled. Creating asks "what do
// you want to watch", which is settled here and cannot be changed: moving an
// alert from one river to another is two operations, not an edit. What is left
// is the trigger, and that fits on one screen with delete at the bottom.

import { useCallback, useEffect, useMemo, useState } from 'react';
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
  type AlertComparator,
  type AlertRuleSeed,
  type AlertSubscriptionKind,
} from '@eddy/types';
import { ConditionCodeChips } from '@/components/ConditionCodeChips';
import { CONDITION_KINDS, codesForKind } from '@/lib/alertKinds';
import { useAlertRules } from '@/hooks/useAlertRules';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

const COMPARATORS: { value: AlertComparator; label: string }[] = [
  { value: 'above', label: 'Rises above' },
  { value: 'below', label: 'Drops below' },
  { value: 'between', label: 'Is between' },
];

export default function EditAlertScreen() {
  const { id, source } = useLocalSearchParams<{ id?: string; source?: string }>();
  const router = useRouter();
  const { colors, elevation } = useTheme();
  const { rules, ready, update, remove, setEnabled: setRuleEnabled } = useAlertRules();

  const rule = useMemo(
    () => (rules ?? []).find((r) => r.id === id && (!source || r.source === source)) ?? null,
    [rules, id, source],
  );

  // Placeholder only. Once the requested rule resolves, its stored kind wins.
  const [conditionKind, setConditionKind] = useState<AlertSubscriptionKind>('safety');
  const [comparator, setComparator] = useState<AlertComparator>('above');
  const [value, setValue] = useState('');
  const [valueMax, setValueMax] = useState('');
  const [oneShot, setOneShot] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Separate from `error`: the Active switch saves on its own, so it fails on
   *  its own too, and a pause that did not stick must not look like a failed
   *  Save of the trigger the user never touched. */
  const [enabledError, setEnabledError] = useState<string | null>(null);
  /**
   * What the server re-seeded this rule to on the last save.
   *
   * `inside` means the water is ALREADY past the number just typed. The rule is
   * edge-triggered, so it will not fire until the river leaves and comes back —
   * and with nothing on screen saying so, that is indistinguishable from an
   * alert that simply does not work. Setting a level one step above a reading
   * the gauge screen was showing an hour late is the exact way to land here.
   */
  const [seed, setSeed] = useState<AlertRuleSeed | null>(null);

  // Seeded from the rule once it resolves. Keyed on rule.id so a different rule
  // reloads the form, but typing is never overwritten by an unrelated refresh.
  useEffect(() => {
    if (!rule) return;
    setConditionKind(rule.conditionKind ?? 'all');
    setComparator(rule.comparator ?? 'above');
    setValue(rule.thresholdValue != null ? String(rule.thresholdValue) : '');
    setValueMax(rule.thresholdValueMax != null ? String(rule.thresholdValueMax) : '');
    setOneShot(rule.oneShot);
    // `enabled` is deliberately NOT seeded into local state — see the Active
    // row below. It is the one control here that is not part of the trigger
    // being drafted, so it writes through immediately instead of waiting on
    // Save, and therefore renders straight from the rule.
  }, [rule?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const parsedValue = Number(value);
  const parsedMax = Number(valueMax);
  const isThreshold = rule?.mode === 'threshold';
  const valueValid = !isThreshold || (Number.isFinite(parsedValue) && value.trim() !== '');
  const maxValid = !isThreshold || comparator !== 'between' || (Number.isFinite(parsedMax) && parsedMax > parsedValue);
  const spent = Boolean(rule?.oneShot && rule.firedAt);

  const onSave = useCallback(async () => {
    if (!rule) return;
    setError(null);
    setSaving(true);
    try {
      const result = await update(rule, {
        // No `enabled` here: the Active switch already persisted itself. Sending
        // it again would also override the server's rearm default below, which
        // is what turns a spent one-shot back on.
        oneShot,
        ...(rule.mode === 'condition' ? { conditionKind } : {}),
        ...(isThreshold
          ? {
              comparator,
              thresholdValue: parsedValue,
              ...(comparator === 'between' ? { thresholdValueMax: parsedMax } : {}),
            }
          : {}),
        // Saving a spent one-shot re-arms it. Anything else would leave the
        // user editing a rule that cannot fire, with no visible way to revive
        // it — the edit IS the request to have it work again.
        ...(spent ? { rearm: true } : {}),
      });

      // STAY ON THE SCREEN when the rule saved into a state it cannot fire
      // from. Popping back would hide the one explanation of why nothing is
      // going to happen, and the fix — a different number — is on this screen.
      if (result?.state === 'inside') {
        setSeed(result);
        return;
      }
      router.back();
    } catch {
      setError('Could not save that change. Try again.');
    } finally {
      setSaving(false);
    }
  }, [rule, update, oneShot, conditionKind, isThreshold, comparator, parsedValue, parsedMax, spent, router]);

  /**
   * Active writes through on tap, matching the identical switch in the manage
   * list.
   *
   * It used to be local state that only persisted on Save, so the same control
   * in two places meant two different things and flipping it here then backing
   * out silently discarded the change. Everything else on this screen is a
   * DRAFT of the trigger — pausing is not a draft, it is an instruction.
   */
  const onToggleActive = useCallback(
    (next: boolean) => {
      if (!rule) return;
      setEnabledError(null);
      void setRuleEnabled(rule, next).catch(() =>
        setEnabledError(next ? 'Could not resume that alert.' : 'Could not pause that alert.'),
      );
    },
    [rule, setRuleEnabled],
  );

  /**
   * Editing the trigger clears the last verdict — the user is answering it.
   *
   * Done in the change handlers rather than an effect on [comparator, value]:
   * the effect form calls setState during render-commit for a value the same
   * interaction already set, which is the cascading-render pattern React now
   * flags, and it would also wipe the notice on the re-render that shows it.
   */
  const editTrigger = useCallback(<T,>(set: (next: T) => void) => (next: T) => {
    setSeed(null);
    set(next);
  }, []);

  const onDelete = useCallback(() => {
    if (!rule) return;
    Alert.alert('Delete this alert?', 'You will stop getting notifications for it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void remove(rule)
            .then(() => router.back())
            .catch(() => setError('Could not delete that alert. Try again.'));
        },
      },
    ]);
  }, [rule, remove, router]);

  if (!ready) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered, { backgroundColor: colors.bg }]} edges={['top']}>
        <ActivityIndicator color={colors.interactive} />
      </SafeAreaView>
    );
  }

  if (!rule) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.navRow}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </Pressable>
        </View>
        <View style={[styles.centered, styles.flex]}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Alert not found</Text>
          <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
            It may have been deleted on another device.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const targetName = rule.riverName ?? rule.gaugeName ?? 'this water';
  const canSave = valueValid && maxValid;

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
        <Text style={[styles.current, { color: colors.textMuted }]}>
          Currently: {describeAlertRule(rule)}.
        </Text>

        {spent ? (
          <View style={[styles.notice, { borderColor: colors.border }]}>
            <Text style={[styles.noticeText, { color: colors.textMuted }]}>
              This one-time alert has already been sent. Saving will set it again.
            </Text>
          </View>
        ) : null}

        <Pressable
          onPress={() => onToggleActive(!rule.enabled)}
          style={({ pressed }) => [
            styles.optionRow,
            { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
            elevation(1),
          ]}
        >
          <View style={styles.optionBody}>
            <Text style={[styles.optionTitle, { color: colors.text }]}>Active</Text>
            <Text style={[styles.optionHint, { color: colors.textMuted }]}>
              {rule.enabled
                ? 'Watching for changes.'
                : spent
                  ? 'Already sent — switch on to watch again.'
                  : 'Paused — nothing will be sent.'}
            </Text>
          </View>
          <Switch
            value={rule.enabled}
            onValueChange={onToggleActive}
            trackColor={{ true: colors.interactive, false: colors.border }}
          />
        </Pressable>
        {enabledError ? (
          <Text style={[styles.errorText, { color: colors.error }]}>{enabledError}</Text>
        ) : null}

        {rule.mode === 'condition' ? (
          <>
            <Text style={[styles.sectionLabel, { color: colors.textSubtle }]}>Tell me about</Text>
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
                  <ConditionCodeChips codes={codesForKind(kind.value)} />
                </View>
                <Ionicons
                  name={conditionKind === kind.value ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={conditionKind === kind.value ? colors.interactive : colors.textSubtle}
                />
              </Pressable>
            ))}
          </>
        ) : (
          <>
            <Text style={[styles.sectionLabel, { color: colors.textSubtle }]}>When it</Text>
            <View style={styles.chipRow}>
              {COMPARATORS.map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() => editTrigger(setComparator)(option.value)}
                  style={chip(comparator === option.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: comparator === option.value }}
                >
                  <Text style={chipText(comparator === option.value)}>{option.label}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.valueRow}>
              <TextInput
                value={value}
                onChangeText={editTrigger(setValue)}
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
                    onChangeText={editTrigger(setValueMax)}
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
                {rule.metric === 'discharge_cfs' ? 'cfs' : 'ft'}
              </Text>
            </View>
            {!maxValid ? (
              <Text style={[styles.hint, { color: colors.error }]}>
                The upper level has to be higher than the lower one.
              </Text>
            ) : null}
            <Text style={[styles.hint, { color: colors.textSubtle }]}>
              {/* Changing the number resets which side of it the river counts
                  as being on, or an alert moved up past the current reading
                  could never fire again. */}
              Changing the level starts the alert fresh from the latest reading.
            </Text>
            {seed?.state === 'inside' ? (
              <View style={[styles.seedNotice, { backgroundColor: colors.card }, elevation(1)]}>
                <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
                <Text style={[styles.seedText, { color: colors.text }]}>
                  {seed.value != null
                    ? `${targetName} is already at ${formatAlertValue(seed.value, rule.metric ?? 'gauge_height_ft')}, which is inside this alert. Saved — but it stays quiet until the water leaves that range and comes back.`
                    : `${targetName} is already inside this alert. Saved — but it stays quiet until the water leaves that range and comes back.`}
                </Text>
              </View>
            ) : null}
          </>
        )}

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
            trackColor={{ true: colors.interactive, false: colors.border }}
          />
        </Pressable>

        {error ? <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text> : null}

        <Pressable
          onPress={() => void onSave()}
          disabled={!canSave || saving}
          style={({ pressed }) => [
            styles.saveButton,
            {
              backgroundColor: canSave ? colors.accentFill : colors.cardRaised,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
          accessibilityRole="button"
        >
          {saving ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={[styles.saveText, { color: canSave ? colors.onAccent : colors.textSubtle }]}>
              Save changes
            </Text>
          )}
        </Pressable>

        <Pressable
          onPress={onDelete}
          style={({ pressed }) => [styles.deleteButton, { opacity: pressed ? 0.6 : 1 }]}
          accessibilityRole="button"
        >
          <Text style={[styles.deleteText, { color: colors.error }]}>Delete alert</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
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
  current: { ...t.sm, fontFamily: fonts.body, marginBottom: 14, marginHorizontal: 4 },
  notice: { padding: 12, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', marginBottom: 12 },
  noticeText: { ...t.xs, fontFamily: fonts.body },
  sectionLabel: {
    ...t.xs,
    fontFamily: fonts.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 18,
    marginBottom: 4,
    marginHorizontal: 4,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  chipText: { ...t.xs, fontFamily: fonts.semibold },
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
  hint: { ...t.xs, fontFamily: fonts.body, marginTop: 8, marginHorizontal: 4 },
  seedNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    marginTop: 12,
    borderRadius: 14,
    padding: 13,
  },
  seedText: { ...t.xs, fontFamily: fonts.body, flex: 1, lineHeight: 17 },
  errorText: { ...t.sm, fontFamily: fonts.body, marginTop: 12 },
  saveButton: { marginTop: 24, paddingVertical: 15, borderRadius: 999, alignItems: 'center' },
  saveText: { ...t.base, fontFamily: fonts.semibold },
  deleteButton: { marginTop: 16, paddingVertical: 12, alignItems: 'center' },
  deleteText: { ...t.sm, fontFamily: fonts.semibold },
  emptyTitle: { ...t.lg, fontFamily: fonts.semibold },
  emptyBody: { ...t.sm, fontFamily: fonts.body, textAlign: 'center', marginTop: 6 },
});
