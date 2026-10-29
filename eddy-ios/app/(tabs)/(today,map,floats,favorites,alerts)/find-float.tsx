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
import { FloatSearchLoading } from '@/components/FloatSearchLoading';
import { FloatInfoSheet, type FloatInfoTopic } from '@/components/FloatInfoSheet';
import { FloatFiltersSheet } from '@/components/FloatFiltersSheet';
import { floatDurationLabel } from '@/lib/floatPresentation';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RiverListItem } from '@eddy/types';
import {
  approximateLocation,
  FLOAT_BOATS,
  FLOAT_BOAT_STORAGE_KEY,
  FLOAT_RADIUS_MILES,
  FLOAT_SEARCH_DEFAULT_BOAT,
  FLOAT_TRIP_DAYS,
  floatFilterCount,
  floatSearchIdentity,
  floatSearchIsFresh,
  floatSearchEmptyMessage,
  floatSearchRecoveryOptions,
  floatSearchRequest,
  floatSortsFor,
  floatTripLabel,
  FLOAT_SEARCH_MAX_AGE_MS,
  FLOAT_SEARCH_EXPIRED_MESSAGE,
  sortFloatOptions,
  type FloatBoat,
  type FloatSearchInput,
  type FloatSearchOption,
  type FloatSearchPlace,
  type FloatSearchResponse,
  type FloatSort,
  type FloatTripDays,
} from '@eddy/conditions/float-search';
import { fetchFloatSearch, fetchFloatSearchPlaces, fetchRivers } from '@/api/client';
import { useLocation } from '@/hooks/useLocation';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { floatPlanDestination } from '@/lib/planRequest';
import { useNavigationAction } from '@/hooks/useNavigationAction';
import { readBestIndex } from '@/lib/riverCache';
import { selectSearchRiver, selectSearchLocation, canDefaultToCurrentLocation } from '@/lib/floatSearchSelection';

