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
import type { GaugeDetail, GaugeDetailThreshold, GaugeFloodStages } from '@eddy/types';
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
import {
  FLOOD_STAGE_SYSTEM,
  floodStageColor,
  formatStage,
  highestStagePassed,
} from '@/theme/floodStage';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { formatReading, percentileLabel, readingAge } from '@/lib/readingCopy';
import { usgsGaugeUrl } from '@/lib/directions';
import {
  isDamRelease,
  isUsgsSite,
  looksLikeUsgsSiteId,
  providerLabel,
  stationCaption,
  supportsFlowBand,
} from '@/lib/gaugeProvider';
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
  // ── An unrated station with NWS stages leads in FEET ──────────────────────
  // Discharge is otherwise the right default here: there is no ladder to obey,
  // and the percentile is computed from discharge, so the number and the flow
  // band describe the same quantity.
  //
  // Official stages change that. They are published in feet and nothing else,
  // so a station charted in cfs cannot show the one threshold it actually has —
  // and "4.1 ft, flood stage is 7 ft" is a far more useful headline than a
  // discharge figure nobody has a reference for. The band chip below keeps
  // describing discharge either way; it is a different claim.
  if (gauge.floodStages && gauge.gaugeHeightFt != null) return 'ft';
  if (gauge.dischargeCfs != null) return 'cfs';
  if (gauge.gaugeHeightFt != null) return 'ft';
  return null;
}

/**
 * "Flood stage 20 ft · action 10 ft", from whichever of the four are published.
 *
 * Named in the NWS's own words, never paraphrased into Eddy's — see the header
 * of src/theme/floodStage.ts for why relaying somebody else's threshold is the
 * one safety-adjacent thing an unrated gauge is allowed to carry.
 */
