import { openExternalLink } from '@/lib/openExternalLink';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { FloatDurationSlider } from '@/components/FloatDurationSlider';
import { MenuView } from '@react-native-menu/menu';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { SafeAreaView as ScreenSafeAreaView } from 'react-native-screens/experimental';
import { ControlIcon } from '@/components/ControlIcon';
import { VesselPicker } from '@/components/VesselPicker';
import { ScenicImage } from '@/components/ScenicImage';
import { FloatInfoSheet, type FloatInfoTopic } from '@/components/FloatInfoSheet';
import { floatDurationLabel } from '@/lib/floatPresentation';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RiverListItem } from '@eddy/types';
import {
  approximateLocation,
  FLOAT_BOATS,
  FLOAT_BOAT_STORAGE_KEY,
  floatRangeLabel,
  publicAccessLabel,
  floatSearchIsFresh,
  floatSearchEmptyMessage,
  FLOAT_SEARCH_MAX_AGE_MS,
  FLOAT_SEARCH_EXPIRED_MESSAGE,
  FLOAT_SEARCH_PROXIMITY_NOTE,
  floatSearchUsedProximity,
  type FloatBoat,
  type FloatSearchInput,
  type FloatSearchOption,
  type FloatSearchPlace,
  type FloatSearchResponse,
} from '@eddy/conditions/float-search';
import { fetchFloatSearch, fetchFloatSearchPlaces, fetchRivers } from '@/api/client';
import { useLocation } from '@/hooks/useLocation';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { newPlanRequest } from '@/lib/planRequest';

type State = {
  mode: 'nearby' | 'river';
  input: FloatSearchInput;
  location: string;
  town: string;
  result: FloatSearchResponse | null;
};
// Only the boat preference is persisted. Search location and results stay in this session.
let previous: { state: State; scroll: number; river: string } | null = null;

function rememberSearch(state: State, scroll: number, river: string) {
  previous = { state, scroll, river };
}

