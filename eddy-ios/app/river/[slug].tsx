// eddy-ios/app/river/[slug].tsx
// One river: what it's doing right now, what could hurt you, and where to get on.
//
// This is the screen the whole app was missing. River Reports listed rivers and
// tapping one went nowhere; the alert engine had no button; hazards existed in
// the database and appeared on no surface at all.
//
// Free/paid boundary:
//   FREE  condition, reading, the gauge picker, percentile context, hazards,
//         access points, the bottom line, the weather — and the bell
//   PAID  Eddy's written report
//
// Everything that decides whether to get on the water is free, and that is a
// rule rather than a description — see the header of PaywallSheet. The bell used
// to be the second paid affordance and is no longer: alerting is free in its
// entirety. It still needs an ACCOUNT, which is not a tier — a notification has
// to have somewhere to go, and an anonymous id is replaced on reinstall.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
  Hazard,
  MapAccessPoint,
  MapGauge,
  RiverConditionDetail,
  RiverListItem,
  RiverOutlookResponse,
  RiverVisualsResponse,
} from '@eddy/types';
import { accessPointTypes, accessTypeLabel } from '@eddy/types';
import {
  criticalHazards,
  hazardConditionCode,
  hazardTypeLabel,
  portageNote,
  severityLabel,
  sortHazards,
} from '@eddy/hazards';
import {
  ApiError,
  fetchCondition,
  fetchGauges,
  fetchHazards,
  fetchRiverAccessPoints,
  fetchRiverOutlook,
  fetchRiverVisuals,
  fetchRivers,
  fetchSubscriptions,
  subscribeToRiver,
  unsubscribeFromRiver,
} from '@/api/client';
import {
  conditionBg,
  conditionChipBorder,
  conditionColor,
  conditionInk,
  conditionLongLabel,
} from '@/theme/conditions';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import {
  accuracyNote,
  formatReading,
  percentileLabel,
  percentileSentence,
  primaryReading,
  readingAge,
} from '@/lib/readingCopy';
import { EddySymbol } from '@/components/EddySymbol';
import { EddyTake } from '@/components/EddyTake';
import { Otter, otterForCondition } from '@/components/Otter';
import { CollapsibleSection } from '@/components/CollapsibleSection';
import { GaugePicker } from '@/components/GaugePicker';
import { RiverVisuals } from '@/components/RiverVisuals';
import { ReadingScale } from '@/components/ReadingScale';
import { PaywallSheet } from '@/components/PaywallSheet';
import { PushPrimer } from '@/components/PushPrimer';
import { AlertSignInSheet } from '@/components/AlertSignInSheet';
import { gaugeConditionCode, gaugeLink, gaugesForRiver } from '@/lib/gaugeCondition';
import { driveToUrl } from '@/lib/directions';
import { useAccount } from '@/hooks/useAccount';
import { usePush } from '@/hooks/usePush';
import { useSession } from '@/hooks/useSession';
import { useStarredRivers } from '@/hooks/useStarredRivers';