function stageSummary(stages: GaugeFloodStages): string {
  return (
    [
      stages.floodFt != null ? `Flood stage ${formatStage(stages.floodFt)}` : null,
      stages.actionFt != null ? `action ${formatStage(stages.actionFt)}` : null,
      stages.moderateFt != null ? `moderate ${formatStage(stages.moderateFt)}` : null,
      stages.majorFt != null ? `major ${formatStage(stages.majorFt)}` : null,
    ]
      .filter(Boolean)
      .join(' · ')
  );
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
        <ActivityIndicator size="large" color={colors.interactive} />
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
          {/* Only offered when the id LOOKS like a USGS site number. There is no
              record here to read a provider off — that is what "not found"
              means — so the shape of the id is all there is to go on, and
              guessing wrong is how a USACE dam slug became a 404 on
              waterdata.usgs.gov. */}
          {looksLikeUsgsSiteId(siteId) && usgsGaugeUrl(siteId) ? (
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
  // The ladder to grade against.
  //
  // FIND-PRIMARY, not [0], even though /api/gauges/[siteId] already sorts it
  // that way. The seed does not: it can come from a MapGauge whose `thresholds`
  // are in whatever order /api/gauges emitted them, and a station that rates two
  // rivers would then flash the SECOND river's bands under this reading for the
  // frame before the fetch lands. Same rule gaugeLink() applies everywhere else
  // in the app, for the same reason.
  const link =
    gauge.thresholds?.find((l) => l.isPrimary) ?? gauge.thresholds?.[0] ?? null;
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

  const stages = gauge.floodStages;
  // FEET AGAINST FEET, always. highestStagePassed takes a bare number and cannot
  // check the unit itself, so the guard lives here: gaugeHeightFt is the only
  // value these thresholds may be compared against.
  const stagePassed = stages
    ? highestStagePassed(
        {
          action: stages.actionFt,
          flood: stages.floodFt,
          moderate: stages.moderateFt,
          major: stages.majorFt,
        },
        gauge.gaugeHeightFt,
      )
    : null;

  const age = readingAge(gauge.readingAgeHours);
  const percentile = percentileLabel(gauge.flowPercentile);
  const starred = gauge.id ? isStarred('gauge', gauge.id) : false;
  // The operator's own page. Prefer the server's answer, which knows each
  // provider's URL scheme, and fall back to the USGS template ONLY when the
  // record says USGS. Building that URL unconditionally is what pointed a
  // USACE dam at waterdata.usgs.gov/monitoring-location/swl-clearwater-dam/,
  // a 404 — see src/lib/gaugeProvider.ts.
  const source = gauge.publicUrl ?? (isUsgsSite(gauge.provider) ? usgsGaugeUrl(gauge.siteId) : null);
  const sourceLabel = providerLabel(gauge.provider) ?? 'USGS';

  // What this station says about its own number, for the case where neither of
  // Eddy's two vocabularies applies. Arrives with the detail fetch, so it is
  // absent on the seeded first frame — which is fine, because what it replaces
  // is absent then too.
  const damNote = !supportsFlowBand(gauge.provider) ? gauge.stationNote : null;

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
        {/* Attribution, and only where it is earned. A USGS site number is a
            public identifier worth printing; a USACE dam's id is an Eddy slug,
            so that station is credited by operator alone. An unknown provider
            prints neither rather than claiming one. See src/lib/gaugeProvider.ts.

            "Not rated by Eddy" is likewise withheld from a dam release: it is
            true, but it reads as an omission when the real reason is that a
            floatability ladder is the wrong instrument for a release rate. */}
        <Text style={[styles.meta, { color: colors.textMuted }]}>
          {[
            stationCaption(gauge.provider, gauge.siteId),
            rated
              ? link?.riverName
              : supportsFlowBand(gauge.provider)
                ? 'Not rated by Eddy'
                : 'Dam release',
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
          {!rated && supportsFlowBand(gauge.provider) ? (
            <Text style={[styles.bandSentence, { color: colors.textMuted }]}>
              {flowBandSentence(band)}
              {percentile ? ` — ${percentile}.` : '.'}
            </Text>
          ) : !rated && damNote ? (
            /* A dam release instead of a band. UsaceProvider declines to compute
               a percentile at all — one on a REGULATED release describes the
               Corps' schedule, not the river's hydrology — so the band chip here
               was rendering a comparison against a number that is null by
               design. The station's own prose says the true thing, and it is
               already in the database: gauge_stations.threshold_descriptions,
               written by migration 00198. */
            <Text style={[styles.bandSentence, { color: colors.textMuted }]}>{damNote}</Text>
          ) : percentile ? (
            <Text style={[styles.bandSentence, { color: colors.textMuted }]}>{percentile}.</Text>
          ) : null}

          {/* ── The NWS lines ──────────────────────────────────────
              The only safety-adjacent fact an unrated station carries, and it is
              carried by ATTRIBUTION: these are the Weather Service's published
              thresholds for this gauge, quoted. Eddy is not grading anything
              here, which is why the wording stays the NWS's own and why the
              violet rule is a hue from neither of Eddy's two vocabularies.

              A station past one of its stages says so in a line of its own,
              above the thresholds themselves — that is the fact, and the
              numbers behind it are the reference. */}
          {stages ? (
            <View style={[styles.stages, { borderTopColor: colors.border }]}>
              {stagePassed ? (
                <Text style={[styles.stagePassed, { color: floodStageColor() }]}>
                  {FLOOD_STAGE_SYSTEM[stagePassed].sentence}
                </Text>
              ) : null}
              <Text style={[styles.stageSummary, { color: colors.textSubtle }]}>
                {stageSummary(stages)}
                {stages.lid ? ` · NWS ${stages.lid}` : ''}
              </Text>
            </View>
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
          // Passed for BOTH tiers. A rated river gets bands from a human's
          // judgement and these from the Weather Service, and the two are
          // different claims that can usefully sit on one plot — the chart
          // draws stages only on a foot axis, so nothing is compared across
          // units to make that happen.
          floodStages={stages}
          title="Recent history"
        />

        {/* ── Where else to go ─────────────────────────────────── */}
        <View style={styles.actions}>
          {/* A USACE station IS a dam, and the dam screen is where the rest of
              it lives — the pool, the generating state, the hourly schedule.
              None of that fits gauge_stations, which models a river discharge,
              so this reading is one number off a project with a great deal more
              to say. The ids are the same string by construction: the registry
              key doubles as gauge_stations.site_id_external. */}
          {isDamRelease(gauge.provider) ? (
            <Pressable
              onPress={() => router.push(`/dam/${gauge.siteId}`)}
              style={({ pressed }) => [
                styles.action,
                {
                  backgroundColor: pressed
                    ? colors.interactivePressed
                    : colors.interactive,
                },
              ]}
              accessibilityRole="button"
            >
              <Text style={[styles.actionText, { color: colors.onInteractive }]}>
                Lake &amp; dam detail
              </Text>
            </Pressable>
          ) : null}

          {link?.riverSlug ? (
            <Pressable
              onPress={() => router.push(`/river/${link.riverSlug}`)}
              style={({ pressed }) => [
                styles.action,
                {
                  backgroundColor: pressed
                    ? colors.interactivePressed
                    : colors.interactive,
                },
              ]}
              accessibilityRole="button"
            >
              <Text style={[styles.actionText, { color: colors.onInteractive }]}>
                Open {link.riverName}
              </Text>
            </Pressable>
          ) : null}

          {/* ── Tell me when it moves ──
              This screen is a NUMBER and a chart of how it got there, and the
              question a number provokes once you care about it is "tell me when
              it does that again". Gauge-scoped threshold alerts have existed
              since /api/me/gauge-alerts shipped and this screen — the one place
              in the app that is entirely about a single station — never linked
              to them: the only doors in were the alerts tab and the river
              screen, both of which make you name the station over again.

              Quiet, beneath the destinations, for the same reason the star is
              in the nav row: this is a standing choice about a station, not the
              thing you opened the screen to read. The configure screen decides
              between Eddy's call and your own level from the ladder — nothing
              needs to be passed here to say which. */}
          {gauge.siteId ? (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/alerts/configure',
                  params: {
                    scope: 'gauge',
                    siteId: gauge.siteId,
                    gaugeId: gauge.id,
                    gaugeName: gauge.name,
                    // The river it rates, when it rates one. Carried so the
                    // configure screen can offer Eddy's call — that mode needs
                    // a river, and a station reached from here may be the only
                    // place its association is known.
                    ...(link?.riverSlug ? { riverSlug: link.riverSlug } : {}),
                    ...(link?.riverId ? { riverId: link.riverId } : {}),
                    ...(link?.riverName ? { riverName: link.riverName } : {}),
                  },
                })
              }
              style={({ pressed }) => [
                styles.sourceButton,
                { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Set an alert for ${gauge.name}`}
            >
              <Ionicons name="notifications-outline" size={16} color={colors.text} />
              <Text style={[styles.sourceText, { color: colors.text }]}>Alert me about this gauge</Text>
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
                Open on {sourceLabel}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {/* Every other gauge this station rates. A physical gauge can grade two
            rivers on different ladders, and the reading above is graded on the
            first — naming the others beats implying there is only one. */}
        {rated && (gauge.thresholds?.length ?? 0) > 1 ? (
          <Text style={[styles.footnote, { color: colors.textSubtle }]}>
            {/* Everything EXCEPT the one being shown, filtered by identity
                rather than sliced off the front — `link` is found, not taken
                from index 0, so a slice would name the shown river and omit
                whichever one happens to sort first. */}
            Also rates{' '}
            {gauge
              .thresholds!.filter((l) => l !== link)
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
  stages: { marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  stagePassed: { ...t.sm, fontFamily: fonts.semibold, marginBottom: 4 },
  stageSummary: { ...t.xs, fontFamily: fonts.body },
  actions: { paddingHorizontal: 16, gap: 10 },
  action: { paddingVertical: 13, borderRadius: 14, alignItems: 'center' },
  actionText: { ...t.base, fontFamily: fonts.semibold },
  sourceButton: {
    // A row, so a button can carry a leading icon. With a single Text child
    // this renders identically to the centred column it replaced.
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
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
