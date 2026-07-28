// eddy-ios/app/gauge/[siteId].tsx
// One gauge: what it reads, what that means, and how it got there.
//
// ── The screen that was missing ────────────────────────────────────────────
// A gauge was a dead end everywhere in this app. The Favorites row said so in
// its own header — "there is no gauge detail screen, and inventing one for this
// would be the wrong order of work" — so a starred station showed a number and
// went nowhere. The national tier had a callout whose only destination was
// waterdata.usgs.gov, which is to say: out of Eddy.
//
// ── ONE screen for both tiers ──────────────────────────────────────────────
// Not two. The app maintains a hard distinction between a gauge Eddy has RATED
// — which gets a condition, a ladder and a verdict — and a reference gauge,
// which gets a flow band, a comparison to its own history, and no verdict at
// all. That distinction is about what may be SAID, not about what kind of page
// it is said on, and splitting the screen would have made "is this station
// curated" an answer you get by noticing which layout you landed in.
//
// So the branch lives inside: `curated` picks the vocabulary, and everything
// structural — the reading, the chart, the age, the star, the source link — is
// the same on both. See the `verdict` block below for where the two diverge.
//
// ── It opens with what the last screen already knew ────────────────────────
// Every route in here comes from a surface that was showing this gauge's
// reading. The seed (src/lib/gaugeSeed.ts) carries it across so the screen
// paints immediately and refines in place; a deep link has no seed and takes
// the ordinary loading path, which is why that path is the plain one rather
// than the exception.

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { GaugeDetail, GaugeDetailThreshold } from '@eddy/types';
import { classifyReading, hasLadder } from '@eddy/conditions/condition-ladder';
import { flowBand } from '@eddy/conditions/flow-band';
import { fetchGaugeDetail } from '@/api/client';
import {
  conditionBg,
  conditionChipBorder,
  conditionInk,
  conditionLongLabel,
  conditionText,
} from '@/theme/conditions';
import { flowBandChip, flowBandLabel, flowBandSentence } from '@/theme/flow';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { formatReading, percentileLabel, readingAge } from '@/lib/readingCopy';
import { usgsGaugeUrl } from '@/lib/directions';
import { recallGauge, rememberGauge, seedFromDetail, type GaugeSeed } from '@/lib/gaugeSeed';
import { GaugeChart } from '@/components/GaugeChart';
import { ReadingScale } from '@/components/ReadingScale';
import { Otter, otterForCondition } from '@/components/Otter';
import { useStarredRivers } from '@/hooks/useStarredRivers';

/**
 * The unit to lead with, and to draw the chart in.
 *
 * A rated station follows its LADDER, always — showing cfs against a ft ladder
 * produces a number that does not correspond to the verdict beside it, which is
 * the rule every reading in this app obeys. An unrated one has no ladder to
 * obey, so discharge wins: that is what the percentile is computed from, so the
 * number and the band describe the same quantity.
 */
function displayUnit(gauge: GaugeSeed, link: GaugeDetailThreshold | null): 'ft' | 'cfs' | null {
  if (link) {
    if (link.thresholdUnit === 'cfs') return gauge.dischargeCfs != null ? 'cfs' : null;
    return gauge.gaugeHeightFt != null ? 'ft' : null;
  }
  if (gauge.dischargeCfs != null) return 'cfs';
  if (gauge.gaugeHeightFt != null) return 'ft';
  return null;
}

function readingValue(gauge: GaugeSeed, unit: 'ft' | 'cfs' | null): number | null {
  if (unit === 'cfs') return gauge.dischargeCfs;
  if (unit === 'ft') return gauge.gaugeHeightFt;
  return null;
}

