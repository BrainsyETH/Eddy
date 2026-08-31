// eddy-ios/src/components/FirstRunPicker.tsx
// Pane 2 of first run: pick the rivers you float.
//
// ── This screen is the tutorial, which is why there isn't one ───────────────
//
// Every card carries its river's LIVE condition — the coloured dot, the reading,
// and the word for it, side by side. Six of them at once is the whole condition
// ladder, shown rather than explained, and somebody who has never seen a gauge
// in their life has read it before they make a single choice. That is the entire
// education budget for onboarding, and it is spent on a screen the user wanted
// to be on anyway.
//
// The alternative — a legend, a carousel, a "here's how Eddy works" pane — costs
// screens before the app and teaches less, because nothing on it is about a
// river the person actually cares about.
//
// ── It has to be worth the tap, so the picks do real work ──────────────────
//
// Picks become stars. Today opens filtered to them, Favorites has rows on day
// one, and the alert flow has something to offer. Without that this pane is a
// survey, and a survey before an app is exactly the fatigue we are avoiding.
//
// ── What is deliberately NOT here ──────────────────────────────────────────
//
// No push permission ask — PushPrimer owns that prompt and spends it at a moment
// where the answer is obvious (see src/lib/push.ts). No sign-in. No paywall. No
// progress dots: the flow is two panes and the legal one cannot carry a dot, so
// a three-dot rail would promise screens that do not exist. "Not now" is the one
// escape hatch, in the footer where the decision is being made.
//
// ── The CTA is teal, not the coral in the mockup ───────────────────────────
//
// palette.ts spells out why at length: coral collides with `dangerous` and
// `high` on the condition ladder. On THIS screen — six condition colours in a
// grid — a red-orange button would be the loudest warning-coloured object on a
// screen full of actual warnings, and it would be the one asking for a tap.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import type { RiverListItem } from '@eddy/types';
import { Otter } from '@/components/Otter';
import { useLocation } from '@/hooks/useLocation';
import { useStarredRivers } from '@/hooks/useStarredRivers';
import { fetchGauges, fetchRivers } from '@/api/client';
import { readBestIndex } from '@/lib/riverCache';
import { pickFirstRunRivers } from '@/lib/firstRunRivers';
import { riverDistanceLabel, riverMilesByGauge } from '@/lib/riverDistance';
import { primaryReading } from '@/lib/readingCopy';
import { report, warn } from '@/lib/monitoring';
import { useTheme } from '@/theme/ThemeProvider';
import { conditionColor, conditionShortLabel } from '@/theme/conditions';
import { fonts, type as t } from '@/theme/typography';

/** Reverse geocoding is best-effort chrome; this is the honest fallback. */
const NEARBY_FALLBACK = 'Rivers nearest you';

interface Props {
  /** Finish — followed or skipped. The gate records completion and moves on. */
  onDone: () => void;
  /**
   * The catalog is unreachable and nothing is cached. There is no demonstration
   * to make without live conditions, so the gate skips this pane entirely rather
   * than showing an empty grid — see OnboardingGate.
   */
  onUnavailable: () => void;
}