export default function FindFloatScreen() {
  const { river: initialRiver = '' } = useLocalSearchParams<{
    river?: string;
  }>();
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const reducedMotion = useReducedMotion();
  const location = useLocation();
  const [state, setState] = useState<State>(() =>
    previous && (!initialRiver || previous.river === initialRiver)
      ? {
          ...previous.state,
          result:
            previous.state.result && floatSearchIsFresh(previous.state.result) ? previous.state.result : null,
        }
      : {
          mode: initialRiver ? 'river' : 'nearby',
          input: {
            river: initialRiver || undefined,
            targetHours: 5,
            radiusMiles: 100,
            vesselType: 'canoe',
            publicOnly: true,
          },
          location: '',
          town: '',
          result: null,
        },
  );
  const [rivers, setRivers] = useState<RiverListItem[]>([]);
  const [riverPicker, setRiverPicker] = useState(false);
  const [locationPicker, setLocationPicker] = useState(false);
  const [moreFilters, setMoreFilters] = useState(false);
  const [info, setInfo] = useState<FloatInfoTopic | null>(null);
  const revealResults = useRef(false);
  const [riverQuery, setRiverQuery] = useState('');
  const [places, setPlaces] = useState<FloatSearchPlace[] | null>(null);
  const [busy, setBusy] = useState<'town' | 'search' | 'location' | null>(null);
  const [error, setError] = useState('');
  const [pickerError, setPickerError] = useState('');
  const [expired, setExpired] = useState(() =>
    Boolean(
      previous &&
        (!initialRiver || previous.river === initialRiver) &&
        previous.state.result &&
        !floatSearchIsFresh(previous.state.result),
    ),
  );
  const request = useRef<AbortController | null>(null);
  const locationAttempt = useRef(0);
  const scroll = useRef(0);
  const restoreScroll = useRef(
    previous &&
      (!initialRiver || previous.river === initialRiver) &&
      previous.state.result &&
      floatSearchIsFresh(previous.state.result)
      ? previous.scroll
      : 0,
  );
  const scroller = useRef<ScrollView>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetchRivers(controller.signal)
      .then(setRivers)
      .catch(() => {});
    if (!previous || (initialRiver && previous.river !== initialRiver))
      void AsyncStorage.getItem(FLOAT_BOAT_STORAGE_KEY)
        .then((boat) => {
          if (!controller.signal.aborted && FLOAT_BOATS.includes(boat as FloatBoat))
            setState((s) => ({
              ...s,
              input: { ...s.input, vesselType: boat as FloatBoat },
            }));
        })
        .catch(() => {});
    const attempts = locationAttempt;
    return () => {
      controller.abort();
      request.current?.abort();
      attempts.current++;
    };
  }, [initialRiver]);
  useFocusEffect(
    useCallback(() => {
      const result = state.result;
      if (!result) return;
      const expire = () => {
        if (floatSearchIsFresh(result)) return;
        setState((s) => (s.result === result ? { ...s, result: null } : s));
        setExpired(true);
      };
      expire();
      const timer = setTimeout(
        expire,
        Math.max(0, Date.parse(result.estimatedAt) + FLOAT_SEARCH_MAX_AGE_MS - Date.now()),
      );
      const subscription = AppState.addEventListener('change', (value) => {
        if (value === 'active') expire();
      });
      return () => {
        clearTimeout(timer);
        subscription.remove();
      };
    }, [state.result]),
  );
  const update = (patch: Partial<FloatSearchInput>) => {
    request.current?.abort();
    locationAttempt.current++;
    setBusy(null);
    setError('');
    setPickerError('');
    setExpired(false);
    setState((s) => ({ ...s, input: { ...s.input, ...patch }, result: null }));
    if (patch.vesselType) void AsyncStorage.setItem(FLOAT_BOAT_STORAGE_KEY, patch.vesselType).catch(() => {});
  };
  async function run(kind: 'town' | 'search') {
    if (kind === 'search') setExpired(false);
    request.current?.abort();
    locationAttempt.current++;
    const controller = new AbortController();
    request.current = controller;
    setBusy(kind);
    if (kind === 'search') setError('');
    else setPickerError('');
    if (kind === 'search') {
      revealResults.current = true;
      setState((s) => ({ ...s, result: null }));
    } else setPlaces(null);
    try {
      if (kind === 'town') {
        const data = await fetchFloatSearchPlaces(state.town, controller.signal);
        if (!controller.signal.aborted) setPlaces(data.places);
      } else {
        const input = {
          ...state.input,
          near: state.input.near ? approximateLocation(state.input.near) : undefined,
        };
        const result = await fetchFloatSearch(input, controller.signal);
        if (!controller.signal.aborted) setState((s) => ({ ...s, result }));
      }
    } catch (e) {
      if (!controller.signal.aborted) {
        const message = e instanceof Error ? e.message : 'Search could not finish. Please try again.';
        if (kind === 'search') setError(message);
        else setPickerError(message);
      }
    } finally {
      if (!controller.signal.aborted) setBusy(null);
    }
  }
  async function locate() {
    request.current?.abort();
    const attempt = ++locationAttempt.current;
    setBusy('location');
    setPickerError('');
    const point = await location.request();
    if (attempt !== locationAttempt.current) return;
    if (point) {
      setError('');
      setExpired(false);
      setState((s) => ({
        ...s,
        location: 'Your approximate location',
        input: { ...s.input, near: approximateLocation(point) },
        result: null,
      }));
      setPlaces(null);
      setLocationPicker(false);
    } else setPickerError('Location is unavailable. Choose a town or a river.');
    setBusy(null);
  }
  function plan(option: FloatSearchOption) {
    rememberSearch(state, scroll.current, initialRiver);
    router.push({
      pathname: '/',
      params: {
        focusRiver: option.riverSlug,
        openPlan: '1',
        planPutIn: option.putIn.id,
        planTakeOut: option.takeOut.id,
        planVesselTypeId: option.vesselTypeId,
        planRequest: newPlanRequest(),
        planReturnTo: 'find-float',
      },
    });
  }

  const label = (text: string) => <Text style={[styles.label, { color: colors.text }]}>{text}</Text>;
  const body = (text: string) => <Text style={[t.sm, { color: colors.textMuted }]}>{text}</Text>;
  const inputStyle = [
    styles.input,
    {
      color: colors.text,
      backgroundColor: colors.card,
      borderColor: colors.border,
    },
  ];
  const { input, result } = state;
  function card(o: FloatSearchOption) {
    return (
      <View key={o.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {o.photo && (
          <View style={styles.group}>
            <ScenicImage
              source={{ uri: o.photo.url }}
              accessibilityLabel={o.photo.caption}
              style={{ height: 160, width: '100%', borderRadius: 12 }}
            />
            {body(o.photo.caption)}
          </View>
        )}
        <Text style={[styles.label, { color: colors.interactive }]}>{o.riverName}</Text>
        <Text style={[styles.heading, { color: colors.text }]}>
          {o.putIn.name} → {o.takeOut.name}
        </Text>
        <Pressable
          onPress={() => setInfo('time')}
          accessibilityRole="button"
          accessibilityLabel={`${floatRangeLabel(o.timeRange)}. How float times are estimated`}
          style={styles.estimateLink}
        >
          <Text style={[styles.label, { color: colors.text, flexShrink: 1 }]}>
            {floatRangeLabel(o.timeRange)}
            {o.relation === 'match' ? '' : ` · ${o.relation} option`}
          </Text>
          <ControlIcon name="information-circle-outline" size={18} color={colors.interactive} />
        </Pressable>
        {body(`${o.distanceMiles.toFixed(1)} river miles`)}
        {body(
          o.estimateBasis === 'current_conditions'
            ? 'Based on current conditions'
            : 'Based on typical conditions',
        )}
        {o.observedAt && o.estimateBasis === 'current_conditions'
          ? body(
              `Reading ${new Date(o.observedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`,
            )
          : null}
        <Text style={[styles.label, { color: colors.text }]}>
          {o.conditionLabel}
          {o.conditional ? ' · Check cautions' : ''}
        </Text>
        {body(
          `Put-in: ${publicAccessLabel(o.putIn.isPublic)}\nTake-out: ${publicAccessLabel(o.takeOut.isPublic)}`,
        )}
        {o.description ? (
          <Text numberOfLines={3} style={[t.sm, { color: colors.textMuted }]}>
            {o.description}
          </Text>
        ) : null}
        {o.cautions.map((c, i) => (
          <Text key={i} style={[t.sm, { color: colors.text }]}>
            {c}
          </Text>
        ))}
        {<SearchButton label={'Plan this float'} onPress={() => plan(o)} primary={true} />}
      </View>
    );
  }
  const closePicker = () => {
    request.current?.abort();
    locationAttempt.current++;
    setBusy(null);
    setPickerError('');
    setLocationPicker(false);
    setRiverPicker(false);
  };
  const changeMode = (mode: State['mode']) => {
    if (mode === state.mode) return;
    update({ river: undefined });
    setState((s) => ({ ...s, mode }));
  };
  const canSearch = busy === null && (state.mode === 'river' ? !!input.river : !!input.near);
  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <ScrollView
        ref={scroller}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        scrollEventThrottle={100}
        onScroll={(e) => {
          scroll.current = e.nativeEvent.contentOffset.y;
        }}
        onContentSizeChange={() => {
          if (restoreScroll.current) {
            scroller.current?.scrollTo({ y: restoreScroll.current, animated: false });
            restoreScroll.current = 0;
          }
        }}
      >
        <View style={[styles.modes, { backgroundColor: colors.cardRaised }]} accessibilityRole="tablist">
          {(['nearby', 'river'] as const).map((mode) => (
            <Pressable
              key={mode}
              onPress={() => changeMode(mode)}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === state.mode }}
              style={[
                styles.mode,
                { backgroundColor: state.mode === mode ? colors.card : colors.cardRaised },
              ]}
            >
              <Text
                style={[styles.buttonText, { color: state.mode === mode ? colors.text : colors.textMuted }]}
              >
                {mode === 'nearby' ? 'Nearby' : 'By river'}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={[styles.formGroup, { backgroundColor: colors.card }]}>
          <Pressable
            onPress={() => {
              setPickerError('');
              if (state.mode === 'river') setRiverPicker(true);
              else setLocationPicker(true);
            }}
            disabled={busy !== null}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy !== null }}
            style={styles.fieldRow}
          >
            <ControlIcon
              name={state.mode === 'river' ? 'map-outline' : 'locate-outline'}
              size={20}
              color={colors.interactive}
            />
            <View style={styles.fieldCopy}>
              {body(state.mode === 'river' ? 'River' : 'Starting location')}
              {label(
                state.mode === 'river'
                  ? (rivers.find((r) => r.slug === input.river)?.name ?? input.river ?? 'Choose a river')
                  : state.location || 'Choose a location',
              )}
            </View>
            <ControlIcon name="chevron-forward" size={16} color={colors.textSubtle} />
          </Pressable>
          {state.mode === 'nearby' ? (
            <>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <MenuView
                themeVariant={isDark ? 'dark' : 'light'}
                shouldOpenOnLongPress={false}
                title="Search radius"
                actions={[25, 50, 100, 150, 200, 300].map((miles) => ({
                  id: String(miles),
                  title: `Within ${miles} miles`,
                  state: miles === input.radiusMiles ? 'on' : 'off',
                }))}
                onPressAction={({ nativeEvent }) => {
                  const radiusMiles = Number(nativeEvent.event);
                  if ([25, 50, 100, 150, 200, 300].includes(radiusMiles)) update({ radiusMiles });
                }}
              >
                <View
                  style={styles.fieldRow}
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel={`Search radius, within ${input.radiusMiles} miles`}
                >
                  <Text style={[t.base, { color: colors.text, flex: 1 }]}>Search radius</Text>
                  <Text style={[t.base, { color: colors.interactive }]}>Within {input.radiusMiles} mi</Text>
                  <ControlIcon name="chevron-down" size={14} color={colors.interactive} />
                </View>
              </MenuView>
              <View style={styles.noteRow}>
                <Text style={[t.xs, { color: colors.textMuted, flex: 1 }]}>
                  Approximate distance to the put-in.
                </Text>
                <InfoButton topic="distance" onPress={() => setInfo('distance')} />
              </View>
            </>
          ) : null}
        </View>
        <View style={[styles.formGroup, styles.groupPadding, { backgroundColor: colors.card }]}>
          <View style={styles.between}>
            {label('Time on the river')}
            <InfoButton topic="time" onPress={() => setInfo('time')} />
          </View>
          <FloatDurationSlider
            hours={input.targetHours}
            onChange={(targetHours) => update({ targetHours })}
          />
        </View>
        <View style={[styles.formGroup, styles.groupPadding, { backgroundColor: colors.card }]}>
          {label('Vessel')}
          <VesselPicker value={input.vesselType} onChange={(vesselType) => update({ vesselType })} />
        </View>
        <View style={[styles.formGroup, { backgroundColor: colors.card }]}>
          <Pressable
            onPress={() => setMoreFilters((value) => !value)}
            accessibilityRole="button"
            accessibilityState={{ expanded: moreFilters }}
            style={styles.fieldRow}
          >
            <Text style={[styles.label, { color: colors.text, flex: 1 }]}>More filters</Text>
            {input.publicOnly ? body('1 active') : null}
            <ControlIcon
              name={moreFilters ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={colors.textMuted}
            />
          </Pressable>
          {moreFilters ? (
            <View style={styles.fieldRow}>
              <Text style={[t.sm, { color: colors.text, flex: 1 }]}>Public put-ins &amp; take-outs</Text>
              <Switch
                accessibilityLabel="Public put-ins and take-outs only"
                value={input.publicOnly}
                onValueChange={(publicOnly) => update({ publicOnly })}
              />
            </View>
          ) : null}
        </View>
        {busy && <ActivityIndicator color={colors.interactive} />}
        {error ? (
          <Text accessibilityRole="alert" style={[styles.label, { color: colors.text }]}>
            {error}
          </Text>
        ) : null}
        {expired && body(FLOAT_SEARCH_EXPIRED_MESSAGE)}
        {result && (
          <View
            style={styles.group}
            onLayout={(event) => {
              const y = event.nativeEvent.layout.y;
              if (revealResults.current) {
                revealResults.current = false;
                scroller.current?.scrollTo({ y, animated: !reducedMotion });
              }
            }}
          >
            <Text style={[styles.heading, { color: colors.text }]}>
              Floats for about {floatDurationLabel(input.targetHours * 60)}
            </Text>
            {body(
              `Checked ${new Date(result.estimatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. Conditions can change.`,
            )}
            {floatSearchUsedProximity(result) && body(FLOAT_SEARCH_PROXIMITY_NOTE)}
            {result.partial &&
              body(
                `${result.failed ? 'Some river data was unavailable. ' : ''}This is a partial search. Try again or choose a river for a closer look.`,
              )}
            {result.matches.length === 0 && body(floatSearchEmptyMessage(result))}
            {result.matches.map(card)}
            {result.alternatives.length > 0 && (
              <>
                <Text style={[styles.heading, { color: colors.text }]}>Shorter or longer alternatives</Text>
                {body(
                  `These trips are shorter or longer than ${floatDurationLabel(input.targetHours * 60)}.`,
                )}
                {result.alternatives.map(card)}
              </>
            )}
          </View>
        )}
      </ScrollView>
      <ScreenSafeAreaView
        edges={{ bottom: true }}
        style={[styles.footerSafe, { backgroundColor: colors.bg }]}
      >
        <View style={styles.footer}>
          <SearchButton
            label={busy === 'search' ? 'Checking floats…' : result ? 'Search again' : 'Find floats'}
            primary
            disabled={!canSearch}
            onPress={() => {
              void run('search');
            }}
          />
        </View>
      </ScreenSafeAreaView>
      {info ? <FloatInfoSheet topic={info} onClose={() => setInfo(null)} /> : null}
      <Modal
        visible={locationPicker || riverPicker}
        presentationStyle="pageSheet"
        animationType={reducedMotion ? 'none' : 'slide'}
        allowSwipeDismissal
        onRequestClose={closePicker}
      >
        <SafeAreaProvider>
          <SafeAreaView
            style={[styles.screen, { backgroundColor: colors.bg }]}
            accessibilityViewIsModal
            onAccessibilityEscape={closePicker}
          >
            <View style={styles.modalHeader}>
              <Text accessibilityRole="header" style={[styles.heading, { color: colors.text, flex: 1 }]}>
                {riverPicker ? 'Choose a river' : 'Starting location'}
              </Text>
              <SearchButton label="Done" onPress={closePicker} />
            </View>
            <KeyboardAvoidingView
              style={styles.screen}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
                {riverPicker ? (
                  <>
                    <TextInput
                      accessibilityLabel="Filter rivers"
                      placeholder="River name"
                      placeholderTextColor={colors.textSubtle}
                      value={riverQuery}
                      onChangeText={setRiverQuery}
                      style={inputStyle}
                      autoCorrect={false}
                    />
                    {rivers
                      .filter((r) => r.name.toLowerCase().includes(riverQuery.toLowerCase()))
                      .map((r) => (
                        <SearchButton
                          key={r.id}
                          label={r.name}
                          selected={input.river === r.slug}
                          onPress={() => {
                            update({ river: r.slug });
                            setRiverPicker(false);
                          }}
                        />
                      ))}
                    {rivers.length === 0
                      ? body('The river list is unavailable. Try location or town search.')
                      : null}
                    {rivers.length > 0 &&
                    !rivers.some((r) => r.name.toLowerCase().includes(riverQuery.toLowerCase()))
                      ? body('No rivers found. Try another name.')
                      : null}
                  </>
                ) : (
                  <>
                    <SearchButton
                      label={busy === 'location' ? 'Finding your location…' : 'Use my location'}
                      disabled={busy !== null}
                      onPress={() => {
                        void locate();
                      }}
                    />
                    <TextInput
                      accessibilityLabel="Town and state"
                      placeholder="Town and state"
                      placeholderTextColor={colors.textSubtle}
                      value={state.town}
                      maxLength={120}
                      style={inputStyle}
                      returnKeyType="search"
                      autoCorrect={false}
                      onChangeText={(town) => {
                        request.current?.abort();
                        locationAttempt.current++;
                        setBusy(null);
                        setPickerError('');
                        setPlaces(null);
                        setState((s) => ({ ...s, town }));
                      }}
                      onSubmitEditing={() => {
                        if (state.town.trim().length >= 2) void run('town');
                      }}
                    />
                    <SearchButton
                      label={busy === 'town' ? 'Searching…' : 'Search towns'}
                      disabled={busy !== null || state.town.trim().length < 2}
                      onPress={() => {
                        void run('town');
                      }}
                    />
                    {places?.length === 0 ? body('No towns found. Add a state and try again.') : null}
                    {places?.map((place) => (
                      <SearchButton
                        key={place.id}
                        label={place.name}
                        onPress={() => {
                          update({ near: place.near });
                          setState((s) => ({ ...s, location: place.name, town: place.name }));
                          setPlaces(null);
                          setLocationPicker(false);
                        }}
                      />
                    ))}
                    {places ? (
                      <Text
                        onPress={() => void openExternalLink('https://www.mapbox.com/about/maps/')}
                        accessibilityRole="link"
                        style={[t.xs, { color: colors.textMuted }]}
                      >
                        Town search © Mapbox
                      </Text>
                    ) : null}
                    {input.near ? (
                      <SearchButton
                        label="Clear location"
                        onPress={() => {
                          update({ near: undefined });
                          setState((s) => ({ ...s, location: '', town: '' }));
                          setLocationPicker(false);
                        }}
                      />
                    ) : null}
                  </>
                )}
                {pickerError ? (
                  <Text accessibilityRole="alert" style={[t.sm, { color: colors.error }]}>
                    {pickerError}
                  </Text>
                ) : null}
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
    </View>
  );
}