export default function GaugeDetailScreen() {
  const { siteId } = useLocalSearchParams<{ siteId: string }>();
  const router = useRouter();
  const { colors, elevation, isDark } = useTheme();
  const { isStarred, toggleStar } = useStarredRivers();

  // Seeded synchronously from whatever opened this screen, so the first frame
  // has the reading on it. Null on a deep link, which is the loading path.
  const [gauge, setGauge] = useState<GaugeSeed | null>(() => recallGauge(siteId));
  const [loading, setLoading] = useState(!gauge);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!siteId) return;
    const controller = new AbortController();

    void (async () => {
      const detail: GaugeDetail | null = await fetchGaugeDetail(siteId, controller.signal);
      if (controller.signal.aborted) return;

      if (detail) {
        const seed = seedFromDetail(detail);
        setGauge(seed);
        // Cache the fuller record so coming back within the session opens on
        // the ladder rather than on the pin's thinner copy.
        rememberGauge(seed);
      } else {
        // NOT an error when we already have a seed. The endpoint is newer than
        // some deployed builds of the website this app talks to, and a screen
        // that blanks a reading it is already displaying because a refinement
        // 404'd is worse than one that quietly shows less. Only a screen with
        // nothing at all has failed.
        setFailed((prev) => prev || !recallGauge(siteId));
      }
      setLoading(false);
    })();

    return () => controller.abort();
  }, [siteId]);

  if (loading && !gauge) {
    return (
      <SafeAreaView style={[styles.screen, styles.centre, { backgroundColor: colors.bg }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color={colors.accent} />
      </SafeAreaView>
    );
  }

  if (!gauge) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.navRow}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </Pressable>
        </View>
        <View style={[styles.centre, styles.emptyBody]}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {failed ? 'Gauge unavailable' : 'Gauge not found'}
          </Text>
          <Text style={[styles.emptyBodyText, { color: colors.textMuted }]}>
            {failed
              ? 'Could not reach the gauge record. Check your connection and try again.'
              : `No station is published under ${siteId}.`}
          </Text>
          {usgsGaugeUrl(siteId) ? (
            <Pressable
              onPress={() => void Linking.openURL(usgsGaugeUrl(siteId)!)}
              style={({ pressed }) => [
                styles.sourceButton,
                { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
              ]}
              accessibilityRole="button"
            >
              <Text style={[styles.sourceText, { color: colors.text }]}>Open on USGS</Text>
            </Pressable>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  // ── The two vocabularies ──────────────────────────────────────────────────
  // `link` is the ladder to grade against, primary first — /api/gauges/[siteId]
  // sorts it that way so [0] is the association the app should navigate to.
  const link = gauge.thresholds?.[0] ?? null;
  const rated = Boolean(link && hasLadder(link));

  const unit = displayUnit(gauge, link);
  const value = readingValue(gauge, unit);

  // A suspect reading is displayed beside its caveat and is never graded — the
  // identical rule gaugeConditionCode and flowBandFor both apply before they
  // will colour anything.
  const code =
    rated && link && !gauge.readingSuspect
      ? classifyReading(gauge.gaugeHeightFt, link, gauge.dischargeCfs, { strictUnit: true })
      : 'unknown';

  const band = gauge.readingSuspect ? null : flowBand(gauge.flowPercentile);
  const bandChip = flowBandChip(band, colors);

  const age = readingAge(gauge.readingAgeHours);
  const percentile = percentileLabel(gauge.flowPercentile);
  const starred = gauge.id ? isStarred('gauge', gauge.id) : false;
  const source = usgsGaugeUrl(gauge.siteId);

  // A plain function, not a useCallback: everything above it is guarded by
  // early returns, and a hook below one of those is a hook that does not run in
  // the same order every render. Nothing here is memo-sensitive — it is one
  // Pressable's handler.
  const onToggleStar = () => {
    if (!gauge.id) return;
    toggleStar({
      kind: 'gauge',
      entityId: gauge.id,
      name: gauge.name,
      // The river it rates, so a starred gauge taps through somewhere. Empty
      // for the national tier, which rates none — an honest empty, not a guess.
      slug: gauge.thresholds?.find((l) => l.isPrimary)?.riverSlug ?? '',
      usgsSiteId: gauge.siteId,
    });
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.navRow}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        {/* Absent, not disabled, when the station has no id to star it by —
            a control that cannot do anything is worse than no control. */}
        {gauge.id ? (
          <Pressable
            onPress={onToggleStar}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={starred ? `Unstar ${gauge.name}` : `Star ${gauge.name}`}
          >
            <Ionicons
              name={starred ? 'star' : 'star-outline'}
              size={24}
              color={starred ? colors.warm : colors.textSubtle}
            />
          </Pressable>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.name, { color: colors.text }]}>{gauge.name}</Text>
        <Text style={[styles.meta, { color: colors.textMuted }]}>
          {[
            `USGS ${gauge.siteId}`,
            rated ? link?.riverName : 'Not rated by Eddy',
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>

        {/* ── The reading ──────────────────────────────────────────
            The otter only appears for a RATED gauge. It is Eddy's reaction to a
            verdict, and there is no verdict here for a reference station — a
            cheerful otter beside "much higher than usual" would be the app
            making a floatability claim it has explicitly declined to make. */}
        <View style={[styles.card, { backgroundColor: colors.card }, elevation(2)]}>
          <View style={styles.readingRow}>
            {rated ? <Otter mood={otterForCondition(code)} size={56} /> : null}
            <View style={styles.readingText}>
              <Text
                style={[
                  styles.reading,
                  {
                    color: value != null && rated ? conditionText(code, isDark) : colors.text,
                  },
                ]}
                numberOfLines={1}
              >
                {value != null && unit ? formatReading(value, unit) : 'No reading'}
              </Text>
              {age ? (
                <Text style={[styles.age, { color: colors.textSubtle }]}>{age}</Text>
              ) : null}
            </View>

            {rated ? (
              <View
                style={[
                  styles.chip,
                  { backgroundColor: conditionBg(code), borderColor: conditionChipBorder(code) },
                ]}
              >
                <Text style={[styles.chipText, { color: conditionInk(code) }]}>
                  {conditionLongLabel(code)}
                </Text>
              </View>
            ) : (
              <View
                style={[
                  styles.chip,
                  { backgroundColor: bandChip.bg, borderColor: bandChip.border },
                ]}
              >
                <Text style={[styles.chipText, { color: bandChip.ink }]}>
                  {flowBandLabel(band)}
                </Text>
              </View>
            )}
          </View>

          {/* The caveat that explains a grey chip, rather than leaving an
              ungraded reading looking like a missing one. */}
          {gauge.qualifierNote ? (
            <Text style={[styles.caveat, { color: colors.error }]}>{gauge.qualifierNote}</Text>
          ) : null}

          {/* The ladder, at equal band widths — see ReadingScale's header for
              why that differs from the chart below, which is not a rescaling of
              this but a different axis entirely. */}
          {rated && link && unit ? (
            <View style={styles.scaleWrap}>
              <ReadingScale thresholds={link} value={value} unit={unit} />
            </View>
          ) : null}

          {/* The comparison, for a station that has one. This is the reference
              tier's whole answer, so it is stated in words and not left to a
              chip colour five steps of one hue deep. */}
          {!rated ? (
            <Text style={[styles.bandSentence, { color: colors.textMuted }]}>
              {flowBandSentence(band)}
              {percentile ? ` — ${percentile}.` : '.'}
            </Text>
          ) : percentile ? (
            <Text style={[styles.bandSentence, { color: colors.textMuted }]}>{percentile}.</Text>
          ) : null}
        </View>

        {/* ── How it got here ──────────────────────────────────────
            Directly under the number, because the number is the thing that
            provokes the question. Bands are shaded behind the line only when
            this station has a ladder AND that ladder is in the unit being
            drawn; GaugeChart drops the shading itself otherwise rather than
            comparing feet against cfs. */}
        <GaugeChart
          siteId={gauge.siteId}
          unit={unit ?? 'cfs'}
          thresholds={rated ? link : null}
          title="Recent history"
        />

        {/* ── Where else to go ─────────────────────────────────── */}
        <View style={styles.actions}>
          {link?.riverSlug ? (
            <Pressable
              onPress={() => router.push(`/river/${link.riverSlug}`)}
              style={({ pressed }) => [
                styles.action,
                { backgroundColor: pressed ? colors.accentPressed : colors.accent },
              ]}
              accessibilityRole="button"
            >
              <Text style={[styles.actionText, { color: colors.onAccent }]}>
                Open {link.riverName}
              </Text>
            </Pressable>
          ) : null}

          {/* KEPT, and deliberately. Eddy now draws this station's recent
              history itself, which is what people came for — but USGS is the
              source of record and holds the decades this chart does not. */}
          {source ? (
            <Pressable
              onPress={() => void Linking.openURL(source)}
              style={({ pressed }) => [
                styles.sourceButton,
                { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
              ]}
              accessibilityRole="button"
            >
              <Text style={[styles.sourceText, { color: colors.text }]}>
                Open on USGS
              </Text>
            </Pressable>
          ) : null}
        </View>

        {/* Every other gauge this station rates. A physical gauge can grade two
            rivers on different ladders, and the reading above is graded on the
            first — naming the others beats implying there is only one. */}
        {rated && (gauge.thresholds?.length ?? 0) > 1 ? (
          <Text style={[styles.footnote, { color: colors.textSubtle }]}>
            Also rates{' '}
            {gauge
              .thresholds!.slice(1)
              .map((l) => l.riverName)
              .join(', ')}
            , which grade this reading on their own levels.
          </Text>
        ) : null}

        <Text style={[styles.footnote, { color: colors.textSubtle }]}>
          Readings come from the gauge operator and can trail the river. Always judge the water in
          front of you.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centre: { alignItems: 'center', justifyContent: 'center' },
  emptyBody: { flex: 1, paddingHorizontal: 32, gap: 10 },
  emptyTitle: { ...t.xl, fontFamily: fonts.heading, textAlign: 'center' },
  emptyBodyText: { ...t.sm, fontFamily: fonts.body, textAlign: 'center' },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  body: { paddingBottom: 40 },
  name: { ...t['2xl'], fontFamily: fonts.heading, paddingHorizontal: 20, marginTop: 4 },
  meta: { ...t.sm, fontFamily: fonts.body, paddingHorizontal: 20, marginTop: 2, marginBottom: 14 },
  card: { marginHorizontal: 16, marginBottom: 14, borderRadius: 18, padding: 16 },
  readingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  readingText: { flex: 1 },
  reading: { ...t['3xl'], fontFamily: fonts.mono },
  age: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  chipText: { ...t.xs, fontFamily: fonts.semibold },
  caveat: { ...t.xs, fontFamily: fonts.medium, marginTop: 10 },
  scaleWrap: { marginTop: 14 },
  bandSentence: { ...t.sm, fontFamily: fonts.body, marginTop: 12 },
  actions: { paddingHorizontal: 16, gap: 10 },
  action: { paddingVertical: 13, borderRadius: 14, alignItems: 'center' },
  actionText: { ...t.base, fontFamily: fonts.semibold },
  sourceButton: {
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  sourceText: { ...t.sm, fontFamily: fonts.medium },
  footnote: {
    ...t.xs,
    fontFamily: fonts.body,
    paddingHorizontal: 20,
    marginTop: 16,
    lineHeight: 17,
  },
});
