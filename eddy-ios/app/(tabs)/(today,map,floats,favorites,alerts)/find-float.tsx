import { openExternalLink } from '@/lib/openExternalLink';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Keyboard,
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
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { FloatDurationSlider } from '@/components/FloatDurationSlider';
import { MenuView } from '@react-native-menu/menu';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { SafeAreaView as ScreenSafeAreaView } from 'react-native-screens/experimental';
import { ControlIcon } from '@/components/ControlIcon';
import { VesselPicker } from '@/components/VesselPicker';
import { FloatSearchCard } from '@/components/FloatSearchCard';
import { FloatInfoSheet, type FloatInfoTopic } from '@/components/FloatInfoSheet';
import { floatDurationLabel } from '@/lib/floatPresentation';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RiverListItem } from '@eddy/types';
import {
  approximateLocation,
  FLOAT_BOATS,
  FLOAT_BOAT_STORAGE_KEY,
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
import { floatPlanDestination } from '@/lib/planRequest';
import { useNavigationAction } from '@/hooks/useNavigationAction';
import { readBestIndex } from '@/lib/riverCache';
import { selectSearchRiver, selectSearchLocation, canDefaultToCurrentLocation } from '@/lib/floatSearchSelection';

type State = {
  input: FloatSearchInput;
  location: string;
  locationSource?: 'current' | 'place';
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
  const navigate = useNavigationAction();
  const { colors, isDark } = useTheme();
  const reducedMotion = useReducedMotion();
  const location = useLocation({ refreshGranted: true });
  const locationChosen = useRef(false);
  const [state, setState] = useState<State>(() =>
    previous && (!initialRiver || previous.river === initialRiver)
      ? {
          ...previous.state,
          result:
            previous.state.result && floatSearchIsFresh(previous.state.result) ? previous.state.result : null,
        }
      : {
          input: {
            river: initialRiver || undefined,
            targetHours: 5,
            radiusMiles: 100,
            vesselType: 'kayak',
            publicOnly: true,
          },
          location: '',
          result: null,
        },
  );
  const [rivers, setRivers] = useState<RiverListItem[]>([]);
  const [wherePicker, setWherePicker] = useState(false);
  const [info, setInfo] = useState<FloatInfoTopic | null>(null);
  const [showResultDetails, setShowResultDetails] = useState(false);
  const revealResults = useRef(false);
  const [query, setQuery] = useState('');
  const [placeSearch, setPlaceSearch] = useState<{
    query: string;
    places: FloatSearchPlace[];
    error?: string;
  } | null>(null);
  const [busy, setBusy] = useState<'search' | 'location' | null>(null);
  const [riversError, setRiversError] = useState('');
  const [riverReload, setRiverReload] = useState(0);
  const boatChosen = useRef(false);
  const [error, setError] = useState('');
  const [locationError, setLocationError] = useState('');
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
    let fresh = false;
    void readBestIndex().then((cached) => {
      if (!controller.signal.aborted && !fresh && cached) setRivers(cached.payload);
    });
    void fetchRivers(controller.signal)
      .then((rows) => {
        if (!controller.signal.aborted) {
          fresh = true;
          setRivers(rows);
          setRiversError('');
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setRiversError('Couldn’t refresh the river list.');
      });
    if (!previous || (initialRiver && previous.river !== initialRiver))
      void AsyncStorage.getItem(FLOAT_BOAT_STORAGE_KEY)
        .then((boat) => {
          if (!controller.signal.aborted && !boatChosen.current && FLOAT_BOATS.includes(boat as FloatBoat))
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
  }, [initialRiver, riverReload]);
  const townQuery = query.trim();
  const currentPlaces = placeSearch?.query === townQuery ? placeSearch : null;
  useEffect(() => {
    if (!wherePicker || townQuery.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetchFloatSearchPlaces(townQuery, controller.signal)
        .then((data) => {
          if (!controller.signal.aborted) setPlaceSearch({ query: townQuery, places: data.places });
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setPlaceSearch({
              query: townQuery,
              places: [],
              error: 'Town search is unavailable. Try again or choose a river.',
            });
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [townQuery, wherePicker]);
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
  useEffect(() => {
    if (!location.coords || !canDefaultToCurrentLocation(state.input, location.status, locationChosen.current)) return;
    locationChosen.current = true;
    const near = approximateLocation(location.coords);
    setState((current) => ({ ...current, location: 'Near you', locationSource: 'current',
      input: { ...current.input, ...selectSearchLocation(near) }, result: null }));
  }, [location.coords, location.status, state.input]);

  const update = (patch: Partial<FloatSearchInput>) => {
    if ('river' in patch || 'near' in patch) locationChosen.current = true;
    request.current?.abort();
    locationAttempt.current++;
    setBusy(null);
    setError('');
    setLocationError('');
    setExpired(false);
    setState((s) => ({ ...s, input: { ...s.input, ...patch }, result: null }));
    if (patch.vesselType) {
      boatChosen.current = true;
      void AsyncStorage.setItem(FLOAT_BOAT_STORAGE_KEY, patch.vesselType).catch(() => {});
    }
  };
  async function run() {
    if (request.current && !request.current.signal.aborted) return;
    locationChosen.current = true; // Search commits the geographic scope shown.
    boatChosen.current = true; // Search commits the vessel currently shown, even if storage is slow.
    setExpired(false);
    locationAttempt.current++;
    const controller = new AbortController();
    request.current = controller;
    setBusy('search');
    setError('');
    revealResults.current = true;
    setState((s) => ({ ...s, result: null }));
    try {
      const input = {
        ...state.input,
        near: state.input.near ? approximateLocation(state.input.near) : undefined,
      };
      const result = await fetchFloatSearch(input, controller.signal);
      if (!controller.signal.aborted) setState((s) => ({ ...s, result }));
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : 'Search could not finish. Please try again.');
    } finally {
      if (request.current === controller) {
        request.current = null;
        if (!controller.signal.aborted) setBusy(null);
      }
    }
  }
  async function locate() {
    locationChosen.current = true;
    request.current?.abort();
    const attempt = ++locationAttempt.current;
    setBusy('location');
    setLocationError('');
    const point = await location.request();
    if (attempt !== locationAttempt.current) return;
    if (point) {
      setError('');
      setExpired(false);
      setState((s) => ({
        ...s,
        location: 'Near you',
        locationSource: 'current',
        input: { ...s.input, ...selectSearchLocation(approximateLocation(point)) },
        result: null,
      }));
      Keyboard.dismiss();
      setWherePicker(false);
    } else setLocationError('Location is unavailable. Search for a river or town instead.');
    setBusy(null);
  }
  function plan(option: FloatSearchOption) {
    rememberSearch(state, scroll.current, initialRiver);
    navigate(() =>
      router.push(
        floatPlanDestination({
          focusRiver: option.riverSlug,
          planPutIn: option.putIn.id,
          planTakeOut: option.takeOut.id,
          planVesselTypeId: option.vesselTypeId,
        }),
      ),
    );
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
  function card(option: FloatSearchOption) {
    return (
      <FloatSearchCard
        key={option.id}
        option={option}
        riverPhotoUrl={rivers.find((river) => river.slug === option.riverSlug)?.photoUrl ?? undefined}
        onPlan={() => plan(option)}
        onTimeInfo={() => setInfo('time')}
      />
    );
  }
  const closePicker = () => {
    Keyboard.dismiss();
    locationAttempt.current++;
    if (busy === 'location') setBusy(null);
    setWherePicker(false);
  };
  const canSearch = busy === null && Boolean(input.river || input.near);
  const matchingRivers = rivers.filter((r) => r.name.toLowerCase().includes(townQuery.toLowerCase()));
  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen
        options={{
          headerTransparent: false,
          headerBlurEffect: 'none',
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerShadowVisible: true,
        }}
      />
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
        <View style={[styles.formGroup, { backgroundColor: colors.card }]}>
          <Pressable
            onPress={() => {
              locationChosen.current = true;
              setQuery('');
              setWherePicker(true);
            }}
            disabled={busy !== null}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy !== null }}
            style={styles.fieldRow}
          >
            <ControlIcon name="search-outline" size={20} color={colors.interactive} />
            <View style={styles.fieldCopy}>
              {body('Where?')}
              {label(
                input.river
                  ? (rivers.find((r) => r.slug === input.river)?.name ?? input.river)
                  : state.location || 'Search for a river or town',
              )}
            </View>
            <ControlIcon name="chevron-forward" size={16} color={colors.textSubtle} />
          </Pressable>
          {input.near && !input.river ? (
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
        <View style={[styles.formGroup, { backgroundColor: colors.card }]}>
          <VesselPicker value={input.vesselType} onChange={(vesselType) => update({ vesselType })} />
        </View>
        <View style={[styles.formGroup, styles.groupPadding, { backgroundColor: colors.card }]}>
          <View style={styles.between}>
            <View style={styles.fieldCopy}>
              {label('Public access only')}
              {body('Show routes with public put-ins and take-outs.')}
            </View>
            <Switch
              accessibilityLabel="Public access only"
              value={input.publicOnly}
              onValueChange={(publicOnly) => update({ publicOnly })}
            />
          </View>
          {!input.publicOnly
            ? body('Results may include private or unconfirmed access. Check access details before going.')
            : null}
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
            <View style={styles.between}>
              {body(
                `Checked ${new Date(result.estimatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`,
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: showResultDetails }}
                onPress={() => setShowResultDetails((value) => !value)}
                style={styles.searchDetails}
              >
                <Text style={[t.sm, { color: colors.interactive }]}>Search details</Text>
                <ControlIcon
                  name={showResultDetails ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color={colors.interactive}
                />
              </Pressable>
            </View>
            {result.partial
              ? body(result.failed ? 'Some rivers couldn’t be checked.' : 'Showing a selection of routes.')
              : null}
            {showResultDetails ? (
              <View style={styles.group}>
                {body('Conditions can change. Opening a plan checks the route again.')}
                {floatSearchUsedProximity(result) && body(FLOAT_SEARCH_PROXIMITY_NOTE)}
                {result.partial &&
                  body('This search is partial. Choose a river or search again to see more options.')}
              </View>
            ) : null}
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
            label={busy === 'search' ? 'Finding routes…' : result ? 'Search again' : 'Find routes'}
            primary
            disabled={!canSearch}
            onPress={() => {
              void run();
            }}
          />
        </View>
      </ScreenSafeAreaView>
      {info ? <FloatInfoSheet topic={info} onClose={() => setInfo(null)} /> : null}
      <Modal
        visible={wherePicker}
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
                Where?
              </Text>
              <SearchButton label="Done" onPress={closePicker} />
            </View>
            <KeyboardAvoidingView
              style={styles.screen}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
              <ScrollView
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                contentContainerStyle={styles.content}
              >
                <SearchButton
                  label={busy === 'location' ? 'Finding your location…' : 'Current location'}
                  selected={state.locationSource === 'current' && !!input.near && !input.river}
                  disabled={busy !== null}
                  onPress={() => void locate()}
                />
                {locationError ? <Text accessibilityRole="alert" style={[t.sm, { color: colors.text }]}>{locationError}</Text> : null}
                <TextInput
                  accessibilityLabel="Search for a river or town"
                  placeholder="River or town and state"
                  placeholderTextColor={colors.textSubtle}
                  value={query}
                  maxLength={120}
                  style={inputStyle}
                  autoCorrect={false}
                  autoFocus
                  returnKeyType="search"
                  onChangeText={setQuery}
                />
                <Text accessibilityRole="header" style={[styles.label, { color: colors.text }]}>
                  Rivers
                </Text>
                {matchingRivers.map((river) => (
                  <SearchButton
                    key={river.id}
                    label={river.name}
                    selected={input.river === river.slug}
                    onPress={() => {
                      update(selectSearchRiver(river.slug));
                      setState((s) => ({ ...s, location: '', locationSource: undefined }));
                      closePicker();
                    }}
                  />
                ))}
                {!matchingRivers.length
                  ? body(
                      rivers.length
                        ? 'No matching rivers. Try a town below.'
                        : 'No river list available yet.',
                    )
                  : null}
                {riversError ? (
                  <>
                    <Text style={[t.sm, { color: colors.textMuted }]}>{riversError}</Text>
                    <SearchButton label="Retry river list" onPress={() => setRiverReload((n) => n + 1)} />
                  </>
                ) : null}
                {townQuery.length >= 2 ? (
                  <>
                    <Text accessibilityRole="header" style={[styles.label, { color: colors.text }]}>
                      Towns &amp; places
                    </Text>
                    {!currentPlaces ? (
                      <ActivityIndicator accessibilityLabel="Searching towns" color={colors.interactive} />
                    ) : currentPlaces.error ? (
                      body(currentPlaces.error)
                    ) : !currentPlaces.places.length ? (
                      body('No towns found. Add a state or try another name.')
                    ) : null}
                    {currentPlaces?.places.map((place) => (
                      <SearchButton
                        key={place.id}
                        label={place.name}
                        onPress={() => {
                          update(selectSearchLocation(place.near));
                          setState((s) => ({ ...s, location: place.name, locationSource: 'place' }));
                          closePicker();
                        }}
                      />
                    ))}
                    {currentPlaces ? (
                      <Text
                        onPress={() => void openExternalLink('https://www.mapbox.com/about/maps/')}
                        accessibilityRole="link"
                        style={[t.xs, { color: colors.textMuted }]}
                      >
                        Town search © Mapbox
                      </Text>
                    ) : null}
                  </>
                ) : (
                  body('Type at least two letters to search towns.')
                )}
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
  searchDetails: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 24, gap: 12 },
  heading: { ...t.xl, fontFamily: fonts.heading },
  label: { ...t.base, fontFamily: fonts.semibold },
  group: { gap: 12 },
  formGroup: { borderRadius: 18, overflow: 'hidden' },
  groupPadding: { padding: 14, gap: 8 },
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