function SearchButton({
  label,
  onPress,
  selected = false,
  primary = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  selected?: boolean;
  primary?: boolean;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, ...(selected ? { selected: true } : {}) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          borderColor: colors.border,
          backgroundColor: primary ? colors.accentFill : selected ? colors.selectionBg : colors.card,
          opacity: disabled || pressed ? 0.5 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          { color: primary ? colors.onAccent : selected ? colors.selectionText : colors.interactive },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function InfoButton({ topic, onPress }: { topic: FloatInfoTopic; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={topic === 'time' ? 'How float times are estimated' : 'How distance is measured'}
      style={styles.info}
    >
      <ControlIcon name="information-circle-outline" size={19} color={colors.interactive} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 24, gap: 12 },
  heading: { ...t.xl, fontFamily: fonts.heading },
  label: { ...t.base, fontFamily: fonts.semibold },
  group: { gap: 12 },
  formGroup: { borderRadius: 18, overflow: 'hidden' },
  groupPadding: { padding: 14, gap: 8 },
  modes: { flexDirection: 'row', padding: 3, borderRadius: 13 },
  mode: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    padding: 8,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 54,
  },
  fieldCopy: { flex: 1, gap: 2 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },
  noteRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 6 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' },
  info: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  estimateLink: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  card: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 8 },
  button: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 48,
    justifyContent: 'center',
  },
  buttonText: { ...t.sm, fontFamily: fonts.semibold, textAlign: 'center' },
  input: { ...t.base, borderWidth: 1, borderRadius: 12, padding: 14 },
  footerSafe: { flex: 0 },
  footer: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
});
