import { NativeHeaderHome } from '@/components/NativeHeaderHome';
import { gaugeFreshness, gaugeFreshnessLabel, isCurrentWaterMeasurement, observationAgeHours } from '@eddy/conditions/gauge-freshness';
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
import { ControlIcon } from '@/components/ControlIcon';
import type {
  GaugeDetail,
  GaugeDetailThreshold,
  GaugeFloodStages,
  RiverOutlookResponse,
} from '@eddy/types';
import { classifyReading, hasLadder } from '@eddy/conditions/condition-ladder';
import {
  ApiError,
  fetchGaugeDetail,
  fetchPremiumEddyRead,
  fetchRiverOutlook,
  type PremiumEddyRead,
} from '@/api/client';
import {
  classifyPremiumReadFailure,
  resolvePremiumTakeState,
  type PremiumReadFailure,
} from '@/lib/premiumRead';
import {
  floodStageColor,
  formatStage,
} from '@/theme/floodStage';
import { safetySummarySentence, summarizeSafety } from '@eddy/conditions/safety-summary';
import { isReadingStale } from '@eddy/conditions/reading-staleness';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { SafetyDisclaimer } from '@/components/SafetyDisclaimer';
import { percentileLabel, readingAge } from '@/lib/readingCopy';
import { usgsGaugeUrl } from '@/lib/directions';
import { gaugeSharePath, shareLink } from '@/lib/share';
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
import { ReadingSummaryCard } from '@/components/ReadingSummaryCard';
import { readingSummarySeason } from '@/lib/readingSummary';
import { useGaugeHistory } from '@/hooks/useGaugeHistory';
import {
  coldWaterNote,
  forecastCrest,
  forecastCrestSentence,
  forecastDayLabel,
  recentPeak,
  recentPeakSentence,
  recentRecord,
  recentRecordSentence,
  recentTrend,
  RECORD_WINDOW_DAYS,
  upcomingForecast,
} from '@eddy/conditions/gauge-recent';
import { floodAlertLine, floodAlertsToShow, isFloodWarning } from '@eddy/conditions/flood-alert-copy';
import { FeedbackSheet } from '@/components/FeedbackSheet';
import { PaywallSheet } from '@/components/PaywallSheet';
import { premiumPitch } from '@/lib/premiumCopy';
import { EddySymbol } from '@/components/EddySymbol';
import { useStarredRivers } from '@/hooks/useStarredRivers';
import { useAccount } from '@/hooks/useAccount';
import { useSession } from '@/hooks/useSession';
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
  const { colors, elevation } = useTheme();
  const { isStarred, toggleStar } = useStarredRivers();
  const {
    entitlement,
    loaded: accountLoaded,
    error: accountError,
    refresh: refreshAccount,
  } = useAccount();
  const { getAccessToken } = useSession();
  const canRequestPremium = accountLoaded && !accountError && Boolean(entitlement?.isActive);

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
  const [premiumRead, setPremiumRead] = useState<{
    key: string;
    data: PremiumEddyRead | null;
    failure: PremiumReadFailure | null;
  } | null>(null);

  /**
   * Bumped by the failure body's "Try again". The error copy always SAID try
   * again; with the load living in a [siteId]-keyed effect there was no way to
   * do so short of leaving and coming back — an instruction with no control,
   * on the screen whose whole content is one request.
   */
  const [reloadNonce, setReloadNonce] = useState(0);
  const [premiumRetry, setPremiumRetry] = useState(0);

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
  const reportGaugeId = link?.isPrimary ? null : gauge?.id ?? null;
  /** What a held report has to match to be shown. Null when there is none to ask for. */
  const reportKey = reportSlug ? `${reportSlug}:${reportGaugeId ?? ''}` : null;

  useEffect(() => {
    if (!reportSlug) return;
    const key = `${reportSlug}:${reportGaugeId ?? ''}`;
    const controller = new AbortController();
    void fetchRiverOutlook(
      reportSlug,
      controller.signal,
      reportGaugeId,
    )
      .catch(() => null)
      .then((data) => {
        if (!controller.signal.aborted) setReport({ key, data });
      });
    return () => controller.abort();
  }, [reportSlug, reportGaugeId, reloadNonce]);

  // Resolve Premium prose separately so entitlement loading never repeats the
  // route's weather, NWS, and gauge fan-out. Primary stations use the river
  // report; secondary stations use their own gauge report.
  useEffect(() => {
    if (!canRequestPremium || !reportSlug || !reportKey) return;
    const controller = new AbortController();
    const premiumSiteId = link?.isPrimary ? null : siteId;

    void (async () => {
      const token = await getAccessToken();
      if (!token) throw new ApiError('No active session');
      return fetchPremiumEddyRead(reportSlug, token, controller.signal, premiumSiteId);
    })()
      .then((data) => {
        if (!controller.signal.aborted) setPremiumRead({ key: reportKey, data, failure: null });
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setPremiumRead({
            key: reportKey,
            data: null,
            failure: classifyPremiumReadFailure(error instanceof ApiError ? error.status : undefined),
          });
        }
      });

    return () => controller.abort();
  }, [canRequestPremium, getAccessToken, link?.isPrimary, premiumRetry, reloadNonce, reportKey, reportSlug, siteId]);

  /** The held report, but only while it still describes the station on screen. */
  const publicOutlook = reportKey && report?.key === reportKey ? report.data : null;

  // ── The last week, for "which way is it going" and "where did it crest" ──
  // Its own request, not the chart's: the chart's range is the reader's to
  // change (it opens wider than a week), and the trend must not move with it.
  // Seven days because that is the widest window the history route samples
  // without collapsing into bucket extrema — see shared/gauge-recent.ts.
  // Called above the early returns below, as every hook here must be.
  const recentHistory = useGaugeHistory(siteId ?? null, 7);
  // And the last month, for "highest reading in the last 30 days" — a fixed
  // window of its own for the same reason: the claim names thirty days.
  const monthHistory = useGaugeHistory(siteId ?? null, RECORD_WINDOW_DAYS);

  if (loading && !gauge) {
    // The native header remains available while the first record loads.
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['left', 'right']}>
        <NativeHeaderHome />
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.centre, styles.emptyBody]}>
          <ActivityIndicator size="large" color={colors.interactive} accessibilityLabel="Loading gauge" />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!gauge) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['left', 'right']}>
        <NativeHeaderHome />
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.centre, styles.emptyBody]}>
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
        </ScrollView>
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
  const code =
    rated && link && !gauge.readingSuspect
      ? classifyReading(gauge.gaugeHeightFt, link, gauge.dischargeCfs, { strictUnit: true })
      : 'unknown';

  const readingIsCurrent = gaugeFreshness(gauge.readingTimestamp) === 'live';

  // Only a series that IS the week we asked for, at instant resolution, may
  // describe the last few hours — the same `matchesRequest` discipline
  // GaugeChart keeps for its own trend.
  const recentSeries =
    recentHistory.matchesRequest && recentHistory.history && recentHistory.history.resolution !== 'daily'
      ? recentHistory.history.readings
      : null;
  // Rated rivers keep the report's trend, which every other surface shows for
  // them; this fills in for the stations that have no report — every unrated
  // one — and for a rated one whose report has not landed. The guards that
  // withhold it (stale series, no reading near six hours back) live in
  // recentTrend.
  const trend =
    readingIsCurrent && !gauge.readingSuspect
      ? (publicOutlook?.trend ?? (unit ? recentTrend(recentSeries, unit) : null))
      : null;
  const peakLine = unit ? recentPeakSentence(recentPeak(recentSeries, unit)) : null;
  // About the CURRENT reading, so only for a trusted one; recentRecord checks
  // the month's coverage, gaps and resolution itself.
  const recordLine =
    unit && readingIsCurrent && !gauge.readingSuspect && monthHistory.matchesRequest
      ? recentRecordSentence(recentRecord(monthHistory.history, unit))
      : null;
  const coldLine = coldWaterNote(gauge.waterTemperature);
  // Active NWS alerts at the station's coordinates — absent from builds of the
  // endpoint that predate the field, which reads exactly like none.
  const alerts = floodAlertsToShow(gauge.floodAlerts);
  const summaryPercentile = !tierResolving && !gauge.readingSuspect && readingIsCurrent && supportsFlowBand(gauge.provider) ? gauge.flowPercentile : null;

  const stages = gauge.floodStages;
  // The NWS forecast rides on the week's history response — the route attaches
  // it for any station with an NWS location id, rated or not, and the chart
  // already draws it. Here it is said in words: folded into the safety sentence
  // ("Forecast to reach NWS minor flood stage Tuesday"), and as a crest line
  // when it rises without reaching a category.
  // Upcoming points only: the route trims to what lies past the last
  // OBSERVATION, and a stale station or a cached response can still carry
  // points that have already happened — which would let the safety line say
  // "forecast to reach" about a time already gone.
  const forecast = recentHistory.matchesRequest ? upcomingForecast(recentHistory.history?.forecast) : [];
  // FEET AGAINST FEET, always — gaugeHeightFt is the only value these
  // thresholds may be compared against. The five-state answer itself comes
  // from shared/safety-summary.ts, the same machine the website's summary
  // speaks through, so the two platforms cannot phrase safety differently.
  // An untrusted reading (suspect, or past the shared six-hour line)
  // contributes no comparison: "official stages published; current comparison
  // unavailable" is the honest state for it.
  const trustedStageFt =
    gauge.readingSuspect || isReadingStale(observationAgeHours(gauge.readingTimestamp))
      ? null
      : gauge.gaugeHeightFt;
  const safety = summarizeSafety({
    stages: stages
      ? {
          action: stages.actionFt,
          flood: stages.floodFt,
          moderate: stages.moderateFt,
          major: stages.majorFt,
        }
      : null,
    currentFt: trustedStageFt,
    forecast: forecast.map((point) => ({ t: point.timestamp, gaugeHeightFt: point.gaugeHeightFt })),
  });
  const safetyDay = safety.kind === 'forecast' && safety.crossesAt ? forecastDayLabel(safety.crossesAt) : null;
  // Withheld only when the safety sentence already IS the forecast ("Forecast
  // to reach NWS minor flood stage Tuesday"). A river already at a category
  // still gets it: summarizeSafety reports the CURRENT category and stops, so
  // "Currently at or above NWS action stage" would otherwise be all a reader
  // saw while the Weather Service forecasts a crest several feet higher.
  const crestLine =
    safety.kind === 'forecast'
      ? null
      : forecastCrestSentence(forecastCrest(forecast, trustedStageFt));

  const age = readingAge(observationAgeHours(gauge.readingTimestamp));
  const percentile = percentileLabel(summaryPercentile);
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
  const premiumResolved = Boolean(reportKey && premiumRead?.key === reportKey);
  const premiumFailure = premiumResolved ? premiumRead?.failure ?? null : null;
  const activePremiumRead = premiumResolved && !premiumFailure ? premiumRead?.data : null;
  const outlook = publicOutlook && activePremiumRead
    ? {
        ...publicOutlook,
        fullRead: activePremiumRead.fullRead,
        generatedAt: activePremiumRead.generatedAt,
      }
    : publicOutlook;
  const takeEntitlement = resolvePremiumTakeState(entitled, premiumResolved, premiumFailure);

  // A plain function, not a useCallback: everything above it is guarded by
  // early returns, and a hook below one of those is a hook that does not run in
  // the same order every render. Nothing here is memo-sensitive — it is one
  // toolbar button's handler.
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
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['left', 'right']}>
      <Stack.Screen options={{ title: gauge.name }} />
      <NativeHeaderHome />
      <Stack.Toolbar placement="right">
        {/* Absent when the station has no page on the website — an NWS LID
            has none, and gaugeSharePath says so rather than composing a URL
            that redirects to nowhere. Same rule as the star beside it. */}
        {sharePath ? (
          <Stack.Toolbar.Button
            icon="square.and.arrow.up"
            accessibilityLabel={`Share ${gauge.name}`}
            onPress={() => void shareLink(gauge.name, sharePath)}
          >
            Share
          </Stack.Toolbar.Button>
        ) : null}
        {/* Absent, not disabled, when the station has no id to star it by —
            a control that cannot do anything is worse than no control. */}
        {gauge.id ? (
          <Stack.Toolbar.Button
            onPress={onToggleStar}
            icon={starred ? 'star.fill' : 'star'}
            selected={starred}
            tintColor={colors.interactive}
            accessibilityLabel={starred ? `Remove ${gauge.name} from Favorites` : `Add ${gauge.name} to Favorites`}
          >
            {starred ? 'Remove from Favorites' : 'Add to Favorites'}
          </Stack.Toolbar.Button>
        ) : null}
      </Stack.Toolbar>

      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.body}>
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

        <View style={styles.inset}>
          <ReadingSummaryCard
            key={gauge.siteId}
            readingTimestamp={gauge.readingTimestamp}
            reading={value != null && unit ? { value, unit } : null}
            verdict={rated && !tierResolving ? { code, lastKnown: value != null && !readingIsCurrent } : null}
            resolving={tierResolving}
            trend={trend}
            thresholds={!tierResolving ? link : null}
            context={tierResolving ? null : readingSummarySeason(summaryPercentile, unit, undefined, gauge.dischargeCfs) ?? (!rated ? damNote : null)}
            stationName={gauge.name}
            age={readingIsCurrent ? age : [gaugeFreshnessLabel(gauge.readingTimestamp), age].filter(Boolean).join(' · ')}
            ageWarning={!readingIsCurrent}
            details={[
              { label: 'Source', value: stationCaption(gauge.provider, gauge.siteId) },
              { label: 'Observed', value: gauge.readingTimestamp ? new Date(gauge.readingTimestamp).toLocaleString() : null },
              { label: 'Seasonal comparison', value: percentile ? `${percentile} for flow` : gauge.seasonalContextUnavailableReason ?? 'No current seasonal comparison available' },
              { label: 'Historical record', value: gauge.seasonalContext?.yearsOfRecord ? `${gauge.seasonalContext.yearsOfRecord} years of discharge records` : null },
              { label: 'NWS stages', value: stages ? `${stageSummary(stages)}${stages.lid ? ` · NWS ${stages.lid}` : ''}` : null },
              ...[
                { label: 'Water temperature', measurement: gauge.waterTemperature, value: `${gauge.waterTemperature?.valueF}°F` },
                { label: 'Dissolved oxygen', measurement: gauge.dissolvedOxygen, value: `${gauge.dissolvedOxygen?.valueMgL} mg/L` },
                { label: 'Historical water temperature', measurement: gauge.historicalWaterQuality?.waterTemperature, value: `${gauge.historicalWaterQuality?.waterTemperature?.valueF}°F` },
                { label: 'Historical dissolved oxygen', measurement: gauge.historicalWaterQuality?.dissolvedOxygen, value: `${gauge.historicalWaterQuality?.dissolvedOxygen?.valueMgL} mg/L` },
              ].filter(({ measurement }) => measurement).map(({ label, measurement, value: measurementValue }) => ({
                label: `${!isCurrentWaterMeasurement(measurement) && !label.startsWith('Historical') ? 'Historical ' : ''}${label}`,
                value: `${measurementValue} · ${new Date(measurement!.observedAt).toLocaleString()}${measurement!.measuredAtName ? ` · ${measurement!.measuredAtName}` : ''}`,
              })),
            ]}
          >
            {/* The Weather Service's alerts lead: they are its statement about
                the area right now, and they outrank everything below. Only a
                WARNING takes the flood colour; a watch or advisory is stated
                at full strength without it. */}
            {alerts.map((alert) => (
              <Text
                key={alert.event}
                style={isFloodWarning(alert) ? [styles.stagePassed, { color: floodStageColor(), marginTop: 10 }] : [styles.caveat, { color: colors.text }]}
              >
                {floodAlertLine(alert)}
              </Text>
            ))}
            {/* Facts about the water, for either tier — never a verdict. The
                crest is muted context; cold water is safety information, so it
                reads at full strength without borrowing the alarm red. */}
            {recordLine ? <Text style={[styles.caveat, { color: colors.textMuted }]}>{recordLine}</Text> : null}
            {rated && peakLine ? <Text style={[styles.caveat, { color: colors.textMuted }]}>{peakLine}</Text> : null}
            {crestLine ? <Text style={[styles.caveat, { color: colors.text }]}>{crestLine}</Text> : null}
            {coldLine ? <Text style={[styles.caveat, { color: colors.text }]}>{coldLine}</Text> : null}
            {/* Red only when the reading is SUSPECT (ice, estimated, equipment).
                "Provisional" is how nearly every real-time USGS reading arrives,
                and classifyQualifiers calls it a footnote; in alarm red on
                almost every station it teaches the reader to ignore red. The
                website and embeds already gate on readingSuspect. */}
            {gauge.readingSuspect && gauge.qualifierNote ? (
              <Text style={[styles.caveat, { color: gauge.readingSuspect ? colors.error : colors.textMuted }]}>
                {gauge.qualifierNote}
              </Text>
            ) : null}
            {stages ? (
              <View style={[styles.stages, { borderTopColor: colors.border }]}>
                {/* A forecast crossing is the Weather Service's own statement
                    about the next few days — it gets the same weight as a
                    current one, while its sentence keeps the future tense. */}
                <Text style={safety.kind === 'current' || safety.kind === 'forecast' ? [styles.stagePassed, { color: floodStageColor() }] : [styles.stageSummary, { color: colors.textMuted }]}>
                  {safetySummarySentence(safety, { forecastDayLabel: safetyDay })}
                </Text>
              </View>
            ) : null}
          </ReadingSummaryCard>
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
            title={gauge.name}
            recentSummary={!rated ? peakLine : null}
            provider={gauge.provider}
            unit={unit ?? 'cfs'}
            thresholds={rated ? link : null}
            // Passed for BOTH tiers. A rated river gets bands from a human's
            // judgement and these from the Weather Service, and the two are
            // different claims that can usefully sit on one plot — the chart
            // draws stages only on a foot axis, so nothing is compared across
            // units to make that happen.
            floodStages={stages}
            historyCapabilities={gauge.historyCapabilities}
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
              entitled={takeEntitlement}
              onUpgrade={() => setPaywallOpen(true)}
              onRetry={() => setPremiumRetry((value) => value + 1)}
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
            <ControlIcon name="chevron-forward" size={17} color={colors.textSubtle} />
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
              <ControlIcon name="notifications-outline" size={16} color={colors.text} />
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
            <ControlIcon name="flag-outline" size={16} color={colors.textMuted} />
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
  emptyBody: { flexGrow: 1, paddingHorizontal: 32, paddingVertical: 24, gap: 10 },
  emptyTitle: { ...t.xl, fontFamily: fonts.heading, textAlign: 'center' },
  emptyBodyText: { ...t.sm, fontFamily: fonts.body, textAlign: 'center' },
  body: { paddingTop: 12, paddingBottom: 40 },
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
  caveat: { ...t.xs, fontFamily: fonts.medium, marginTop: 10 },
  stages: { marginTop: 10, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
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