export function FirstRunPicker({ onDone, onUnavailable }: Props) {
  const { colors } = useTheme();
  const { followStars } = useStarredRivers();
  const location = useLocation();

  const [rivers, setRivers] = useState<RiverListItem[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [distances, setDistances] = useState<Map<string, number> | null>(null);
  const [placeName, setPlaceName] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);

  // onUnavailable would otherwise be a dependency that re-runs the fetch when
  // the gate re-renders, and the gate re-renders on every step change.
  const unavailable = useRef(onUnavailable);
  useEffect(() => {
    unavailable.current = onUnavailable;
  }, [onUnavailable]);

  // Cache first, network second. Someone reinstalling in a canyon still gets a
  // grid, and the request is the same CDN-cached one Today makes.
  //
  // readBestIndex rather than readIndex, because the sentence above was only
  // true on a REINSTALL that had run online once before. A genuinely fresh
  // install has no stored /api/rivers list, so the one screen that cannot be
  // skipped had nothing to draw and called onUnavailable. The launch bundle's
  // seeded index answers "which rivers exist", which is all this grid asks.
  useEffect(() => {
    let active = true;

    void (async () => {
      const cached = (await readBestIndex())?.payload ?? null;
      const haveCache = cached != null && cached.length > 0;
      if (active && haveCache) setRivers(cached);

      try {
        const fresh = await fetchRivers();
        if (active && fresh.length > 0) {
          setRivers(fresh);
          return;
        }
      } catch (error) {
        warn('cache', 'first-run rivers unavailable', error);
      }

      // Nothing live and nothing cached: there is no product to show.
      if (active && !haveCache) unavailable.current();
    })();

    return () => {
      active = false;
    };
  }, []);

  const featured = useMemo(
    () => (rivers ? pickFirstRunRivers(rivers, distances) : []),
    [rivers, distances],
  );

  const toggle = useCallback((id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /**
   * The location ask, and the only thing on this screen that can prompt.
   *
   * useLocation never prompts on mount — its `idle` state is documented as the
   * only one where a tap shows the dialog — so this is an explicit request with
   * a visible reason attached, which is the whole argument for asking here
   * rather than cold on the map later.
   */
  const showNearby = useCallback(async () => {
    if (locating) return;
    setLocating(true);
    try {
      // Gauges are a second request, and the only reason for it is this tap —
      // /api/rivers carries no coordinates. Never fetched on open.
      //
      // STARTED BEFORE the location is awaited, not after. It needs no
      // coordinates — only riverMilesByGauge does — and the two slowest things
      // behind this chip were running one after the other: a cold GPS fix, and
      // then a network round trip. They overlap now, so the wait is the longer
      // of the two rather than their sum.
      //
      // The cost of being wrong is one CDN-cached request on a tap the user
      // declines, which is the right side of that trade — and the promise is
      // caught here so a rejection cannot go unhandled while the permission
      // dialog is still up.
      const gaugesPromise = fetchGauges().catch((error) => {
        warn('map', 'first-run gauges unavailable', error);
        return null;
      });

      const coords = await location.request();
      if (!coords) return; // Denied or unavailable; the chip renders the state.

      const gauges = await gaugesPromise;
      if (gauges) setDistances(riverMilesByGauge(gauges, coords));

      // Naming the place is what makes this feel like a reason rather than a
      // permission grab. Entirely optional: a failure leaves the fallback copy
      // and the distances still work.
      try {
        const [place] = await Location.reverseGeocodeAsync({
          latitude: coords.lat,
          longitude: coords.lng,
        });
        const city = place?.city ?? place?.subregion ?? null;
        if (city) setPlaceName(place?.region ? `${city}, ${place.region}` : city);
      } catch (error) {
        warn('map', 'first-run reverse geocode failed', error);
      }
    } catch (error) {
      warn('map', 'first-run nearby lookup failed', error);
    } finally {
      setLocating(false);
    }
  }, [location, locating]);

  const follow = useCallback(() => {
    if (saving || selected.size === 0) return;
    setSaving(true);
    try {
      // followStars, not toggleStar in a loop: a signed-in reinstall may already
      // hold some of these, and a toggle would unstar exactly the rivers the
      // user just pressed a button to follow. See addStars in @eddy/sync.
      followStars(
        featured
          .filter((river) => selected.has(river.id))
          .map((river) => ({
            kind: 'river' as const,
            entityId: river.id,
            name: river.name,
            slug: river.slug,
            usgsSiteId: null,
          })),
      );
    } catch (error) {
      // The stars are local-first and persisted optimistically; there is no
      // recoverable failure here worth trapping someone on this pane for.
      report(error, { operation: 'firstRun.follow' });
    } finally {
      setSaving(false);
      onDone();
    }
  }, [saving, selected, featured, followStars, onDone]);

  const count = selected.size;
  const locationChip = describeLocationChip(location.status, placeName, locating, distances != null);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Otter mood="green" size={78} />
        <Text style={[styles.title, { color: colors.text }]}>Which water do you float?</Text>
        <Text style={[styles.copy, { color: colors.textMuted }]}>
          Pick a few and Eddy opens on them, every time. You can change this whenever.
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={locationChip.accessibilityLabel}
          accessibilityState={{ disabled: !locationChip.actionable }}
          onPress={locationChip.actionable ? () => void showNearby() : undefined}
          disabled={!locationChip.actionable}
          hitSlop={6}
          style={({ pressed }) => [
            styles.chip,
            {
              backgroundColor: locationChip.actionable ? colors.selectionBg : 'transparent',
              borderColor: colors.border,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          {locating ? (
            <ActivityIndicator size="small" color={colors.interactive} />
          ) : (
            <Ionicons
              name="location-outline"
              size={15}
              color={locationChip.actionable ? colors.interactive : colors.textSubtle}
            />
          )}
          <Text
            style={[
              styles.chipText,
              { color: locationChip.actionable ? colors.selectionText : colors.textSubtle },
            ]}
          >
            {locationChip.label}
          </Text>
        </Pressable>

        {rivers == null ? (
          <ActivityIndicator style={styles.loading} color={colors.interactive} />
        ) : (
          <View style={styles.grid}>
            {featured.map((river) => (
              <RiverPickCard
                key={river.id}
                river={river}
                miles={distances?.get(river.id) ?? null}
                selected={selected.has(river.id)}
                onPress={() => toggle(river.id)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: count === 0 || saving }}
          onPress={follow}
          disabled={count === 0 || saving}
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: count === 0 ? colors.border : colors.accentFill,
              opacity: pressed && count > 0 ? 0.8 : 1,
            },
          ]}
        >
          <Text
            style={[
              styles.buttonText,
              { color: count === 0 ? colors.textSubtle : colors.onAccent },
            ]}
          >
            {count === 0 ? 'Follow rivers' : count === 1 ? 'Follow 1 river' : `Follow ${count} rivers`}
          </Text>
        </Pressable>

        {/* Muted ink, and a real option — the same discipline PushPrimer applies
            to a permission it can only spend once. Never disabled, never gated
            on the grid having loaded. */}
        <Pressable accessibilityRole="button" onPress={onDone} hitSlop={10} style={styles.skip}>
          <Text style={[styles.skipText, { color: colors.textMuted }]}>Not now</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

/**
 * The chip says what it will do, or what happened when it did it.
 *
 * ── It reads `hasDistances`, NOT the permission status ─────────────────────
 *
 * useLocation restores a granted fix from a previous session as `remembered`,
 * so on a reinstall the status can say we know where you are before this pane
 * has fetched a single gauge. Keying the label on that would put "Nearest to
 * Rolla" above a grid that is still the untouched default six — a claim about
 * the list that the list does not honour.
 *
 * The grid is only sorted by distance once `distances` exists, so that is the
 * only thing allowed to say it is.
 */
function describeLocationChip(
  status: ReturnType<typeof useLocation>['status'],
  placeName: string | null,
  locating: boolean,
  hasDistances: boolean,
): { label: string; actionable: boolean; accessibilityLabel: string } {
  if (locating) {
    return { label: 'Finding you…', actionable: false, accessibilityLabel: 'Finding your location' };
  }
  if (hasDistances) {
    const label = placeName ? `Nearest to ${placeName}` : NEARBY_FALLBACK;
    return { label, actionable: true, accessibilityLabel: `${label}. Tap to update.` };
  }
  if (status === 'denied') {
    // No "Open Settings" here. Sending somebody into iOS Settings before they
    // have seen the app is a worse outcome than six good default rivers, and
    // Today already offers that recovery where it actually matters.
    return {
      label: 'Location off — showing popular rivers',
      actionable: false,
      accessibilityLabel: 'Location is off. Showing popular rivers instead.',
    };
  }
  if (status === 'unavailable') {
    return {
      label: "Couldn't find you — showing popular rivers",
      actionable: true,
      accessibilityLabel: 'Could not find your location. Tap to try again.',
    };
  }
  return {
    label: 'Show rivers near me',
    actionable: true,
    accessibilityLabel: 'Show rivers near me',
  };
}

function RiverPickCard({
  river,
  miles,
  selected,
  onPress,
}: {
  river: RiverListItem;
  miles: number | null;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const code = river.currentCondition?.code ?? 'unknown';
  const reading = river.currentCondition ? primaryReading(river.currentCondition) : null;

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${river.name}, ${conditionShortLabel(code)}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: selected ? colors.selectionBg : colors.card,
          borderColor: selected ? colors.interactive : colors.border,
          borderWidth: selected ? 2 : 1,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={styles.cardTop}>
        {/* The dot and its word, adjacent. This pairing is the lesson. */}
        <View style={[styles.dot, { backgroundColor: conditionColor(code) }]} />
        {selected ? (
          <Ionicons name="checkmark-circle" size={20} color={colors.interactive} />
        ) : null}
      </View>

      <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={2}>
        {river.name}
      </Text>

      <Text style={[styles.cardReading, { color: conditionColor(code) }]} numberOfLines={1}>
        {reading ? `${formatReading(reading.value)} ${reading.unit} · ` : ''}
        {conditionShortLabel(code)}
      </Text>

      {miles != null ? (
        <Text style={[styles.cardMeta, { color: colors.textSubtle }]} numberOfLines={1}>
          {riverDistanceLabel(miles)}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Stage in hundredths, discharge whole — how each is read in the field. */
function formatReading(value: number): string {
  return value >= 100 ? String(Math.round(value)) : value.toFixed(2);
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24, alignItems: 'center' },
  title: { ...t['2xl'], fontFamily: fonts.displayBold, textAlign: 'center', marginTop: 10 },
  copy: { ...t.sm, fontFamily: fonts.body, textAlign: 'center', marginTop: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 14,
    marginTop: 18,
    minHeight: 38,
  },
  chipText: { ...t.sm, fontFamily: fonts.semibold },
  loading: { marginTop: 40 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 18,
    width: '100%',
  },
  card: {
    // Two columns with a 10px gutter. Percentage rather than a measured width so
    // it holds on every device and at every Dynamic Type size.
    width: '48%',
    flexGrow: 1,
    borderRadius: 14,
    padding: 12,
    minHeight: 104,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 20 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  cardName: { ...t.base, fontFamily: fonts.semibold, marginTop: 6 },
  cardReading: { ...t.sm, fontFamily: fonts.monoMedium, marginTop: 4 },
  cardMeta: { ...t.xs, fontFamily: fonts.body, marginTop: 4 },
  footer: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6, borderTopWidth: 1 },
  button: { borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  buttonText: { ...t.base, fontFamily: fonts.semibold },
  skip: { alignSelf: 'center', paddingVertical: 14, paddingHorizontal: 24 },
  skipText: { ...t.sm, fontFamily: fonts.semibold },
});
