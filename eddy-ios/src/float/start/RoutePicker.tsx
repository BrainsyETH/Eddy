import { useMemo, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ControlIcon } from '@/components/ControlIcon';
import { EddySymbol } from '@/components/EddySymbol';
import { PlanAccessPicker } from '@/components/PlanAccessPicker';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { startRiverPosition, type FloatSetup } from '@/lib/floatStart';
import { takeOutChoices } from '@/lib/floatSession';
import { chooseStartAccess, chooseStartRiver, continueToTakeOut, openStartPicker, type StartField } from '@/lib/floatStartSelection';
import { useTheme } from '@/theme/ThemeProvider';
import { sheetControl } from '@/theme/palette';
import { fonts, type as t } from '@/theme/typography';
import { routeProblemCopy, type LoadedRoute } from '../loadFloatRoute';
import { RiverPicker } from './RiverPicker';
import { useRiverRoute, type StartLocation } from './useStart';
import { Row, Shell, TextButton, styles } from './ui';

/**
 * A single sheet continues River → Access, and on to Take-out while the stretch
 * still lacks one, committing only a finished choice.
 */
export function RoutePicker({ field: openedField, draft, loaded: currentRoute, location, onSelect, onClose, onRetryCurrent, onSearchChange }: {
  field: StartField; draft: FloatSetup; loaded: LoadedRoute | null; location: StartLocation;
  onSelect: (draft: FloatSetup) => void; onClose: () => void; onRetryCurrent: () => void;
  onSearchChange?: () => void;
}) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const [picker, setPicker] = useState(() => openStartPicker(openedField, draft));
  const field = picker.field;
  const [query, setQuery] = useState('');
  const [reload, setReload] = useState(0);
  const sameRiver = picker.draft.riverSlug === draft.riverSlug;
  const otherRoute = useRiverRoute(sameRiver ? undefined : picker.draft.riverSlug, undefined, reload);
  const loaded = sameRiver ? currentRoute : otherRoute;
  const route = loaded?.ok ? loaded.route : null;
  const choices = useMemo(() => loaded?.ok ? takeOutChoices(loaded.route, loaded.index, null) : [], [loaded]);
  const located = loaded?.ok ? startRiverPosition(loaded.index, location.fix, location.checkedAt) : null;
  const putIn = choices.find(point => point.id === picker.draft.putInId);
  const startMile = picker.draft.putInId ? putIn?.mile ?? null : located?.riverMile ?? null;
  const takeOutMile = choices.find(point => point.id === picker.draft.takeOutId)?.mile ?? null;
  const points = useMemo(() => loaded?.ok ? (loaded.accessPoints ?? []).flatMap(point => {
    const choice = choices.find(item => item.id === point.id);
    return choice ? [{ ...point, riverMile: choice.mile }] : [];
  }).sort((a, b) => a.riverMile - b.riverMile) : [], [loaded, choices]);
  const needle = query.trim().toLocaleLowerCase();
  const visibleChoices = choices.filter(point => (field !== 'to' || startMile == null || point.mile > startMile) &&
    point.name.toLocaleLowerCase().includes(needle));
  const visiblePoints = points.filter(point => visibleChoices.some(choice => choice.id === point.id));
  const close = () => { Keyboard.dismiss(); onClose(); };
  const finish = (next: FloatSetup) => {
    const onward = continueToTakeOut(picker, next);
    if (onward) { setPicker(onward); setQuery(''); return; }
    Keyboard.dismiss(); onSelect(next);
  };
  const chooseAccess = (id?: string) => {
    const mile = id ? choices.find(point => point.id === id)?.mile ?? null : located?.riverMile ?? null;
    finish(chooseStartAccess(picker, id, mile, takeOutMile));
  };
  const changeRiver = () => { Keyboard.dismiss(); setQuery(''); setPicker(value => ({ ...value, page: 'rivers' })); };
  const currentLocation = field === 'from' ? <Pressable onPress={() => chooseAccess()} accessibilityRole="button"
    accessibilityState={{ selected: !picker.draft.putInId }}
    style={({ pressed }) => [local.current, { backgroundColor: colors.card, opacity: pressed ? 0.6 : 1 }]}>
    <ControlIcon name="locate" size={22} color={colors.interactive} />
    <Text style={[t.base, local.grow, { color: colors.interactive }]}>Current location</Text>
    {!picker.draft.putInId ? <ControlIcon name="checkmark" size={18} color={colors.interactive} /> : null}
  </Pressable> : null;
  return <Modal visible presentationStyle="pageSheet" animationType={reducedMotion ? 'none' : 'slide'}
    allowSwipeDismissal onRequestClose={close}>
    <SafeAreaProvider><SafeAreaView style={[local.screen, { backgroundColor: colors.sheetGrouped }]}
      accessibilityViewIsModal onAccessibilityEscape={close}>
      <View style={local.header}>
        {picker.page === 'rivers' && field !== 'river' && picker.draft.riverSlug ?
          <Pressable accessibilityRole="button" accessibilityLabel="Back to access points" style={local.close}
            onPress={() => setPicker(value => ({ ...value, page: 'access' }))}>
            <ControlIcon name="chevron-back" size={22} color={colors.interactive} />
          </Pressable> : null}
        <Text accessibilityRole="header" style={[local.title, local.grow, { color: colors.text }]}>
          {field === 'to' ? 'Choose your take-out' : field === 'from' ? 'Choose your put-in' : 'Choose a river'}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close selection" onPress={close}
          style={[local.close, sheetControl(colors)]}>
          <ControlIcon name="close" size={18} color={colors.textMuted} />
        </Pressable>
      </View>
      <KeyboardAvoidingView style={local.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {picker.page === 'rivers' ? <RiverPicker location={location} selectedSlug={picker.draft.riverSlug} onSearchChange={onSearchChange}
          header={currentLocation} onChoose={river => {
            const next = chooseStartRiver(picker, river.slug);
            if (field === 'river') finish(next.draft);
            else { setPicker(next); setQuery(''); setReload(0); }
          }} /> : <>
          <Pressable accessibilityRole="button" accessibilityLabel={`Change river${route ? `, ${route.riverName}` : ''}`}
            onPress={changeRiver} style={local.river}>
            <EddySymbol name="river" size={22} />
            <Text style={[t.sm, local.grow, { color: colors.textMuted }]} numberOfLines={1}>{route?.riverName ?? 'River'}</Text>
            <Text style={[t.sm, { color: colors.interactive }]}>Change</Text>
            <ControlIcon name="chevron-down" size={14} color={colors.interactive} />
          </Pressable>
          {!loaded ? <View style={local.loading}><ActivityIndicator color={colors.interactive} />
            <Text style={[t.base, { color: colors.textMuted }]}>Loading access points…</Text></View>
            : !loaded.ok ? <Shell>
              <Text style={[styles.body, { color: colors.textMuted }]}>{routeProblemCopy(loaded.reason)}</Text>
              <TextButton label="Try again" onPress={() => sameRiver ? onRetryCurrent() : setReload(value => value + 1)} />
            </Shell> : <>
              <View style={local.searchContainer}><View style={[local.search, sheetControl(colors)]}>
                <ControlIcon name="search-outline" size={20} color={colors.textMuted} />
                <TextInput accessibilityLabel="Search access points" placeholder={field === 'to' ? 'Search take-outs' : 'Search put-ins'}
                  placeholderTextColor={colors.textMuted} value={query} onChangeText={setQuery} autoCorrect={false}
                  autoCapitalize="none" clearButtonMode="while-editing" maxLength={120} returnKeyType="search"
                  style={[local.input, { color: colors.text }]} />
              </View></View>
              {points.length === 0 ? <Shell>
                {currentLocation}
                {visibleChoices.map(point => <Row key={point.id} title={point.name}
                  detail={`Mile ${point.mile.toFixed(1)}${field === 'to' && startMile != null ? ` · ${(point.mile - startMile).toFixed(1)} mi from ${picker.draft.putInId ? 'put-in' : 'your location'}` : ''}`}
                  onPress={() => chooseAccess(point.id)} />)}
                {!visibleChoices.length ? <Text style={[t.base, { color: colors.textMuted }]}>No matching access points.</Text> : null}
              </Shell> : <PlanAccessPicker selectedId={(field === 'from' ? picker.draft.putInId : picker.draft.takeOutId) ?? null}
                points={visiblePoints} fromPoint={field === 'to' ? points.find(point => point.id === picker.draft.putInId) : null}
                fromMile={field === 'to' ? startMile : null}
                header={currentLocation}
                emptyMessage={needle ? 'No access points match your search.' : field === 'to' && startMile != null
                  ? 'No take-outs downstream of your start. Change the river or starting point.' : 'No float access points available. Try another river.'}
                onSelect={point => chooseAccess(point.id)} />}
            </>}
        </>}
      </KeyboardAvoidingView>
    </SafeAreaView></SafeAreaProvider>
  </Modal>;
}

const local = StyleSheet.create({
  screen: { flex: 1 },
  grow: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, paddingBottom: 8 },
  title: { ...t['2xl'], fontFamily: fonts.heading },
  close: { minWidth: 44, minHeight: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  river: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, minHeight: 44, paddingVertical: 6 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  searchContainer: { paddingHorizontal: 16, paddingBottom: 8 },
  search: { minHeight: 44, borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 },
  input: { ...t.base, flex: 1, paddingVertical: 10 },
  current: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, padding: 14, borderRadius: 12, marginBottom: 12 },
});