export default function RiverDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const { colors, elevation } = useTheme();
  const { getAccessToken } = useSession();
  const { isStarred, toggleStar } = useStarredRivers();

  // Only Eddy's read is gated on this screen, and it fails OPEN — see the
  // `entitled` computation below and the prop comment in EddyTake. Everything
  // that decides whether to get on the water stays free.
  const { entitlement, loaded: accountLoaded, error: accountError } = useAccount();

  const [river, setRiver] = useState<RiverListItem | null>(null);
  const [condition, setCondition] = useState<RiverConditionDetail | null>(null);
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [accessPoints, setAccessPoints] = useState<MapAccessPoint[]>([]);
  const [outlook, setOutlook] = useState<RiverOutlookResponse | null>(null);
  const [visuals, setVisuals] = useState<RiverVisualsResponse | null>(null);
  const [gauges, setGauges] = useState<MapGauge[]>([]);
  /**
   * Which gauge the reading card is showing. Null means the river's own
   * primary, which is what /api/conditions already answered with — so the card
   * opens exactly as it did before anyone touched the picker.
   */
  const [pickedGaugeId, setPickedGaugeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [primerOpen, setPrimerOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const { permission, enable } = usePush();
  const [subscribing, setSubscribing] = useState(false);
  /**
   * Whether alerts are already on for this river.
   *
   * Null is UNKNOWN — no session, or the lookup failed — and the bell renders
   * its default offer in that state rather than claiming either way. Showing
   * "alerts are on" to someone who has none is worse than showing the offer to
   * someone who is already subscribed, since the second is a harmless no-op
   * upsert and the first is a promise nothing will keep.
   */
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);
  const [showAllHazards, setShowAllHazards] = useState(false);

  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    setLoading(true);

    (async () => {
      try {
        // The rivers list is the only place carrying the river's id and current
        // condition code together, and it is CDN-cached, so this is cheap.
        const rivers = await fetchRivers(controller.signal);
        const match = rivers.find((r) => r.slug === slug) ?? null;
        if (!match) {
          setError('River not found');
          return;
        }
        setRiver(match);

        // Each of these degrades on its own. A river with no gauge, no recorded
        // hazards or no access points is an ordinary state, and one failing must
        // not blank the other two.
        //
        // The OUTLOOK is not here. It is fetched per gauge by its own effect
        // below, because it is the one thing on this screen that has to be
        // re-read when the picker moves — and a screen that waits for it before
        // painting anything would be waiting on three third-party services for
        // a panel that is allowed to be absent entirely.
        const [cond, haz, access, looks, allGauges] = await Promise.all([
          fetchCondition(match.id, controller.signal).catch(() => null),
          fetchHazards(slug, controller.signal).catch(() => [] as Hazard[]),
          fetchRiverAccessPoints(slug, controller.signal).catch(() => [] as MapAccessPoint[]),
          // Thin coverage by nature — verified community photos exist for three
          // rivers of twenty-four — so a null here is the ordinary case and the
          // card just does not render.
          fetchRiverVisuals(slug, controller.signal).catch(() => null),
          // Statewide and CDN-cached, and the only place carrying every gauge's
          // ladder PER RIVER — which is what lets the picker below grade a
          // shared station against this river rather than its neighbour's.
          // Failing just means no picker; the primary reading is unaffected.
          fetchGauges(controller.signal).catch(() => [] as MapGauge[]),
        ]);
        setCondition(cond);
        setHazards(haz);
        setAccessPoints(access);
        setVisuals(looks);
        setGauges(gaugesForRiver(allGauges, slug));
        setError(null);
      } catch (err) {
        if (err instanceof ApiError && err.message === 'Request cancelled') return;
        setError(err instanceof ApiError ? err.message : 'Could not load this river');
      } finally {
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [slug]);

  /**
   * The outlook, for whichever gauge the picker is on.
   *
   * ── Why this is its own effect ─────────────────────────────────────────────
   * Picking a gauge used to move the reading card and nothing else. The 72-hour
   * strip kept showing the river's rated town, and Eddy's read kept describing
   * the rated stretch — so on the Current, tapping "Montauk" left you reading
   * Van Buren's weather and Van Buren's report over a Montauk number. The panel
   * now follows the picker: /outlook?gaugeId fetches that station's weather, its
   * hydrograph, its condition and its own written report.
   *
   * ── The cache is not an optimisation ──────────────────────────────────────
   * Switching back and forth between two gauges is the entire point of the
   * picker, and a request per tap makes comparing them a series of spinners.
   * Keyed by gauge id, cleared when the river changes.
   *
   * ── Cleared, not kept, while the next one loads ───────────────────────────
   * Everywhere else in this app a slow load keeps the previous answer on screen.
   * Not here: this panel NAMES the place it describes, and holding Van Buren's
   * card under a chip that now says Montauk would be showing the right words
   * about the wrong water for as long as the network takes.
   */
  const outlookCache = useRef(new Map<string, RiverOutlookResponse | null>());
  const [outlookLoading, setOutlookLoading] = useState(true);
  // The rated station's id, so picking it explicitly and never having picked
  // anything resolve to the SAME request. The picker shows the primary as
  // selected before anyone has touched it, so tapping that chip is a no-op the
  // user expects to be instant — without this it would be a cache miss and a
  // cleared panel for a card we were already looking at.
  const primaryGaugeId = gauges.find((g) => gaugeLink(g, slug)?.isPrimary)?.id ?? null;

  useEffect(() => {
    outlookCache.current.clear();
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    const askedFor = pickedGaugeId && pickedGaugeId !== primaryGaugeId ? pickedGaugeId : null;
    const key = askedFor ?? '';

    const cached = outlookCache.current.get(key);
    if (cached !== undefined) {
      setOutlook(cached);
      setOutlookLoading(false);
      return;
    }

    const controller = new AbortController();
    setOutlook(null);
    setOutlookLoading(true);
    // Any failure is "no outlook", never an error on the screen: the reading,
    // the hazards and the access points below it are the parts that decide
    // whether to get on the water, and none of them depend on this.
    fetchRiverOutlook(slug, controller.signal, askedFor)
      .catch(() => null)
      .then((data) => {
        if (controller.signal.aborted) return;
        outlookCache.current.set(key, data);
        setOutlook(data);
        setOutlookLoading(false);
      });

    return () => controller.abort();
  }, [slug, pickedGaugeId, primaryGaugeId]);

  /**
   * Does this person already have alerts on for this river?
   *
   * Failure leaves `subscribed` at null rather than false — see the state
   * comment. Nothing on this screen waits for the answer; the bell simply
   * settles into its real label once it arrives.
   */
  useEffect(() => {
    if (!river) return;
    let cancelled = false;

    (async () => {
      const token = await getAccessToken();
      if (!token || cancelled) return;
      const subs = await fetchSubscriptions(token).catch(() => null);
      if (!subs || cancelled) return;
      setSubscribed(subs.some((s) => s.riverId === river.id));
    })();

    return () => {
      cancelled = true;
    };
  }, [river, getAccessToken]);

  /**
   * Create the alert subscription.
   *
   * `kind: 'all'` and not `'floatable'`, which is the bug this whole change
   * exists to fix. The event vocabulary and the subscription vocabulary differ
   * on purpose (see subscriptionKindsFor in the web app's fanout.ts): a
   * `warning` event matches only `safety` and `all`. Asking for `'floatable'`
   * therefore made a danger alert structurally impossible to receive, while the
   * primer two screens down promised exactly that.
   *
   * No paywall path any more. A missing session is an AUTH problem and gets a
   * sign-in sheet; presenting an offer to sell something to someone whose token
   * refresh just failed was never honest.
   */
  const subscribe = useCallback(async () => {
    if (!river) return;
    setSubscribing(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        setSignInOpen(true);
        return;
      }
      await subscribeToRiver(token, river.id, 'all');
      setSubscribed(true);

      // The subscription exists — now, and only now, is it worth spending
      // the one-shot iOS permission prompt: there is a concrete notification
      // waiting to be delivered, which is the strongest case this app will
      // ever have. Asking earlier would burn it on a hypothetical.
      if (permission === 'undetermined') setPrimerOpen(true);
    } catch (err) {
      // 403 means the session is anonymous rather than permanent, which is the
      // same remedy as no session at all.
      if (err instanceof ApiError && err.status === 403) setSignInOpen(true);
      else setSubscribeError('Could not turn on alerts. Try again.');
    } finally {
      setSubscribing(false);
    }
  }, [river, getAccessToken, permission]);

  /** Turn alerts off. Deliberately reachable — see Stage 3 of the alert plan. */
  const unsubscribe = useCallback(async () => {
    if (!river) return;
    setSubscribing(true);
    try {
      const token = await getAccessToken();
      if (!token) return;
      await unsubscribeFromRiver(token, river.id);
      setSubscribed(false);
    } catch {
      setSubscribeError('Could not turn alerts off. Try again.');
    } finally {
      setSubscribing(false);
    }
  }, [river, getAccessToken]);

  const onNotify = useCallback(() => {
    setSubscribeError(null);
    void (subscribed ? unsubscribe() : subscribe());
  }, [subscribed, subscribe, unsubscribe]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  if (error || !river) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered, { backgroundColor: colors.bg }]}>
        <Otter mood="flag" size={110} />
        <Text style={[styles.errorTitle, { color: colors.text }]}>{error ?? 'River not found'}</Text>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={[styles.backLink, { color: colors.accent }]}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  // ── Which gauge the card is reading ──────────────────────────────────────
  // Null until someone picks one, and then everything in the card below comes
  // from that gauge instead of from /api/conditions. The RIVER's rating does
  // not move: the chip on the rivers list, the alerts and Eddy's take are all
  // still the primary gauge's verdict. This is a second opinion on a specific
  // stretch, which is the thing a five-gauge river could not previously give.
  const pickedGauge = pickedGaugeId ? gauges.find((g) => g.id === pickedGaugeId) ?? null : null;
  // THIS river's ladder for that station, not the station's primary one — a
  // gauge shared between two rivers grades differently for each.
  const pickedLink = pickedGauge ? gaugeLink(pickedGauge, slug) : null;

  const code = pickedGauge
    ? gaugeConditionCode(pickedGauge, slug)
    : condition?.code ?? river.currentCondition?.code ?? 'unknown';

  // primaryReading resolves the unit through shared/reading-unit.ts, which
  // prefers the nested ladder over the top-level field — so this works against
  // an older deploy that never sent the top-level one, which is the deploy the
  // App Store review lag guarantees will exist. Reused for the picked gauge
  // rather than re-derived, so a secondary station cannot start printing feet
  // for a cfs ladder the way the river card once did.
  const reading =
    pickedGauge && pickedLink
      ? primaryReading({
          gaugeHeightFt: pickedGauge.gaugeHeightFt,
          dischargeCfs: pickedGauge.dischargeCfs,
          thresholdUnit: pickedLink.thresholdUnit,
        })
      : condition
        ? primaryReading(condition)
        : null;

  const scaleThresholds = pickedLink ?? condition?.thresholds ?? null;
  const readingAgeHours = pickedGauge ? pickedGauge.readingAgeHours : condition?.readingAgeHours;
  const shownGaugeName = pickedGauge ? pickedGauge.name : condition?.gaugeName;

  const caveat = condition && !pickedGauge ? accuracyNote(condition) : null;
  const percentileText = percentileSentence(condition?.percentile);
  const starred = isStarred('river', river.id);
  const sortedHazards = sortHazards(hazards);
  const criticalCount = criticalHazards(hazards).length;
  const shownHazards = showAllHazards ? sortedHazards : criticalHazards(hazards);
  const hiddenCount = sortedHazards.length - shownHazards.length;

  // FAILS OPEN, same as the map's offline row. An unreachable /api/me/profile
  // means we do not KNOW whether this person subscribed, and locking a paying
  // customer's read on a river bank with one bar is a worse outcome by far than
  // letting an unsubscribed one read it. Null is "unknown"; only false locks.
  const entitled = accountLoaded && !accountError ? Boolean(entitlement?.isActive) : null;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.navRow}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Pressable
          onPress={() => toggleStar({ kind: 'river', entityId: river.id, name: river.name, slug: river.slug })}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={starred ? `Unstar ${river.name}` : `Star ${river.name}`}
        >
          <Ionicons
            name={starred ? 'star' : 'star-outline'}
            size={24}
            color={starred ? colors.warm : colors.textSubtle}
          />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.riverName, { color: colors.text }]}>{river.name}</Text>
        <Text style={[styles.riverMeta, { color: colors.textMuted }]}>
          {river.region ?? river.state}
          {river.lengthMiles ? ` · ${Math.round(river.lengthMiles)} river miles` : ''}
        </Text>

        {/* ── Which gauge everything below is about ─────────────
            ABOVE THE CARD, not buried inside it. It used to sit under the
            reading scale, on the reasoning that the primary gauge's number is
            what opens and the picker is only an offer to look further. That was
            true when it moved one number. It now re-reads the whole panel — the
            condition, the scale, the 72-hour strip, the weather and Eddy's
            report all follow it — and a control with that much reach cannot be
            discovered halfway down the thing it controls. Read in order, the
            screen now says which stretch, then what it is doing, then what to
            do about it. */}
        <GaugePicker
          gauges={gauges}
          riverSlug={slug}
          selectedId={pickedGaugeId ?? gauges.find((g) => gaugeLink(g, slug)?.isPrimary)?.id ?? ''}
          onSelect={setPickedGaugeId}
        />

        {/* ── Live status ─────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: colors.card }, elevation(2)]}>
          <View style={styles.statusHead}>
            <Otter mood={otterForCondition(code)} size={64} />
            <View style={styles.statusHeadText}>
              <View
                style={[
                  styles.conditionChip,
                  { backgroundColor: conditionBg(code), borderColor: conditionChipBorder(code) },
                ]}
              >
                <Text style={[styles.conditionChipText, { color: conditionInk(code) }]}>
                  {conditionLongLabel(code)}
                </Text>
              </View>
              {reading ? (
                // Geist Mono, not the body face. Proportional digits change
                // width as the number ticks, so a reading going 1.51 -> 1.62
                // would shift this whole row.
                <Text style={[styles.reading, { color: colors.text }]}>
                  {formatReading(reading.value, reading.unit)}
                </Text>
              ) : (
                <Text style={[styles.noReading, { color: colors.textMuted }]}>
                  No gauge reading available
                </Text>
              )}
            </View>
          </View>

          {/* The scale the number sits on. Placed directly under the reading
              because it is the reading's context, not a separate fact — "944
              cfs" is only a decision once you can see it is nowhere near flood. */}
          {scaleThresholds && reading ? (
            <ReadingScale
              thresholds={scaleThresholds}
              value={reading.value}
              unit={reading.unit}
            />
          ) : null}

          {/* PRIMARY ONLY. The percentile comes from /api/conditions and is
              computed for the river's rated gauge, so printing it under another
              station's reading would attach a statistic to the wrong water. */}
          {percentileText && !pickedGauge ? (
            <View style={[styles.percentileRow, { borderTopColor: colors.border }]}>
              <Text style={[styles.percentileText, { color: colors.text }]}>{percentileText}</Text>
              <Text style={[styles.percentileMeta, { color: colors.textSubtle }]}>
                {/* "for flow" is load-bearing. The percentile is computed from
                    DISCHARGE only — it is null unless the gauge reported cfs —
                    so on a ft-rated river it sits directly under a stage
                    reading while describing a different quantity entirely.
                    Unlabelled, it reads as a judgement about the number above. */}
                {percentileLabel(condition?.percentile)}
                {condition?.percentile != null ? ' for flow' : ''}
              </Text>
            </View>
          ) : null}

          {readingAgeHours != null ? (
            <Text style={[styles.updated, { color: colors.textSubtle }]}>
              {readingAge(readingAgeHours)}
              {shownGaugeName ? ` · ${shownGaugeName}` : ''}
            </Text>
          ) : null}

          {caveat ? (
            <View style={[styles.caveat, { backgroundColor: conditionBg('unknown') }]}>
              <Ionicons name="alert-circle-outline" size={15} color={colors.textMuted} />
              <Text style={[styles.caveatText, { color: colors.textMuted }]}>{caveat}</Text>
            </View>
          ) : null}
        </View>

        {/* ── What it means. Directly under the status card, because the card
               above says what the river IS and this says what to do about it.
               Hidden entirely when the river has no gauge or every upstream
               source failed — an empty interpretation is worse than none. ── */}
        {outlook ? (
          <EddyTake
            outlook={outlook}
            ratedUnit={reading?.unit ?? null}
            entitled={entitled}
            onUpgrade={() => setPaywallOpen(true)}
          />
        ) : outlookLoading ? (
          // A placeholder the height of a sentence, not a full-card skeleton.
          // This panel is absent on plenty of rivers, so the loading state has
          // to be quiet enough that its disappearance is not a loss.
          <View style={[styles.card, styles.outlookLoading, { backgroundColor: colors.card }]}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={[styles.outlookLoadingText, { color: colors.textMuted }]}>
              {shownGaugeName ? `Reading ${shownGaugeName}…` : 'Reading the gauge…'}
            </Text>
          </View>
        ) : null}

        {/* AFTER the take, not before it. These photos are banded by condition,
            so they illustrate a verdict — and putting them above the verdict
            asked the reader to interpret a picture of brown water before
            anything on the screen had told them what brown water meant here.
            Absent on most rivers (three of twenty-four have any), which is why
            nothing below shifts on the ones without. */}
        {visuals ? <RiverVisuals data={visuals} /> : null}

        {/* ── The bell. ──
            Two states, because a button that reads the same before and after
            you press it cannot tell you whether it worked. The "on" state is
            deliberately quiet — outlined rather than filled — so the screen
            stops selling something the user has already agreed to.

            The copy no longer says "when it's floatable": the subscription is
            `kind: 'all'`, so it covers danger too, and it is standing rather
            than one-shot. */}
        <Pressable
          onPress={onNotify}
          disabled={subscribing}
          style={({ pressed }) => [
            styles.notifyButton,
            subscribed
              ? {
                  backgroundColor: pressed ? colors.cardRaised : 'transparent',
                  borderWidth: 1,
                  borderColor: colors.border,
                }
              : { backgroundColor: pressed ? colors.accentPressed : colors.accent },
          ]}
          accessibilityRole="button"
          accessibilityLabel={
            subscribed ? `Turn off alerts for ${river.name}` : `Alert me about ${river.name}`
          }
        >
          {subscribing ? (
            <ActivityIndicator color={subscribed ? colors.textMuted : colors.onAccent} size="small" />
          ) : (
            <Ionicons
              name={subscribed ? 'notifications' : 'notifications-outline'}
              size={18}
              color={subscribed ? colors.success : colors.onAccent}
            />
          )}
          <Text
            style={[styles.notifyText, { color: subscribed ? colors.text : colors.onAccent }]}
          >
            {subscribed ? "Alerts are on — tap to turn off" : 'Alert me about this river'}
          </Text>
        </Pressable>

        {subscribeError ? (
          <Text style={[styles.notifyError, { color: colors.error }]}>{subscribeError}</Text>
        ) : null}

        {/* ── Hazards. Free, and above access points on purpose. ──
            COLLAPSED, BUT NEVER SILENT. This section used to open showing the
            dangerous ones, so folding it shut could hide that a river has a
            low-water dam on it. The header therefore carries the count and a
            dot per critical hazard in its own severity colour — the fold hides
            the detail, not the warning. */}
        {sortedHazards.length > 0 ? (
          <CollapsibleSection
            title="Hazards"
            summary={
              criticalCount > 0
                ? `${criticalCount} need${criticalCount === 1 ? 's' : ''} attention · ${sortedHazards.length} total`
                : `${sortedHazards.length} noted`
            }
            trailing={
              <View style={styles.severityCues}>
                {sortedHazards
                  .filter((h) => hazardConditionCode(h.severity) === 'dangerous')
                  .slice(0, 3)
                  .map((h) => (
                    <View
                      key={h.id}
                      style={[styles.severityCue, { backgroundColor: conditionColor('dangerous') }]}
                    />
                  ))}
              </View>
            }
          >
            {shownHazards.map((hazard) => {
              const hazardCode = hazardConditionCode(hazard.severity);
              const portage = portageNote(hazard);
              return (
                <View
                  key={hazard.id}
                  style={[styles.card, { backgroundColor: colors.card }, elevation(1)]}
                >
                  <View style={styles.hazardHead}>
                    <View
                      style={[styles.severityDot, { backgroundColor: conditionColor(hazardCode) }]}
                    />
                    <Text style={[styles.hazardName, { color: colors.text }]}>{hazard.name}</Text>
                  </View>
                  <Text style={[styles.hazardMeta, { color: colors.textMuted }]}>
                    {severityLabel(hazard.severity)} · {hazardTypeLabel(hazard.type)}
                    {hazard.riverMile ? ` · Mile ${hazard.riverMile}` : ''}
                  </Text>
                  {hazard.description ? (
                    <Text style={[styles.hazardBody, { color: colors.textMuted }]}>
                      {hazard.description}
                    </Text>
                  ) : null}
                  {portage ? (
                    <View
                      style={[styles.portage, { backgroundColor: conditionBg(hazardCode) }]}
                    >
                      <Ionicons name="walk-outline" size={14} color={conditionInk(hazardCode)} />
                      <Text style={[styles.portageText, { color: conditionInk(hazardCode) }]}>
                        {portage}
                      </Text>
                    </View>
                  ) : null}
                </View>
              );
            })}

            {hiddenCount > 0 && !showAllHazards ? (
              <Pressable onPress={() => setShowAllHazards(true)} style={styles.moreRow} hitSlop={8}>
                <Text style={[styles.moreText, { color: colors.accent }]}>
                  Show {hiddenCount} more {hiddenCount === 1 ? 'hazard' : 'hazards'}
                </Text>
              </Pressable>
            ) : null}
          </CollapsibleSection>
        ) : null}

        {/* ── Access points ───────────────────────────────────── */}
        {accessPoints.length > 0 ? (
          <CollapsibleSection
            title="Access points"
            leading={<EddySymbol name="accessPoint" size={18} />}
            summary={`${accessPoints.length} put-in${accessPoints.length === 1 ? '' : 's'} and take-out${accessPoints.length === 1 ? '' : 's'}`}
          >
            {/* TAPPABLE, and to somewhere useful. These were flat rows: they
                named a place and a river mile and then did nothing, which on a
                list of put-ins is the one obvious question left unanswered —
                how do I get there. Directions is the answer the whole row is
                about, and it is the same handoff the plan screen's endpoints
                already make, so the two behave alike.

                Apple Maps by coordinate, never by name: "Akers Ferry" is
                ambiguous to a geocoder and most Ozark access points are not in
                one at all. See src/lib/directions.ts. */}
            {accessPoints.map((point) => (
              <Pressable
                key={point.id}
                onPress={() => void Linking.openURL(driveToUrl(point))}
                style={({ pressed }) => [
                  styles.accessRow,
                  { backgroundColor: colors.card, opacity: pressed ? 0.6 : 1 },
                  elevation(1),
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Directions to ${point.name}, mile ${point.riverMile}`}
              >
                {/* WHAT IT LOOKS LIKE. A put-in's name is a label and its river
                    mile is a coordinate; neither answers the question people
                    actually have standing in a driveway with a boat on the
                    roof, which is whether they can get down there. The photo
                    does, and it has been on the wire all along — see imageUrls
                    on MapAccessPoint.

                    The icon stays for every point without one, rather than a
                    grey placeholder box: coverage is partial by nature, and a
                    row that looks broken is worse than a row that is plain.
                    `isPublic` keeps its cue in the meta line below either way. */}
                {point.imageUrls?.[0] ? (
                  <Image
                    source={{ uri: point.imageUrls[0] }}
                    style={[styles.accessThumb, { backgroundColor: colors.cardRaised }]}
                    // Required by RN's a11y lint: a photograph must not be
                    // colour-inverted by Smart Invert, unlike UI chrome.
                    accessibilityIgnoresInvertColors
                  />
                ) : (
                  <Ionicons
                    name={point.isPublic ? 'location' : 'lock-closed-outline'}
                    size={17}
                    color={point.isPublic ? colors.accent : colors.textSubtle}
                  />
                )}
                <View style={styles.accessBody}>
                  <Text style={[styles.accessName, { color: colors.text }]}>{point.name}</Text>
                  <Text style={[styles.accessMeta, { color: colors.textMuted }]}>
                    {/* What is actually there, from the same resolver the map
                        callout uses — a boat ramp you can camp at is a
                        different stop from a gravel bar. */}
                    {[
                      `Mile ${point.riverMile}`,
                      ...accessPointTypes(point).map(accessTypeLabel),
                      point.isPublic ? null : 'Private',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                <Ionicons name="navigate-outline" size={16} color={colors.accent} />
              </Pressable>
            ))}
          </CollapsibleSection>
        ) : null}

        <Text style={[styles.footnote, { color: colors.textSubtle }]}>
          Conditions come from USGS gauges and can trail the river. Always judge the water in front
          of you.
        </Text>
      </ScrollView>

      {/* Only Eddy's written read opens this now. The bell used to, and does
          not: nothing about being alerted is for sale. */}
      <PaywallSheet
        visible={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        riverName={river.name}
      />

      <AlertSignInSheet
        visible={signInOpen}
        riverName={river.name}
        onSignedIn={() => {
          setSignInOpen(false);
          // Finish what they tapped. The session is live now, so this is the
          // same call that failed a moment ago.
          void subscribe();
        }}
        onDismiss={() => setSignInOpen(false)}
      />

      <PushPrimer
        visible={primerOpen}
        riverName={river.name}
        onAllow={async () => {
          setPrimerOpen(false);
          // Spends the one-shot prompt. The outcome needs no handling here:
          // the subscription already exists either way, and someone who
          // declines still sees the change in the Alerts feed.
          await enable();
        }}
        onDismiss={() => setPrimerOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  errorTitle: { ...t.lg, fontFamily: fonts.semibold },
  backLink: { ...t.sm, fontFamily: fonts.semibold },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 6,
  },
  body: { paddingHorizontal: 16, paddingBottom: 40 },
  riverName: { ...t['3xl'], fontFamily: fonts.display, paddingHorizontal: 4, marginTop: 6 },
  riverMeta: { ...t.sm, fontFamily: fonts.body, paddingHorizontal: 4, marginTop: 2, marginBottom: 16 },
  card: { padding: 16, borderRadius: 16, marginBottom: 10 },
  statusHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusHeadText: { flex: 1, gap: 8 },
  conditionChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  conditionChipText: { ...t.xs, fontFamily: fonts.semibold },
  reading: { ...t['2xl'], fontFamily: fonts.mono },
  noReading: { ...t.sm, fontFamily: fonts.body },
  percentileRow: { marginTop: 14, paddingTop: 12, borderTopWidth: 1 },
  percentileText: { ...t.sm, fontFamily: fonts.semibold },
  percentileMeta: { ...t.xs, fontFamily: fonts.mono, marginTop: 2 },
  updated: { ...t.xs, fontFamily: fonts.body, marginTop: 10 },
  caveat: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    marginTop: 12,
    padding: 10,
    borderRadius: 10,
  },
  caveatText: { ...t.xs, fontFamily: fonts.body, flex: 1 },
  outlookLoading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  outlookLoadingText: { ...t.sm, fontFamily: fonts.body, flex: 1 },
  notifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 4,
    marginBottom: 22,
  },
  notifyText: { ...t.base, fontFamily: fonts.heading },
  notifyError: { ...t.xs, fontFamily: fonts.body, textAlign: 'center', marginTop: -14, marginBottom: 20 },
  section: { marginBottom: 18 },
  severityCues: { flexDirection: 'row', gap: 4 },
  severityCue: { width: 8, height: 8, borderRadius: 999 },
  sectionTitle: { ...t.lg, fontFamily: fonts.heading, marginBottom: 10, paddingHorizontal: 4 },
  hazardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  severityDot: { width: 10, height: 10, borderRadius: 999 },
  hazardName: { ...t.base, fontFamily: fonts.semibold, flex: 1 },
  hazardMeta: { ...t.xs, fontFamily: fonts.body, marginTop: 4 },
  hazardBody: { ...t.sm, fontFamily: fonts.body, marginTop: 8 },
  portage: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  portageText: { ...t.xs, fontFamily: fonts.semibold },
  moreRow: { alignItems: 'center', paddingVertical: 8 },
  moreText: { ...t.sm, fontFamily: fonts.semibold },
  accessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 13,
    borderRadius: 12,
    marginBottom: 8,
  },
  // 52pt: big enough to read a ramp and a treeline, small enough that a river
  // with thirty access points is still a list rather than a gallery. `cover`
  // because these are landscape photographs in a square well, and letterboxing
  // them would spend the height on nothing.
  accessThumb: { width: 52, height: 52, borderRadius: 10, resizeMode: 'cover' },
  accessBody: { flex: 1 },
  accessName: { ...t.sm, fontFamily: fonts.semibold },
  accessMeta: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  footnote: { ...t.xs, fontFamily: fonts.body, textAlign: 'center', paddingHorizontal: 24, marginTop: 6 },
});
