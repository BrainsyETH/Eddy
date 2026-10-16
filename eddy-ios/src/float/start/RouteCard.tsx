// eddy-ios/src/float/start/RouteCard.tsx
// Ready to float's route selector: the river heads the card, and the put-in and
// take-out read as one connected stretch with the leg between them. Until a
// river is chosen the card is a single prompt, because neither endpoint can be
// chosen without one. With a known start and no take-out, the next take-outs
// are listed inline with a See All row (iOS's inset-list pattern), so the
// usual choice is one tap and never a sheet.

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

export interface TakeOutSuggestion { id: string; name: string; detail: string; photo?: React.ReactNode }

export function RouteCard({ river, riverNote, from, to, suggestions, takeOutHint, leg, disabled, onRiver, onFrom, onTo }: {
  /** null before a river is chosen; 'loading' while the chosen river loads. */
  river: string | 'loading' | null;
  /** Under the river name, or the prompt's subtitle while there is no river. */
  riverNote?: { label: string; busy?: boolean };
  /** Shown in place of the take-out row while none is chosen. */
  suggestions?: { items: TakeOutSuggestion[]; more: number; onPick: (id: string) => void; onSeeAll: () => void };
  takeOutHint?: string;
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
        {riverNote ? <View style={local.badge}>
          {riverNote.busy ? <ActivityIndicator size="small" color={colors.textMuted} style={local.spinner} /> : null}
          <Text style={[t.sm, { color: colors.textMuted }]}>{riverNote.label}</Text>
        </View> : <Text style={[t.sm, { color: colors.textMuted }]}>Choose a river, then your take-out.</Text>}
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
          : <View style={local.grow}>
            <Text style={[local.riverName, { color: colors.text }]} numberOfLines={1}>{river}</Text>
            {riverNote ? <Text style={[t.sm, { color: colors.textMuted }]}>{riverNote.label}</Text> : null}
          </View>}
        <Text style={[t.sm, local.change, { color: colors.interactive }]}>Change</Text>
      </Pressable>
      <View style={[local.divider, { backgroundColor: colors.border }]} />
      <View style={local.stops}>
        <Stop kind="start" label="Put-in" stop={from} disabled={disabled} onPress={onFrom} />
        <View style={local.leg}>
          <View style={local.rail}><View style={[local.line, { backgroundColor: colors.border }]} /></View>
          {leg ? <Text style={[t.sm, local.legText, { color: colors.textMuted }]}>{leg}</Text> : null}
        </View>
        {suggestions && !to.value && suggestions.items.length
          ? <Suggestions {...suggestions} disabled={disabled} />
          : <View style={local.grow}>
            <Stop kind="end" label="Take-out" stop={to} disabled={disabled} onPress={onTo} />
            {takeOutHint ? <Text style={[t.sm, { color: colors.textMuted, paddingLeft: 32, paddingTop: 4 }]}>{takeOutHint}</Text> : null}
          </View>}
      </View>
    </View>
  );
}

function Suggestions({ items, more, onPick, onSeeAll, disabled }: {
  items: TakeOutSuggestion[]; more: number; onPick: (id: string) => void; onSeeAll: () => void; disabled: boolean;
}) {
  const { colors } = useTheme();
  const divider = <View style={[local.divider, local.rowDivider, { backgroundColor: colors.border }]} />;
  return <>
    <View style={local.stop}>
      <View style={local.rail}>
        <View style={[local.line, { backgroundColor: colors.border }]} />
        <ControlIcon name="location" size={20} color={colors.interactive} />
        <View style={local.grow} />
      </View>
      <View style={[local.grow, local.stopText]}>
        <Text style={[t.xs, local.stopLabel, { color: colors.textMuted }]}>TAKE-OUT</Text>
        <Text accessibilityRole="header" style={[local.stopValue, { color: colors.text }]}>Where will you get out?</Text>
      </View>
    </View>
    {items.map(item => <View key={item.id}>
      {divider}
      <Pressable onPress={() => onPick(item.id)} disabled={disabled} accessibilityRole="button"
        accessibilityLabel={`Take out at ${item.name}, ${item.detail}`}
        style={({ pressed }) => [local.choice, { opacity: pressed || disabled ? 0.6 : 1 }]}>
        <View style={[local.grow, local.choiceText]}>
          <Text style={[t.base, { color: colors.text }]} numberOfLines={2}>{item.name}</Text>
          <Text style={[t.sm, { color: colors.textMuted }]}>{item.detail}</Text>
        </View>
        {item.photo}
      </Pressable>
    </View>)}
    {more ? <>
      {divider}
      <Pressable onPress={onSeeAll} disabled={disabled} accessibilityRole="button"
        accessibilityLabel={`See all ${items.length + more} take-outs`}
        style={({ pressed }) => [local.choice, { opacity: pressed || disabled ? 0.6 : 1 }]}>
        <Text style={[t.base, local.grow, { color: colors.interactive }]}>See All ({items.length + more})</Text>
        <ControlIcon name="chevron-forward" size={15} color={colors.textSubtle} />
      </Pressable>
    </> : null}
  </>;
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
  // Choices hang under the take-out pin, inset to the text column.
  rowDivider: { marginLeft: 34, marginRight: 0 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingLeft: 34, paddingVertical: 8 },
  choiceText: { gap: 1 },
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