type Source = 'current' | 'place' | 'access';
type State = {
  input: FloatSearchInput;
  location: string;
  locationSource?: Source;
  result: FloatSearchResponse | null;
  /** The input that produced `result`; a different current input dims it. */
  submitted: FloatSearchInput | null;
  sort: FloatSort;
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
            vesselType: FLOAT_SEARCH_DEFAULT_BOAT,
            publicOnly: true,
            days: 1,
          },
          location: '',
          result: null,
          submitted: null,
          sort: 'best',
        },
  );
  const [rivers, setRivers] = useState<RiverListItem[]>([]);
  const [wherePicker, setWherePicker] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [info, setInfo] = useState<FloatInfoTopic | null>(null);
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
    }, 300);
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
        setState((s) => (s.result === result ? { ...s, result: null, submitted: null } : s));
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
      input: { ...current.input, ...selectSearchLocation(near) } }));
  }, [location.coords, location.status, state.input]);

  /** Changing a choice keeps the last results on screen, dimmed, until Search again. */
  const update = (patch: Partial<FloatSearchInput>) => {
    if ('river' in patch || 'near' in patch) locationChosen.current = true;
    request.current?.abort();
    locationAttempt.current++;
    setBusy(null);
    setError('');
    setLocationError('');
    setExpired(false);
    setState((s) => ({ ...s, input: { ...s.input, ...patch } }));
    if (patch.vesselType) {
      boatChosen.current = true;
      void AsyncStorage.setItem(FLOAT_BOAT_STORAGE_KEY, patch.vesselType).catch(() => {});
    }
  };
  async function run(nextInput = state.input, nextLocation = state.location) {
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
    setState((s) => ({ ...s, input: nextInput, location: nextLocation, result: null, submitted: null }));
    try {
      const result = await fetchFloatSearch(floatSearchRequest(nextInput), controller.signal);
      if (!controller.signal.aborted) setState((s) => ({ ...s, result, submitted: nextInput, sort: 'best' }));
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
      const near = approximateLocation(point);
      setError('');
      setExpired(false);
      // Inside a chosen river, your location orders launches and adds drive times.
      setState((s) => ({
        ...s,
        location: 'Near you',
        locationSource: 'current',
        input: { ...s.input, ...(s.input.river ? { near } : selectSearchLocation(near)) },
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
  const { input, result, submitted } = state;
  const days = input.days ?? 1;
  const stale = Boolean(result && submitted && floatSearchIdentity(submitted) !== floatSearchIdentity(input));
  const shown = submitted ?? input;
  const filterCount = floatFilterCount(input);
  const riverName = (slug?: string) => rivers.find((r) => r.slug === slug)?.name ?? slug ?? '';
  const whereLabel = input.river
    ? state.locationSource === 'access'
      ? state.location
      : input.near && state.locationSource === 'current'
        ? `${riverName(input.river)} · Near you`
        : riverName(input.river)
    : state.location || 'Search for a river, access, or town';
  function card(option: FloatSearchOption) {
    return (
      <FloatSearchCard
        key={option.id}
        option={option}
        riverPhotoUrl={rivers.find((river) => river.slug === option.riverSlug)?.photoUrl ?? undefined}
        onPlan={() => plan(option)}
        onTimeInfo={() => setInfo('time')}
        onDriveInfo={() => setInfo('distance')}
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
  // Dam-regulated rivers cannot be duration-matched, so they are not offered.
  const matchingRivers = rivers.filter(
    (r) => r.riverType !== 'dam_tailwater' && r.name.toLowerCase().includes(townQuery.toLowerCase()),
  );
  const accessPlaces = currentPlaces?.places.filter((place) => place.kind === 'access' && place.river) ?? [];
  const townPlaces = currentPlaces?.places.filter((place) => place.kind !== 'access') ?? [];
  const routes = result ? [...result.matches, ...result.alternatives] : [];
  const sorts = floatSortsFor(routes);
  const recovery = result && submitted && !stale
    ? floatSearchRecoveryOptions(submitted, result, rivers.find((r) => r.slug === submitted.river || r.id === submitted.river))
    : [];
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
            accessibilityLabel={`Where, ${whereLabel}`}
            accessibilityState={{ disabled: busy !== null }}
            style={styles.fieldRow}
          >
            <ControlIcon name="search-outline" size={20} color={colors.interactive} />
            <View style={styles.fieldCopy}>
              {body('Where')}
              {label(whereLabel)}
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
                actions={FLOAT_RADIUS_MILES.map((miles) => ({
                  id: String(miles),
                  title: `Within ${miles} miles`,
                  state: miles === input.radiusMiles ? 'on' : 'off',
                }))}
                onPressAction={({ nativeEvent }) => {
                  const radiusMiles = Number(nativeEvent.event);
                  if ((FLOAT_RADIUS_MILES as readonly number[]).includes(radiusMiles)) update({ radiusMiles });
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
            </>
          ) : null}
        </View>
        <View style={[styles.formGroup, { backgroundColor: colors.card }]}>
          <MenuView
            themeVariant={isDark ? 'dark' : 'light'}
            shouldOpenOnLongPress={false}
            title="Trip length"
            actions={FLOAT_TRIP_DAYS.map((value) => ({
              id: String(value),
              title: floatTripLabel(value),
              state: value === days ? 'on' : 'off',
            }))}
            onPressAction={({ nativeEvent }) => {
              const value = Number(nativeEvent.event) as FloatTripDays;
              if (FLOAT_TRIP_DAYS.includes(value)) update({ days: value });
            }}
          >
            <View
              style={styles.fieldRow}
              accessible
              accessibilityRole="button"
              accessibilityLabel={`Trip length, ${floatTripLabel(days)}`}
            >
              <Text style={[styles.label, { color: colors.text, flex: 1 }]}>Trip length</Text>
              <Text style={[t.base, { color: colors.interactive }]}>{floatTripLabel(days)}</Text>
              <ControlIcon name="chevron-down" size={14} color={colors.interactive} />
            </View>
          </MenuView>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.groupPadding}>
            <View style={styles.between}>
              {label(days > 1 ? 'Time on the river each day' : 'Time on the river')}
              <InfoButton topic="time" onPress={() => setInfo('time')} />
            </View>
            <FloatDurationSlider
              hours={input.targetHours}
              perDay={days > 1}
              onChange={(targetHours) => update({ targetHours })}
            />
          </View>
        </View>
        <View style={[styles.formGroup, { backgroundColor: colors.card }]}>
          <VesselPicker value={input.vesselType} onChange={(vesselType) => update({ vesselType })} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Pressable
            onPress={() => setFiltersOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`Filters, ${filterCount ? `${filterCount} on` : 'none'}`}
            style={styles.fieldRow}
          >
            <ControlIcon name="options-outline" size={20} color={colors.interactive} />
            <Text style={[styles.label, { color: colors.text, flex: 1 }]}>Filters</Text>
            {filterCount ? (
              <View style={[styles.count, { backgroundColor: colors.interactive }]}>
                <Text style={[t.xs, { color: colors.onInteractive, fontFamily: fonts.semibold }]}>{filterCount}</Text>
              </View>
            ) : (
              <Text style={[t.base, { color: colors.textMuted }]}>None</Text>
            )}
            <ControlIcon name="chevron-forward" size={16} color={colors.textSubtle} />
          </Pressable>
        </View>
        {busy === 'location' && <ActivityIndicator color={colors.interactive} />}
        {busy === 'search' && <View onLayout={(event) => {
          if (revealResults.current) {
            revealResults.current = false;
            scroller.current?.scrollTo({ y: event.nativeEvent.layout.y, animated: !reducedMotion });
          }
        }}><FloatSearchLoading /></View>}
        {error ? (
          <Text accessibilityRole="alert" style={[styles.label, { color: colors.text }]}>
            {error}
          </Text>
        ) : null}
        {expired && body(FLOAT_SEARCH_EXPIRED_MESSAGE)}
        {result && (
          <View
            style={[styles.group, stale && styles.stale]}
            pointerEvents={stale ? 'none' : 'auto'}
            accessibilityElementsHidden={stale}
            importantForAccessibility={stale ? 'no-hide-descendants' : 'auto'}
            onLayout={(event) => {
              const y = event.nativeEvent.layout.y;
              if (revealResults.current) {
                revealResults.current = false;
                scroller.current?.scrollTo({ y, animated: !reducedMotion });
              }
            }}
          >
            <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>
              {(shown.days ?? 1) > 1
                ? `${floatTripLabel(shown.days)}, ${floatDurationLabel(shown.targetHours * 60)} a day`
                : `Floats for about ${floatDurationLabel(shown.targetHours * 60)}`}
            </Text>
            <View style={styles.between}>
              {body(
                `Checked ${new Date(result.estimatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`,
              )}
              {routes.length > 1 ? (
                <MenuView
                  themeVariant={isDark ? 'dark' : 'light'}
                  shouldOpenOnLongPress={false}
                  title="Sort"
                  actions={sorts.map((sort) => ({
                    id: sort.value,
                    title: sort.label,
                    state: sort.value === state.sort ? 'on' : 'off',
                  }))}
                  onPressAction={({ nativeEvent }) => {
                    const sort = sorts.find((option) => option.value === nativeEvent.event);
                    if (sort) setState((s) => ({ ...s, sort: sort.value }));
                  }}
                >
                  <View
                    style={styles.sort}
                    accessible
                    accessibilityRole="button"
                    accessibilityLabel={`Sort, ${sorts.find((sort) => sort.value === state.sort)?.label ?? 'Best match'}`}
                  >
                    <ControlIcon name="swap-vertical" size={16} color={colors.interactive} />
                    <Text style={[t.sm, { color: colors.interactive, fontFamily: fonts.semibold }]}>
                      {sorts.find((sort) => sort.value === state.sort)?.label ?? 'Best match'}
                    </Text>
                  </View>
                </MenuView>
              ) : null}
            </View>
            {result.partial
              ? body(result.failed ? 'Some rivers couldn’t be checked.' : 'Showing a selection of routes.')
              : null}
            {result.matches.length === 0 && body(floatSearchEmptyMessage(result))}
            {recovery.map(option => (
              <SearchButton key={option.label} label={option.label} disabled={busy !== null} onPress={() => {
                update(option.input);
                if (option.location) setState(s => ({ ...s, location: option.location!, locationSource: 'place' }));
                void run(option.input, option.location ?? state.location);
              }} />
            ))}
            {sortFloatOptions(result.matches, state.sort).map(card)}
            {result.alternatives.length > 0 && (
              <>
                <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>Shorter or longer</Text>
                {sortFloatOptions(result.alternatives, state.sort).map(card)}
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
            label={busy === 'search' ? 'Finding floats…' : result ? 'Search again' : 'Find floats'}
            primary
            disabled={!canSearch}
            onPress={() => {
              void run();
            }}
          />
        </View>
      </ScreenSafeAreaView>
      {info ? <FloatInfoSheet topic={info} onClose={() => setInfo(null)} /> : null}
      {filtersOpen ? (
        <FloatFiltersSheet input={input} onChange={update} onClose={() => setFiltersOpen(false)} />
      ) : null}
      <Modal
        visible={wherePicker}
        presentationStyle="pageSheet"
        animationType={reducedMotion ? 'none' : 'slide'}
        allowSwipeDismissal
        onRequestClose={closePicker}
      >
        <SafeAreaProvider>
          <SafeAreaView
            style={[styles.screen, { backgroundColor: colors.sheetGrouped }]}
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
                  selected={state.locationSource === 'current' && !!input.near}
                  disabled={busy !== null}
                  onPress={() => void locate()}
                />
                {locationError ? <Text accessibilityRole="alert" style={[t.sm, { color: colors.text }]}>{locationError}</Text> : null}
                <TextInput
                  accessibilityLabel="Search for a river, access, or town"
                  placeholder="River, access, or town"
                  placeholderTextColor={colors.textSubtle}
                  value={query}
                  maxLength={120}
                  style={inputStyle}
                  autoCorrect={false}
                  autoFocus
                  clearButtonMode="while-editing"
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
                      // Your own location stays for drive times; a town never does.
                      const keep = state.locationSource === 'current' ? input.near : undefined;
                      update(selectSearchRiver(river.slug, keep));
                      setState((s) => ({ ...s, location: keep ? 'Near you' : '', locationSource: keep ? 'current' : undefined }));
                      closePicker();
                    }}
                  />
                ))}
                {!matchingRivers.length
                  ? body(
                      rivers.length
                        ? 'No matching rivers.'
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
                    {!currentPlaces ? (
                      <ActivityIndicator accessibilityLabel="Searching accesses and towns" color={colors.interactive} />
                    ) : currentPlaces.error ? (
                      body(currentPlaces.error)
                    ) : !currentPlaces.places.length ? (
                      body('No accesses or towns found. Add a state or try another name.')
                    ) : null}
                    {accessPlaces.length ? (
                      <Text accessibilityRole="header" style={[styles.label, { color: colors.text }]}>
                        Accesses
                      </Text>
                    ) : null}
                    {accessPlaces.map((place) => (
                      <SearchButton
                        key={place.id}
                        label={place.riverName ? `${place.name} · ${place.riverName}` : place.name}
                        onPress={() => {
                          update({ river: place.river, near: place.near });
                          setState((s) => ({
                            ...s,
                            location: place.riverName ? `${place.name} · ${place.riverName}` : place.name,
                            locationSource: 'access',
                          }));
                          closePicker();
                        }}
                      />
                    ))}
                    {townPlaces.length ? (
                      <Text accessibilityRole="header" style={[styles.label, { color: colors.text }]}>
                        Towns
                      </Text>
                    ) : null}
                    {townPlaces.map((place) => (
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
                    {townPlaces.length ? (
                      <Text
                        onPress={() => void openExternalLink('https://www.mapbox.com/about/maps/')}
                        accessibilityRole="link"
                        style={[t.xs, { color: colors.textMuted }]}
                      >
                        Town search © Mapbox
                      </Text>
                    ) : null}
                  </>
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
  sort: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingLeft: 12 },
  stale: { opacity: 0.4 },
  count: { minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' },
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
