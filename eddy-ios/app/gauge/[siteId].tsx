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
import type {
  GaugeDetail,
  GaugeDetailThreshold,
  GaugeFloodStages,
  RiverOutlookResponse,
} from '@eddy/types';
import { classifyReading, hasLadder } from '@eddy/conditions/condition-ladder';
import { flowBand } from '@eddy/conditions/flow-band';
import { fetchGaugeDetail, fetchRiverOutlook } from '@/api/client';
import {
  conditionBg,
  conditionChipBorder,
  conditionInk,
  conditionText,
} from '@/theme/conditions';
import { flowBandChip, flowBandLabel, flowBandSentence } from '@/theme/flow';
import {
  floodStageColor,
  formatStage,
} from '@/theme/floodStage';
import { safetySummarySentence, summarizeSafety } from '@eddy/conditions/safety-summary';
import { isReadingStale } from '@eddy/conditions/reading-staleness';
import { presentReading } from '@eddy/conditions/reading-presentation';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { SafetyDisclaimer } from '@/components/SafetyDisclaimer';
import { formatReading, percentileLabel, readingAge } from '@/lib/readingCopy';
import { usgsGaugeUrl } from '@/lib/directions';
import { gaugeSharePath } from '@/lib/share';
import {
  isDamRelease,
  isUsgsSite,
  looksLikeUsgsSiteId,
  providerLabel,
  stationCaption,
  supportsFlowBand,
} from '@/lib/gaugeProvider';
import {
  gaugeTier,
  recallGauge,
  rememberGauge,
  seedFromDetail,
  type GaugeSeed,
} from '@/lib/gaugeSeed';
import { readGauge, writeGauge } from '@/lib/gaugeCache';
import { EddyTake } from '@/components/EddyTake';
import { GaugeChart } from '@/components/GaugeChart';
import { ReadingScale } from '@/components/ReadingScale';
import { ShareButton } from '@/components/ShareButton';
import { TrendPill } from '@/components/TrendPill';
import { FeedbackSheet } from '@/components/FeedbackSheet';
import { PaywallSheet } from '@/components/PaywallSheet';
import { premiumPitch } from '@/lib/premiumCopy';
import { EddySymbol } from '@/components/EddySymbol';
import { Otter, otterForCondition } from '@/components/Otter';
import { useStarredRivers } from '@/hooks/useStarredRivers';
import { useAccount } from '@/hooks/useAccount';
import { goBack } from '@/lib/nav';
import { AlertOriginRow } from '@/components/AlertOriginRow';
import { pickPrimaryRiverLink } from '@eddy/conditions/primary-river-link';

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
/** "measured 3 hours ago", or null when the timestamp does not parse. */
function waterTempAge(observedAt: string): string | null {
  const t = new Date(observedAt).getTime();
  if (!Number.isFinite(t)) return null;
  const hours = Math.max(0, (Date.now() - t) / 3_600_000);
  const label = readingAge(hours);
  return label ? label.replace('Updated', 'measured') : null;
}

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
  const { siteId, alertId, alertSource } = useLocalSearchParams<{
    siteId: string;
    /** Set only by a push-notification tap — see routeTo in usePush. */
    alertId?: string;
    alertSource?: string;
  }>();
  const router = useRouter();
  const { colors, elevation, isDark } = useTheme();
  const { isStarred, toggleStar } = useStarredRivers();
  const {
    entitlement,
    loaded: accountLoaded,
    error: accountError,
    refresh: refreshAccount,
  } = useAccount();

  // Seeded synchronously from whatever opened this screen, so the first frame
  // has the reading on it. Null on a deep link, which is the loading path.
  const [gauge, setGauge] = useState<GaugeSeed | null>(() => recallGauge(siteId));
  const [loading, setLoading] = useState(!gauge);
  const [failed, setFailed] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  /**
   * Eddy's written report FOR THIS STATION, when there is one.
   *
   * ── The gap this closes ───────────────────────────────────────────────────
   * /outlook?gaugeId has answered per gauge since the river screen's picker
   * started following it: ask for a station and you get that station's weather,
   * its hydrograph, its condition and its own written report. The river screen
   * used that; this screen — the one page in the app that is entirely about a
   * single station — did not, so a gauge with a report of its own could only be
   * read by going to the river, finding the picker, and selecting the station
   * you had just come from.
   *
   * Rated stations only, and only ones that rate a river: the endpoint is
   * river-scoped, and there is no report to ask for on the national tier.
   *
   * Null means "nothing to show", never an error. Every failure lands here —
   * the reading, the chart and the stages above are what this screen is for,
   * and none of them depend on it.
   *
   * ── Stored WITH the request it answers ────────────────────────────────────
   * `key` is the station this report describes. Holding it means the panel can
   * be dropped the instant the screen starts describing a different one, by
   * comparing rather than by clearing — which matters because this panel NAMES
   * its river, and one station's report under another's heading is the exact
   * mismatch the river screen's picker had to be fixed for. Clearing state in
   * the effect body would do the same job by triggering a second render pass.
   */
  const [report, setReport] = useState<{ key: string; data: RiverOutlookResponse | null } | null>(
    null,
  );

  /**
   * Bumped by the failure body's "Try again". The error copy always SAID try
   * again; with the load living in a [siteId]-keyed effect there was no way to
   * do so short of leaving and coming back — an instruction with no control,
   * on the screen whose whole content is one request.
   */
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    if (!siteId) return;
    const controller = new AbortController();

    // Disk and network race independently. A deep link can paint the station
    // name and last-known number from disk without delaying a fresh response.
    if (!recallGauge(siteId)) {
      void readGauge(siteId).then((cached) => {
        if (!cached || controller.signal.aborted) return;
        setGauge((current) => current ?? cached);
        setLoading(false);
      });
    }

    void (async () => {
      const detail: GaugeDetail | null = await fetchGaugeDetail(siteId, controller.signal);
      if (controller.signal.aborted) return;

      if (detail) {
        const seed = seedFromDetail(detail);
        setGauge(seed);
        // Cache the fuller record so coming back within the session opens on
        // the ladder rather than on the pin's thinner copy.
        rememberGauge(seed);
        writeGauge(seed);
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
  }, [siteId, reloadNonce]);

  // ── The two vocabularies ──────────────────────────────────────────────────
  // The ladder to grade against.
  //
  // FIND-PRIMARY, not [0], even though /api/gauges/[siteId] already sorts it
  // that way. The seed does not: it can come from a MapGauge whose `thresholds`
  // are in whatever order /api/gauges emitted them, and a station that rates two
  // rivers would then flash the SECOND river's bands under this reading for the
  // frame before the fetch lands. Same rule gaugeLink() applies everywhere else
  // in the app, for the same reason.
  //
  // ABOVE THE EARLY RETURNS, because the report effect below needs it and a
  // hook cannot run after a conditional return. One definition rather than two,
  // so the report and the ladder cannot end up describing different rivers.
  // Deterministic rather than find(isPrimary). 07014000 is legitimately primary
  // for both Huzzah and Courtois — Courtois has no gauge of its own and borrows
  // it — so `find` returned whichever row the API happened to list first, and
  // this screen could name a different river than the map did in the same
  // session. See @eddy/conditions/primary-river-link.
  const link = gauge ? pickPrimaryRiverLink(gauge.thresholds) : null;
  const rated = Boolean(link && hasLadder(link));

  /**
   * True while the screen does not yet know which vocabulary it is entitled to.
   *
   * `rated` alone cannot tell "this station has no ladder" from "the thing that
   * opened this screen does not carry ladders", and three of the five seeds are
   * the second case — so the false branch printed the reference tier's answer
   * about rated rivers for a frame. gaugeTier() separates the two; this pairs it
   * with whether anything is still coming.
   *
   * ONCE THE DETAIL HAS LANDED, unknown stops being unknown: nothing further
   * will arrive, and the flow-band vocabulary is the honest floor for a station
   * we hold no ladder for. So this is only true while `loading`.
   */
  const tierResolving = gauge ? gaugeTier(gauge) === 'unknown' && loading : false;

  const reportSlug = rated ? (link?.riverSlug ?? null) : null;
  const reportGaugeId = gauge?.id ?? null;
  /** What a held report has to match to be shown. Null when there is none to ask for. */
  const reportKey = reportSlug ? `${reportSlug}:${reportGaugeId ?? ''}` : null;

  useEffect(() => {
    if (!reportSlug) return;
    const key = `${reportSlug}:${reportGaugeId ?? ''}`;
    const controller = new AbortController();
    fetchRiverOutlook(reportSlug, controller.signal, reportGaugeId)
      .catch(() => null)
      .then((data) => {
        if (!controller.signal.aborted) setReport({ key, data });
      });
    return () => controller.abort();
  }, [reportSlug, reportGaugeId]);

  /** The held report, but only while it still describes the station on screen. */
  const outlook = reportKey && report?.key === reportKey ? report.data : null;

  if (loading && !gauge) {
    // The chevron renders DURING the load — configure.tsx's own rule: a
    // spinner with no chevron is a wait with no visible way off the screen.
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.navRow}>
          <Pressable onPress={() => goBack(router)} hitSlop={12} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </Pressable>
        </View>
        <View style={[styles.screen, styles.centre]}>
          <ActivityIndicator size="large" color={colors.interactive} />
        </View>
      </SafeAreaView>
    );
  }

  if (!gauge) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.navRow}>
          <Pressable onPress={() => goBack(router)} hitSlop={12} accessibilityLabel="Back">
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
          {/* The control the copy promises. Only for a FAILURE — retrying a
              "not found" would re-ask a question whose answer is not going to
              change. */}
          {failed ? (
            <Pressable
              onPress={() => {
                setFailed(false);
                setLoading(true);
                setReloadNonce((n) => n + 1);
              }}
              style={({ pressed }) => [
                styles.sourceButton,
                { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
              ]}
              accessibilityRole="button"
            >
              <Text style={[styles.sourceText, { color: colors.text }]}>Try again</Text>
            </Pressable>
          ) : null}
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

  // `link` and `rated` are resolved above the early returns — see the block
  // beside the report effect for why.
  const unit = displayUnit(gauge, link);
  const value = readingValue(gauge, unit);

  // A suspect reading is displayed beside its caveat and is never graded — the
  // identical rule gaugeConditionCode and flowBandFor both apply before they
  // will colour anything.
  const classified =
    rated && link && !gauge.readingSuspect
      ? classifyReading(gauge.gaugeHeightFt, link, gauge.dischargeCfs, { strictUnit: true })
      : 'unknown';

  // ── And a STALE reading is never graded in the present tense ──────────────
  // This screen used to colour a three-day-old number "Good - Floatable" with a
  // green otter beside it while the NWS line on the same card, six lines down,
  // withheld its comparison for the same reading. One resolver decides now:
  // past the shared six-hour line the paintable code is `unknown`, the chip
  // says "Last known: Good", the otter is the flag, and no trend is drawn. The
  // number itself stays — an old number with an honest age beats no number.
  const presented = presentReading(classified, gauge.readingAgeHours);
  const code = presented.paintCode;
  const staleReading = value != null && !presented.fresh;

  const band = gauge.readingSuspect ? null : flowBand(gauge.flowPercentile);
  const bandChip = flowBandChip(band, colors);

  const stages = gauge.floodStages;
  // FEET AGAINST FEET, always — gaugeHeightFt is the only value these
  // thresholds may be compared against. The five-state answer itself comes
  // from shared/safety-summary.ts, the same machine the website's summary
  // speaks through, so the two platforms cannot phrase safety differently.
  // An untrusted reading (suspect, or past the shared six-hour line)
  // contributes no comparison: "official stages published; current comparison
  // unavailable" is the honest state for it.
  const safety = summarizeSafety({
    stages: stages
      ? {
          action: stages.actionFt,
          flood: stages.floodFt,
          moderate: stages.moderateFt,
          major: stages.majorFt,
        }
      : null,
    currentFt:
      gauge.readingSuspect || isReadingStale(gauge.readingAgeHours)
        ? null
        : gauge.gaugeHeightFt,
  });

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

  // Which website page this station has, if any. Provider-derived rather than
  // id-shaped, because a USGS site and a USACE dam live under different
  // segments and an NWS LID lives under neither. See src/lib/share.ts.
  const sharePath = gaugeSharePath(gauge.provider, gauge.siteId);

  // THREE states, the same three the river screen resolves and for the same
  // reasons: 'pending' while /api/me/profile is in flight so a cold open cannot
  // paint the paid report and then yank it back, null on error so an
  // unreachable profile fails OPEN rather than locking a subscriber out on one
  // bar of signal, and only a definite false locks anything. See EddyTake's
  // `entitled` prop.
  const entitled = !accountLoaded
    ? ('pending' as const)
    : accountError
      ? null
      : Boolean(entitlement?.isActive);

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
      slug: pickPrimaryRiverLink(gauge.thresholds)?.riverSlug ?? '',
      usgsSiteId: gauge.siteId,
      provider: gauge.provider,
    });
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.navRow}>
        <Pressable onPress={() => goBack(router)} hitSlop={12} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <View style={styles.navActions}>
          {/* Absent when the station has no page on the website — an NWS LID
              has none, and gaugeSharePath says so rather than composing a URL
              that redirects to nowhere. Same rule as the star beside it. */}
          {sharePath ? (
            <ShareButton title={gauge.name} path={sharePath} label={`Share ${gauge.name}`} />
          ) : null}
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
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* The way back to the rule that fired the push this screen answered.
            Renders nothing on ordinary navigation — only a notification tap
            carries the params. */}
        <AlertOriginRow alertId={alertId} alertSource={alertSource} />

        <Text style={[styles.name, { color: colors.text }]}>{gauge.name}</Text>
        {/* Attribution, and only where it is earned. A USGS site number is a
            public identifier worth printing; a USACE dam's id is an Eddy slug,
            so that station is credited by operator alone. An unknown provider
            falls back to the site number when the id is one and prints nothing
            when it is not. See shared/station-caption.ts.

            "Not rated by Eddy" is likewise withheld from a dam release: it is
            true, but it reads as an omission when the real reason is that a
            floatability ladder is the wrong instrument for a release rate. */}
        <Text style={[styles.meta, { color: colors.textMuted }]}>
          {[
            stationCaption(gauge.provider, gauge.siteId),
            // "Not rated by Eddy" is withheld while the tier is unresolved for
            // the same reason the chip below is: it is the strongest sentence
            // on this line and it was being printed about rated rivers.
            tierResolving
              ? null
              : rated
                ? link?.riverName
                : supportsFlowBand(gauge.provider)
                  ? 'Not rated by Eddy'
                  : // The caption already says "USACE release", which is the
                    // only way to reach this branch. Saying it twice on one
                    // line is what a second copy of the rule used to hide.
                    null,
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
            {rated && !tierResolving ? <Otter mood={otterForCondition(code)} size={56} /> : null}
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
              {/* Rising or falling, beside the number rather than buried in
                  the chart header — it is the second thing a reader wants
                  after the number and it must not depend on the history
                  request succeeding. Withheld with the verdict once stale:
                  a trend is a claim about now. */}
              {presented.showTrend && gauge.trend ? (
                <View style={styles.trendRow}>
                  <TrendPill
                    direction={gauge.trend.direction}
                    label={gauge.trend.label}
                    enclosed={false}
                  />
                </View>
              ) : null}
              {age && !staleReading ? (
                <Text style={[styles.age, { color: colors.textSubtle }]}>{age}</Text>
              ) : null}
            </View>

            {/* A SHAPE, not a sentence, while the tier is unresolved.
                The reading and its age above are true on the first frame from
                any seed — that is what seeding is for — and they stay. What
                cannot be shown yet is the CLAIM about them, because the two
                available claims contradict each other and the screen has not
                been told which it is entitled to. An empty chip of the right
                size holds the layout so nothing jumps when the answer lands. */}
            {tierResolving ? (
              <View
                style={[styles.chip, styles.chipResolving, { backgroundColor: colors.cardRaised }]}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              />
            ) : rated ? (
              <View
                style={[
                  styles.chip,
                  { backgroundColor: conditionBg(code), borderColor: conditionChipBorder(code) },
                ]}
              >
                <Text style={[styles.chipText, { color: conditionInk(code) }]}>
                  {presented.label}
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

          {/* The age, PROMOTED, when it is the reason the chip went grey. The
              12pt subtle line under the number was the only thing saying a
              confident verdict was three days old; once the verdict is
              withheld the age is the headline fact and reads at body size. */}
          {staleReading && age ? (
            <View style={styles.staleRow}>
              <Ionicons name="time-outline" size={15} color={colors.text} />
              <Text style={[styles.staleText, { color: colors.text }]}>
                {age.replace('Updated', 'Last reported')}. Conditions may have changed since.
              </Text>
            </View>
          ) : null}

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
              chip colour five steps of one hue deep.

              Withheld entirely while the tier is unresolved — this line is the
              one that actually said the false thing. "No historical comparison
              published for this gauge", under a rated river, for one frame. */}
          {tierResolving ? null : !rated && supportsFlowBand(gauge.provider) ? (
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
              {/* Only the current-category state speaks in the violet and the
                  present tense; every other state is quiet reference text. */}
              <Text
                style={
                  safety.kind === 'current'
                    ? [styles.stagePassed, { color: floodStageColor() }]
                    : [styles.stageSummary, { color: colors.textSubtle }]
                }
              >
                {safetySummarySentence(safety)}
              </Text>
              <Text style={[styles.stageSummary, { color: colors.textSubtle }]}>
                {stageSummary(stages)}
                {stages.lid ? ` · NWS ${stages.lid}` : ''}
              </Text>
            </View>
          ) : null}

          {/* Water temperature, when this station measures it (most do not) —
              never without its measurement time, so an old number cannot
              borrow the reading's freshness. */}
          {gauge.waterTemperature ? (
            <Text style={[styles.bandSentence, { color: colors.textMuted }]}>
              Water {gauge.waterTemperature.valueF}°F
              {waterTempAge(gauge.waterTemperature.observedAt)
                ? ` · ${waterTempAge(gauge.waterTemperature.observedAt)}`
                : ''}
            </Text>
          ) : null}
        </View>

        {/* ── How it got here ──────────────────────────────────────
            Directly under the number, because the number is the thing that
            provokes the question. Bands are shaded behind the line only when
            this station has a ladder AND that ladder is in the unit being
            drawn; GaugeChart drops the shading itself otherwise rather than
            comparing feet against cfs. */}
        {/* Inset by the SCREEN, not by the card. GaugeChart carries no
            horizontal margin of its own — this ScrollView pads nothing, the
            river screen's pads 16, and a margin inside the component was added
            to both. */}
        <View style={styles.inset}>
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
        </View>

        {/* ── Eddy's report on this station ─────────────────────
            BELOW the chart, in the same order the river screen puts it: the
            number, then how it got there, then what Eddy makes of it. The card
            gates itself — locked it draws all three sections blurred with one
            CTA, which is the same offer the premium row below used to make in
            prose and now makes with the thing itself.

            Inset by the SCREEN like the chart above, because EddyTake carries
            no horizontal margin of its own.

            `ratedUnit` is what stops the 72-hour strip's forecast — always NWS
            stage in feet — from reading as this station's own unit on the 18 of
            24 rivers rated in cfs. */}
        {outlook ? (
          <View style={styles.inset}>
            <EddyTake
              outlook={outlook}
              ratedUnit={unit}
              entitled={entitled}
              onUpgrade={() => setPaywallOpen(true)}
            />
          </View>
        ) : null}

        {/* A gauge is where "what does this number mean next?" is most likely
            to arise. Offer the paid interpretation here, but only when the
            account answered definitively that it is inactive; an offline or
            still-loading entitlement must never advertise to a subscriber.

            SUPPRESSED once the report above is on screen. Two paywall pitches
            on one screen, one of them a paragraph about a report that is
            already sitting above it blurred, is the same wall drawn twice —
            the rule EddyTake's own header sets for its three sections. */}
        {!outlook && accountLoaded && !accountError && !entitlement?.isActive ? (
          <Pressable
            onPress={() => setPaywallOpen(true)}
            style={({ pressed }) => [
              styles.premiumCard,
              { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
              elevation(1),
            ]}
            accessibilityRole="button"
            accessibilityLabel="Learn about Eddy Premium"
          >
            <View style={[styles.premiumIcon, { backgroundColor: colors.cardRaised }]}>
              <EddySymbol name="aiAssistant" size={29} />
            </View>
            <View style={styles.premiumText}>
              <Text style={[styles.premiumTitle, { color: colors.text }]}>Eddy Premium</Text>
              {/* From premiumCopy.ts, with the sheet this opens. These two
                  drifted apart for months — this one still listed offline maps
                  after they were removed, and 72-hour trends which were never
                  gated at all. One source is what stops that recurring. */}
              <Text style={[styles.premiumBody, { color: colors.textMuted }]}>
                {premiumPitch(link?.riverName)}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color={colors.textSubtle} />
          </Pressable>
        ) : null}

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

          {/* ── The report only somebody who was there can file ──
              This screen states a number and, for a rated station, a verdict
              drawn off a ladder a human set by hand. When that ladder is wrong
              the only evidence is a person standing in water that did not match
              it, and until now they had nowhere to say so.

              The reading and the timestamp ride along in context_data. Without
              them the report arrives disputing a number that has already
              changed, and there is no way to check the complaint against what
              Eddy was actually claiming at the time. */}
          <Pressable
            onPress={() => setFeedbackOpen(true)}
            style={({ pressed }) => [
              styles.sourceButton,
              { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Report a problem with ${gauge.name}`}
          >
            <Ionicons name="flag-outline" size={16} color={colors.textMuted} />
            <Text style={[styles.sourceText, { color: colors.textMuted }]}>
              This reading looks wrong
            </Text>
          </Pressable>
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

        <SafetyDisclaimer />
      </ScrollView>

      <FeedbackSheet
        visible={feedbackOpen}
        onDismiss={() => setFeedbackOpen(false)}
        defaultType="gauge_recalibration"
        context={{
          type: 'gauge',
          id: gauge.siteId,
          name: gauge.name,
          data: {
            provider: gauge.provider,
            gaugeHeightFt: gauge.gaugeHeightFt,
            dischargeCfs: gauge.dischargeCfs,
            readingTimestamp: gauge.readingTimestamp,
            // The river this reading was GRADED against, when it was graded at
            // all. A station can rate two rivers on different ladders, so
            // "the verdict was wrong" is meaningless without saying which one.
            ratedFor: link?.riverSlug ?? null,
          },
        }}
      />

      <PaywallSheet
        visible={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        riverName={link?.riverName}
        onPurchased={() => void refreshAccount()}
      />
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
  // The right-hand end of the nav row, now that share sits beside the star.
  navActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  body: { paddingBottom: 40 },
  name: { ...t['2xl'], fontFamily: fonts.heading, paddingHorizontal: 20, marginTop: 4 },
  meta: { ...t.sm, fontFamily: fonts.body, paddingHorizontal: 20, marginTop: 2, marginBottom: 14 },
  card: { marginHorizontal: 16, marginBottom: 14, borderRadius: 18, padding: 16 },
  /** The horizontal inset this screen's cards carry, for a card that does not. */
  inset: { marginHorizontal: 16 },
  premiumCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 14,
    borderRadius: 16,
    padding: 14,
  },
  premiumIcon: {
    width: 42,
    height: 42,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  premiumText: { flex: 1 },
  premiumTitle: { ...t.sm, fontFamily: fonts.semibold },
  premiumBody: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  readingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  readingText: { flex: 1 },
  reading: { ...t['3xl'], fontFamily: fonts.mono },
  age: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  trendRow: { flexDirection: 'row', marginTop: 4 },
  staleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 12 },
  staleText: { ...t.sm, fontFamily: fonts.medium, flex: 1 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  chipText: { ...t.xs, fontFamily: fonts.semibold },
  // Sized to the labels it stands in for — "Floatable" and "Much lower than
  // usual" bracket the range — so the card does not resize when the real chip
  // arrives. Borderless, because a chip outline reads as a chip with its text
  // failed to load, which is the appearance this whole change is removing.
  chipResolving: { width: 96, height: 25, borderWidth: 0 },
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
