// eddy-ios/src/float/start/RouteCard.tsx
// Ready to float's route selector: the river heads the card, and the put-in and
// take-out read as one connected stretch with the leg between them. Until a
// river is chosen the card is a single prompt, because neither endpoint can be
// chosen without one.

import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { ControlIcon } from '@/components/ControlIcon';
import { radii } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

export interface RouteStop {
  /** null shows the field's call to action. */
  value: string | null;
  detail?: string;
  photo?: React.ReactNode;
  status?: { label: string; ready: boolean; busy: boolean };
}

export function RouteCard({ river, from, to, leg, disabled, onRiver, onFrom, onTo }: {
  /** null before a river is chosen; 'loading' while the chosen river loads. */
  river: string | 'loading' | null;
  from: RouteStop;
  to: RouteStop;
  leg: string | null;
  disabled: boolean;
  onRiver: () => void;
  onFrom: () => void;
  onTo: () => void;
}) {
  const { colors, elevation } = useTheme();
  if (river === null) return (
    <Pressable onPress={onRiver} disabled={disabled} accessibilityRole="button"
      accessibilityLabel="Choose a river" accessibilityHint="Then choose your put-in and take-out"
      style={({ pressed }) => [local.card, local.prompt, { backgroundColor: colors.card, opacity: pressed || disabled ? 0.6 : 1 }, elevation(1)]}>
      <View style={[local.promptIcon, { backgroundColor: colors.cardRaised }]}>
        <ControlIcon name="search-outline" size={22} color={colors.interactive} />
      </View>
      <View style={local.grow}>
        <Text style={[local.promptTitle, { color: colors.text }]}>Where are you floating?</Text>
        <Text style={[t.sm, { color: colors.textMuted }]}>Choose a river, then your put-in and take-out.</Text>
      </View>
    </Pressable>
  );
  return (
    <View style={[local.card, { backgroundColor: colors.card }, elevation(1)]}>
      <Pressable onPress={onRiver} disabled={disabled} accessibilityRole="button"
        accessibilityLabel={river === 'loading' ? 'River, loading' : `River, ${river}`} accessibilityHint="Change river"
        style={({ pressed }) => [local.river, { opacity: pressed || disabled ? 0.6 : 1 }]}>
        <ControlIcon name="water-outline" size={22} color={colors.interactive} />
        {river === 'loading'
          ? <Text style={[local.riverName, { color: colors.textMuted }]}>Loading river…</Text>
          : <Text style={[local.riverName, { color: colors.text }]} numberOfLines={1}>{river}</Text>}
        <Text style={[t.sm, local.change, { color: colors.interactive }]}>Change</Text>
      </Pressable>
      <View style={[local.divider, { backgroundColor: colors.border }]} />
      <View style={local.stops}>
        <Stop kind="start" label="Put-in" stop={from} disabled={disabled} onPress={onFrom} />
        <View style={local.leg}>
          <View style={local.rail}><View style={[local.line, { backgroundColor: colors.border }]} /></View>
          {leg ? <Text style={[t.sm, local.legText, { color: colors.textMuted }]}>{leg}</Text> : null}
        </View>
        <Stop kind="end" label="Take-out" stop={to} disabled={disabled} onPress={onTo} />
      </View>
    </View>
  );
}

function Stop({ kind, label, stop, disabled, onPress }: {
  kind: 'start' | 'end'; label: string; stop: RouteStop; disabled: boolean; onPress: () => void;
}) {
  const { colors } = useTheme();
  const line = <View style={[local.line, { backgroundColor: colors.border }]} />;
  const gap = <View style={local.grow} />;
  const value = stop.value ?? `Choose a ${label.toLocaleLowerCase()}`;
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
      accessibilityLabel={[label, value, stop.detail, stop.status?.label].filter(Boolean).join(', ')}
      accessibilityState={{ disabled, busy: stop.status?.busy }}
      style={({ pressed }) => [local.stop, { opacity: pressed || disabled ? 0.6 : 1 }]}>
      <View style={local.rail}>
        {kind === 'start' ? gap : line}
        {kind === 'start'
          ? <View style={[local.dot, { borderColor: colors.interactive, backgroundColor: colors.card }]} />
          : <ControlIcon name="location" size={20} color={colors.interactive} />}
        {kind === 'start' ? line : gap}
      </View>
      <View style={[local.grow, local.stopText]}>
        <Text style={[t.xs, local.stopLabel, { color: colors.textMuted }]}>{label.toLocaleUpperCase()}</Text>
        <Text style={[local.stopValue, { color: stop.value ? colors.text : colors.interactive }]}>{value}</Text>
        {stop.detail || stop.status ? <View style={local.meta}>
          {stop.detail ? <Text style={[t.sm, { color: colors.textMuted }]}>{stop.detail}</Text> : null}
          {stop.status ? <View style={local.badge} accessibilityLiveRegion="polite">
            {stop.status.busy ? <ActivityIndicator size="small" color={colors.textMuted} style={local.spinner} />
              : <View style={[local.badgeDot, { backgroundColor: stop.status.ready ? colors.success : colors.textSubtle }]} />}
            <Text style={[t.sm, { color: colors.textMuted }]}>{stop.status.label}</Text>
          </View> : null}
        </View> : null}
      </View>
      {stop.photo}
    </Pressable>
  );
}

const local = StyleSheet.create({
  card: { borderRadius: radii.feature },
  grow: { flex: 1 },
  prompt: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, minHeight: 88 },
  promptIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  promptTitle: { ...t.lg, fontFamily: fonts.semibold },
  river: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, minHeight: 56, paddingVertical: 12 },
  riverName: { ...t.xl, fontFamily: fonts.heading, flex: 1 },
  change: { fontFamily: fonts.semibold },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },
  stops: { paddingHorizontal: 16, paddingVertical: 4 },
  stop: { flexDirection: 'row', alignItems: 'stretch', gap: 12, minHeight: 60 },
  // Rows abut with no vertical padding in the rail, so the line runs unbroken
  // from the put-in dot through the leg to the take-out pin.
  rail: { width: 22, alignItems: 'center' },
  line: { width: 2, flex: 1, borderRadius: 1 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 3 },
  stopText: { paddingVertical: 10, gap: 2, justifyContent: 'center' },
  stopLabel: { fontFamily: fonts.semibold, letterSpacing: 0.6 },
  stopValue: { ...t.base, fontFamily: fonts.semibold },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, rowGap: 2 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badgeDot: { width: 8, height: 8, borderRadius: 4 },
  spinner: { transform: [{ scale: 0.7 }], width: 8, height: 8 },
  leg: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 20 },
  legText: { fontFamily: fonts.semibold, paddingVertical: 2 },
});
