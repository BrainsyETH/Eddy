import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
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
import {
  fetchFloatSearch,
  fetchFloatSearchPlaces,
  fetchRivers,
} from '@/api/client';
import { useLocation } from '@/hooks/useLocation';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { newPlanRequest } from '@/lib/planRequest';

type State = {
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
  const { colors } = useTheme();
  const location = useLocation();
  const [state, setState] = useState<State>(() =>
    previous && (!initialRiver || previous.river === initialRiver)
      ? { ...previous.state, result: previous.state.result && floatSearchIsFresh(previous.state.result) ? previous.state.result : null }
      : {
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
  const [riverQuery, setRiverQuery] = useState('');
  const [places, setPlaces] = useState<FloatSearchPlace[] | null>(null);
  const [busy, setBusy] = useState<'town' | 'search' | 'location' | null>(null);
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(() => Boolean(previous && (!initialRiver || previous.river === initialRiver) && previous.state.result && !floatSearchIsFresh(previous.state.result)));
  const request = useRef<AbortController | null>(null);
  const locationAttempt = useRef(0);
  const scroll = useRef(0);
  const restoreScroll = useRef(
    previous && (!initialRiver || previous.river === initialRiver) && previous.state.result && floatSearchIsFresh(previous.state.result)
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
          if (
            !controller.signal.aborted &&
            FLOAT_BOATS.includes(boat as FloatBoat)
          )
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
  useFocusEffect(useCallback(() => {
    const result = state.result;
    if (!result) return;
    const expire = () => {
      if (floatSearchIsFresh(result)) return;
      setState(s => s.result === result ? { ...s, result: null } : s);
      setExpired(true);
    };
    expire();
    const timer = setTimeout(expire, Math.max(0, Date.parse(result.estimatedAt) + FLOAT_SEARCH_MAX_AGE_MS - Date.now()));
    const subscription = AppState.addEventListener('change', value => { if (value === 'active') expire(); });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, [state.result]));
  const update = (patch: Partial<FloatSearchInput>) => {
    request.current?.abort();
    locationAttempt.current++;
    setBusy(null);
    setError('');
    setExpired(false);
    setState((s) => ({ ...s, input: { ...s.input, ...patch }, result: null }));
    if (patch.vesselType)
      void AsyncStorage.setItem(FLOAT_BOAT_STORAGE_KEY, patch.vesselType).catch(
        () => {},
      );
  };
  async function run(kind: 'town' | 'search') {
    if (kind === 'search') setExpired(false);
    request.current?.abort();
    locationAttempt.current++;
    const controller = new AbortController();
    request.current = controller;
    setBusy(kind);
    setError('');
    if (kind === 'search') setState((s) => ({ ...s, result: null }));
    else setPlaces(null);
    try {
      if (kind === 'town') {
        const data = await fetchFloatSearchPlaces(
          state.town,
          controller.signal,
        );
        if (!controller.signal.aborted) setPlaces(data.places);
      } else {
        const input = {
          ...state.input,
          near: state.input.near
            ? approximateLocation(state.input.near)
            : undefined,
        };
        const result = await fetchFloatSearch(input, controller.signal);
        if (!controller.signal.aborted) setState((s) => ({ ...s, result }));
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error
            ? e.message
            : 'Search could not finish. Please try again.',
        );
    } finally {
      if (!controller.signal.aborted) setBusy(null);
    }
  }
  async function locate() {
    request.current?.abort();
    const attempt = ++locationAttempt.current;
    setBusy('location');
    setError('');
    const point = await location.request();
    if (attempt !== locationAttempt.current) return;
    if (point) {
      setState((s) => ({
        ...s,
        location: 'Your approximate location',
        input: { ...s.input, near: approximateLocation(point) },
        result: null,
      }));
      setPlaces(null);
    } else setError('Location is unavailable. Choose a town or a river.');
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

  const label = (text: string) => (
    <Text style={[styles.label, { color: colors.text }]}>{text}</Text>
  );
  const body = (text: string) => (
    <Text style={[t.sm, { color: colors.textMuted }]}>{text}</Text>
  );
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
      <View
        key={o.id}
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        {o.photo && (
          <View style={styles.group}>
            <Image
              source={{ uri: o.photo.url }}
              accessibilityLabel={o.photo.caption}
              style={{ height: 160, width: '100%', borderRadius: 12 }}
            />
            {body(o.photo.caption)}
          </View>
        )}
        <Text style={[styles.label, { color: colors.interactive }]}>
          {o.riverName}
        </Text>
        <Text style={[styles.heading, { color: colors.text }]}>
          {o.putIn.name} → {o.takeOut.name}
        </Text>
        <Text style={[styles.label, { color: colors.text }]}>
          {floatRangeLabel(o.timeRange)}
          {o.relation === 'match' ? '' : ` · ${o.relation} option`}
        </Text>
        {body(
          `${o.distanceMiles.toFixed(1)} river miles`,
        )}
        {body(
          `About ${Math.round(o.minutes / 6) / 10} hours with stops · ${o.estimateBasis === 'current_conditions' ? 'Current conditions' : 'Typical conditions'}`,
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
        {
          <SearchButton
            label={'Plan this float'}
            onPress={() => plan(o)}
            selected={true}
          />
        }
      </View>
    );
  }
  return (
    <ScrollView
      ref={scroller}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={styles.content}
      scrollEventThrottle={100}
      onScroll={(e) => {
        scroll.current = e.nativeEvent.contentOffset.y;
      }}
      onContentSizeChange={() => {
        if (restoreScroll.current) {
          scroller.current?.scrollTo({
            y: restoreScroll.current,
            animated: false,
          });
          restoreScroll.current = 0;
        }
      }}
    >
      <Text style={[styles.title, { color: colors.text }]}>
        Your next stretch
      </Text>
      {body('Find a float that fits your time, boat, and a place to start.')}
      {label('Where would you like to go?')}
      {
        <SearchButton
          label={
            busy === 'location' ? 'Finding your location…' : 'Use my location'
          }
          onPress={() => {
            void locate();
          }}
          selected={false}
          disabled={busy !== null}
        />
      }
      <TextInput
        accessibilityLabel="Town and state"
        placeholder="Or enter a town and state"
        placeholderTextColor={colors.textSubtle}
        value={state.town}
        maxLength={120}
        style={inputStyle}
        onChangeText={(town) => {
          request.current?.abort();
          setBusy(null);
          setPlaces(null);
          setState((s) => ({ ...s, town }));
        }}
        returnKeyType="search"
        onSubmitEditing={() => {
          if (state.town.trim().length >= 2) void run('town');
        }}
      />
      {
        <SearchButton
          label={busy === 'town' ? 'Searching towns…' : 'Find town'}
          onPress={() => {
            void run('town');
          }}
          selected={false}
          disabled={busy !== null || state.town.trim().length < 2}
        />
      }
      {places && (
        <View style={styles.group}>
          {places.length === 0 &&
            body('No towns found. Add a state and try again.')}
          {places.map((place) => (
            <SearchButton
              key={place.id}
              label={place.name}
              onPress={() => {
                update({ near: place.near });
                setState((s) => ({
                  ...s,
                  location: place.name,
                  town: place.name,
                }));
                setPlaces(null);
              }}
            />
          ))}
          <Text
            onPress={() =>
              void Linking.openURL('https://www.mapbox.com/about/maps/')
            }
            accessibilityRole="link"
            style={[t.xs, { color: colors.textMuted }]}
          >
            Town search © Mapbox
          </Text>
        </View>
      )}
      {input.near && (
        <View style={styles.group}>
          {label(state.location)}
          {
            <SearchButton
              label={'Clear location'}
              onPress={() => update({ near: undefined })}
            />
          }
        </View>
      )}
      {body(
        'Eddy uses an approximate location. Miles are measured to the put-in, not by road.',
      )}
      {label('About how long?')}
      <View style={styles.row}>
        {
          <SearchButton
            label={'− ½ hour'}
            onPress={() => update({ targetHours: input.targetHours - 0.5 })}
            selected={false}
            disabled={input.targetHours <= 0.5}
          />
        }
        <Text
          accessibilityRole="text"
          accessibilityLiveRegion="polite"
          style={[styles.label, { color: colors.text }]}
        >
          {input.targetHours} hours
        </Text>
        {
          <SearchButton
            label={'+ ½ hour'}
            onPress={() => update({ targetHours: input.targetHours + 0.5 })}
            selected={false}
            disabled={input.targetHours >= 12}
          />
        }
      </View>
      {label('Your boat')}
      <View style={styles.row}>
        {FLOAT_BOATS.map((boat) => (
          <SearchButton
            key={boat}
            label={boat[0].toUpperCase() + boat.slice(1)}
            onPress={() => update({ vesselType: boat })}
            selected={input.vesselType === boat}
          />
        ))}
      </View>
      {label('Within')}
      <View style={styles.row}>
        {[25, 50, 100, 150, 200, 300].map((radiusMiles) => (
          <SearchButton
            key={radiusMiles}
            label={`${radiusMiles} mi`}
            onPress={() => update({ radiusMiles })}
            selected={input.radiusMiles === radiusMiles}
            disabled={!input.near || Boolean(input.river)}
          />
        ))}
      </View>
      {input.river && body('Searching the selected river at any distance.')}
      {label('River (optional)')}
      {
        <SearchButton
          label={
            rivers.find((r) => r.slug === input.river)?.name ??
            input.river ??
            'All nearby rivers'
          }
          onPress={() => setRiverPicker((p) => !p)}
        />
      }
      {riverPicker && (
        <View style={styles.group}>
          <TextInput
            accessibilityLabel="Filter rivers"
            placeholder="River name"
            placeholderTextColor={colors.textSubtle}
            value={riverQuery}
            onChangeText={setRiverQuery}
            style={inputStyle}
          />
          {
            <SearchButton
              label={'All nearby rivers'}
              onPress={() => {
                update({ river: undefined });
                setRiverPicker(false);
              }}
            />
          }
          {rivers
            .filter((r) =>
              r.name.toLowerCase().includes(riverQuery.toLowerCase()),
            )
            .map((r) => (
              <SearchButton
                key={r.id}
                label={r.name}
                onPress={() => {
                  update({ river: r.slug });
                  setRiverPicker(false);
                }}
              />
            ))}
          {rivers.length === 0 &&
            body('The river list is unavailable. Try location or town search.')}
        </View>
      )}
      <View style={styles.row}>
        <Switch
          accessibilityLabel="Public put-ins and take-outs only"
          value={input.publicOnly}
          onValueChange={(publicOnly) => update({ publicOnly })}
        />
        <Text style={[t.sm, { color: colors.text }]}>
          Public endpoints only
        </Text>
      </View>
      {body(
        'Time includes ordinary stops. A 4–7 hour float can match a 5 hour request.',
      )}
      {
        <SearchButton
          label={busy === 'search' ? 'Checking floats…' : 'Find floats'}
          onPress={() => {
            void run('search');
          }}
          selected={true}
          disabled={busy !== null || (!input.near && !input.river)}
        />
      }
      {busy && <ActivityIndicator color={colors.interactive} />}
      {error ? (
        <Text
          accessibilityRole="alert"
          style={[styles.label, { color: colors.text }]}
        >
          {error}
        </Text>
      ) : null}
      {expired && body(FLOAT_SEARCH_EXPIRED_MESSAGE)}
      {result && (
        <View style={styles.group}>
          <Text style={[styles.heading, { color: colors.text }]}>
            Floats for about {input.targetHours} hours
          </Text>
          {body(
            `Checked ${new Date(result.estimatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. Conditions can change.`,
          )}
          {floatSearchUsedProximity(result) && body(FLOAT_SEARCH_PROXIMITY_NOTE)}
          {result.partial &&
            body(
              `${result.failed ? 'Some river data was unavailable. ' : ''}This is a partial search. Try again or choose a river for a closer look.`,
            )}
          {result.matches.length === 0 &&
            body(
              floatSearchEmptyMessage(result),
            )}
          {result.matches.map(card)}
          {result.alternatives.length > 0 && (
            <>
              <Text style={[styles.heading, { color: colors.text }]}>
                Shorter or longer alternatives
              </Text>
              {body(`These ranges do not include ${input.targetHours} hours.`)}
              {result.alternatives.map(card)}
            </>
          )}
        </View>
      )}
    </ScrollView>
  );
}

function SearchButton({
  label,
  onPress,
  selected = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          borderColor: colors.border,
          backgroundColor: selected ? colors.accentFill : colors.card,
          opacity: disabled || pressed ? 0.5 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          { color: selected ? colors.onAccent : colors.interactive },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40, gap: 14 },
  title: { ...t['3xl'], fontFamily: fonts.display },
  heading: { ...t.xl, fontFamily: fonts.heading },
  label: { ...t.base, fontFamily: fonts.semibold },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  group: { gap: 12 },
  card: { borderWidth: 1, borderRadius: 18, padding: 18, gap: 10 },
  button: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 46,
    justifyContent: 'center',
  },
  buttonText: { ...t.sm, fontFamily: fonts.semibold },
  input: { ...t.base, borderWidth: 1, borderRadius: 12, padding: 14 },
});
