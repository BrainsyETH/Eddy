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
  MapGauge,
  RiverConditionDetail,
  RiverListItem,
  RiverOutlookResponse,
  RiverVisualsResponse,
  DamSnapshot,
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
  fetchDams,
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
import { RiverDamPanel, damForRiver } from '@/components/dam/RiverDamPanel';
import { RiverReaches } from '@/components/river/RiverReaches';
import { GaugeChart } from '@/components/GaugeChart';
import { OUTFITTER_SERVICE_TYPES } from '@/map/layers';
import { Otter, otterForCondition } from '@/components/Otter';
import { CollapsibleSection } from '@/components/CollapsibleSection';
import { GaugePicker } from '@/components/GaugePicker';
import { RiverVisuals } from '@/components/RiverVisuals';
import { PhotoSubmitSheet } from '@/components/PhotoSubmitSheet';
import { ShareButton } from '@/components/ShareButton';
import { FeedbackSheet } from '@/components/FeedbackSheet';
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
import { readIndex } from '@/lib/riverCache';
import { useRiverData } from '@/hooks/useRiverData';


/**
 * "We could not ask", said once, quietly.
 *
 * Matches the map's readingsNotice exactly — same glyph, same cardRaised
 * ground, same shape of sentence: what is missing, then what the screen is
 * therefore doing. It is deliberately not an error banner: the rest of the
 * screen is working, and only one claim is being withdrawn.
 *
 * Local to this screen rather than extracted — one file, two uses.
 */
function UnavailableNote({ text, onRetry }: { text: string; onRetry: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.notice, { backgroundColor: colors.cardRaised }]}>
      <Ionicons name="cloud-offline-outline" size={14} color={colors.textMuted} />
      <Text style={[styles.noticeText, { color: colors.textMuted }]}>{text}</Text>
      <Pressable onPress={onRetry} hitSlop={8} accessibilityRole="button">
        <Text style={[styles.retryLink, { color: colors.interactive }]}>Try again</Text>
      </Pressable>
    </View>
  );
}

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
  /** Bumped by "Try again"; re-runs the load effect without blanking the screen. */
  const [reloadNonce, setReloadNonce] = useState(0);
  /** The last slug that finished loading, so a retry is not a first load. */
  const loadedSlug = useRef<string | null>(null);

  /**
   * Re-runs the whole load effect.
   *
   * Screen-scoped in mechanism even though it is offered per section, because
   * both fetches share one effect and one AbortController — a retry that
   * claimed to reload only hazards would be lying about what it does.
   */
  const retry = useCallback(() => setReloadNonce((n) => n + 1), []);

  /**
   * The parts of this river that are safe to keep on the phone, each carrying
   * where it came from.
   *
   * This replaced a pair of `hazardsFailed` / `accessFailed` booleans. A boolean
   * says "we could not ask"; with a cache the honest answer has three values,
   * because "we could not ask but we kept what we last saw" is a completely
   * different screen from "we could not ask and have nothing" — and rendering
   * either as an empty section is the failure-as-absence bug this screen was
   * fixed for once already.
   */
  const { hazards, accessPoints, services, reaches, source } = useRiverData(
    slug,
    reloadNonce,
  );
  const [outlook, setOutlook] = useState<RiverOutlookResponse | null>(null);
  const [visuals, setVisuals] = useState<RiverVisualsResponse | null>(null);
  const [gauges, setGauges] = useState<MapGauge[]>([]);
  const [dam, setDam] = useState<DamSnapshot | null>(null);
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
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);

  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    // Only the FIRST load of a river blanks the screen. `loading` swaps the
    // whole screen for a spinner, so a retry tapped inside the Hazards section
    // would throw away your scroll position and every section's open/shut state
    // — a worse screen than the one you tapped it on.
    setLoading(loadedSlug.current !== slug);

    (async () => {
      try {
        // The rivers list is the only place carrying the river's id and current
        // condition code together, and it is CDN-cached, so this is cheap.
        //
        // ── Why this one falls back to disk and the rest do not ─────────────
        // Every other call below has its own catch and degrades to a missing
        // section. This one is awaited ALONE and outside that Promise.all, so
        // its failure reached the outer catch and replaced the whole screen
        // with "River not found" — losing signal did not degrade the river
        // screen, it deleted it, and no amount of caching further down would
        // have been reached. The index is therefore the first thing kept.
        //
        // A cached index is a fine answer here: it carries a name, an id and a
        // slug, none of which move. The CONDITION it also carries is live data
        // and is not trusted — fetchCondition below is the authority, and when
        // that fails the screen shows no verdict rather than a stale one.
        let rivers: RiverListItem[];
        try {
          rivers = await fetchRivers(controller.signal);
        } catch (err) {
          if (err instanceof ApiError && err.message === 'Request cancelled') return;
          const cached = await readIndex();
          if (!cached) throw err;
          rivers = cached.payload;
        }

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
        // Hazards, access points, outfitters and reaches are NOT here: they are
        // the cacheable parts, and useRiverData above owns both fetching them
        // and saying whether what you are reading came off the network or off
        // the disk. What is left in this Promise.all is everything that
        // describes the STATE of the water, which is never served from cache.
        const [cond, looks, allGauges, dams] = await Promise.all([
          fetchCondition(match.id, controller.signal).catch(() => null),
          // Thin coverage by nature — verified community photos exist for three
          // rivers of twenty-four — so a null here is the ordinary case and the
          // card just does not render.
          fetchRiverVisuals(slug, controller.signal).catch(() => null),
          // Statewide and CDN-cached, and the only place carrying every gauge's
          // ladder PER RIVER — which is what lets the picker below grade a
          // shared station against this river rather than its neighbour's.
          // Failing just means no picker; the primary reading is unaffected.
          fetchGauges(controller.signal).catch(() => [] as MapGauge[]),
          // The dam controlling this reach, if one does. Ten items, CDN-cached,
          // and already returning [] on failure — so this costs one cheap
          // request to answer a question with no endpoint of its own, rather
          // than adding /api/rivers/[slug]/dam for a panel that is absent on
          // every river but one.
          fetchDams(controller.signal),
        ]);
        setCondition(cond);
        setVisuals(looks);
        setGauges(gaugesForRiver(allGauges, slug));
        setDam(damForRiver(dams, slug));
        setError(null);
      } catch (err) {
        if (err instanceof ApiError && err.message === 'Request cancelled') return;
        setError(err instanceof ApiError ? err.message : 'Could not load this river');
      } finally {
        loadedSlug.current = slug;
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [slug, reloadNonce]);

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
    //
    // ONLY A SUCCESS IS CACHED, and the ordering is the whole fix. The catch
    // used to run first, so a failure resolved to null and was written to the
    // cache like any other answer — and since a hit is tested with
    // `cached !== undefined`, that null was a HIT. One transient 500 pinned "no
    // outlook" on that gauge for the life of the screen, and re-picking it
    // could never retry. Staying silent about a failure is the right product
    // call; remembering it is not.
    fetchRiverOutlook(slug, controller.signal, askedFor)
      .then((data) => {
        outlookCache.current.set(key, data);
        return data;
      })
      .catch(() => null)
      .then((data) => {
        if (controller.signal.aborted) return;
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
        <ActivityIndicator color={colors.interactive} />
      </SafeAreaView>
    );
  }

  if (error || !river) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered, { backgroundColor: colors.bg }]}>
        <Otter mood="flag" size={110} />
        <Text style={[styles.errorTitle, { color: colors.text }]}>{error ?? 'River not found'}</Text>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={[styles.backLink, { color: colors.interactive }]}>Go back</Text>
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
  // The station the chart plots, resolved the same way as the name beside it so
  // the two can never describe different gauges. Null on a river with none.
  const shownSiteId = pickedGauge ? pickedGauge.usgsSiteId : (condition?.gaugeUsgsId ?? null);

  // Not memoised: this is a filter over a list of a few dozen that only changes
  // when the fetch lands, and a useMemo below three early returns would be a
  // conditional hook. Same reason the sorted hazards above are computed inline.
  const outfitters = services.filter((s) => OUTFITTER_SERVICE_TYPES.includes(s.type));

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
        <View style={styles.navActions}>
          {/* river.path is the WEBSITE's /rivers/<state>/<slug>, served by the
              API. This screen's own route has no state segment and cannot be
              turned into a working link — see src/lib/share.ts. */}
          <ShareButton title={river.name} path={river.path} label={`Share ${river.name}`} />
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

        {/* The river's own stretches, each with the gauge that actually reads
            it. Directly under the status card because a reach IS the river —
            everything below this point interprets it. */}
        <RiverReaches reaches={reaches} />

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
            <ActivityIndicator size="small" color={colors.interactive} />
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
        {visuals ? (
          <RiverVisuals
            data={visuals}
            // Only offered once there is somewhere to file a photo. The sheet
            // requires an access point with a coordinate — the route validates
            // the position against a corridor around the river — so before the
            // access points land there is nothing the sheet could complete.
            onAddPhoto={accessPoints.length > 0 ? () => setPhotoOpen(true) : undefined}
          />
        ) : null}

        {/* ── The dam, when one controls this reach. ──
            BELOW the photos rather than above Eddy's Take, which is where it
            used to sit. The old argument was that on a regulated river the
            release IS the reason for the reading, so the dam belonged next to
            the number it explains. True, and still the reason this is not
            further down — but it put a turbine schedule between the verdict and
            what the river looks like, which is machinery interrupting the two
            things somebody opened the screen to read. The column now runs:
            what the river IS, what to do about it, what that looks like, and
            then why it is doing that.

            Renders nothing on the other twenty-three rivers, so nothing below
            shifts on any of them. */}
        <RiverDamPanel dam={dam} />

        {/* ── How it got to that number ──────────────────────────
            BELOW the photos, and that order is the argument the whole column
            makes: the card says what the river IS, the take says what to do
            about it, the photos say what that looks like, and this says how it
            got there. A hydrograph above any of them is a shape with nothing
            to interpret it.

            Follows the PICKER, like everything else on this screen since the
            outlook started to — a chart of Van Buren under a Montauk reading is
            the exact mismatch that effect was written to end. The unit and the
            bands come from the SAME link the reading and the scale use, so the
            three cannot disagree; GaugeChart drops the shading itself if that
            ladder is in a unit it is not drawing.

            Absent when the river has no gauge at all. There is nothing to plot
            and nothing to apologise for. */}
        {shownSiteId ? (
          <GaugeChart
            siteId={shownSiteId}
            unit={reading?.unit ?? scaleThresholds?.thresholdUnit ?? 'cfs'}
            thresholds={scaleThresholds}
            title="Recent history"
          />
        ) : null}

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
              : {
                  backgroundColor: pressed
                    ? colors.accentFillPressed
                    : colors.accentFill,
                },
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

        {/* The bell stays a ONE-TAP control — it is the conversion moment and
            an extra decision in front of it would cost more than it buys. This
            is the door out to everything the bell deliberately does not ask:
            floatable-only, safety-only, once, or a level of your own. */}
        <Pressable
          onPress={() =>
            router.push({
              pathname: '/alerts/configure',
              params: {
                scope: 'river',
                riverId: river.id,
                riverSlug: river.slug,
                riverName: river.name,
              },
            })
          }
          style={({ pressed }) => [styles.customizeButton, { opacity: pressed ? 0.6 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={`Set a custom alert for ${river.name}`}
        >
          <Text style={[styles.customizeText, { color: colors.textMuted }]}>
            {subscribed ? 'Set a different alert' : 'Or set your own level'}
          </Text>
        </Pressable>

        {/* ── Hazards. Free, and above access points on purpose. ──
            COLLAPSED, BUT NEVER SILENT. This section used to open showing the
            dangerous ones, so folding it shut could hide that a river has a
            low-water dam on it. The header therefore carries the count and a
            dot per critical hazard in its own severity colour — the fold hides
            the detail, not the warning. */}
        {/* Renders when the load produced NOTHING AT ALL — no answer and no
            cached copy — even though there is nothing to list. A hidden section
            reads as "no hazards", which is the false negative that matters most
            on this screen, and CollapsibleSection's own header already argues a
            section "has to say what it is hiding".

            Note the test is `missing`, not "not live". A river drawn from cache
            renders as an ordinary river: a hazard we stored three weeks ago is
            the same hazard, and hedging it would teach people to discount
            hazard copy. Only having nothing to say earns the notice. */}
        {sortedHazards.length > 0 || source.hazards === 'missing' ? (
          <CollapsibleSection
            title="Hazards"
            defaultExpanded={source.hazards === 'missing'}
            leading={<EddySymbol name="hazard" size={18} />}
            summary={
              source.hazards === 'missing'
                ? 'Could not be loaded'
                : criticalCount > 0
                  ? `${criticalCount} need${criticalCount === 1 ? 's' : ''} attention · ${sortedHazards.length} total`
                  : `${sortedHazards.length} noted`
            }
            trailing={
              source.hazards === 'missing' ? (
                <Ionicons name="cloud-offline-outline" size={14} color={colors.textMuted} />
              ) : (
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
              )
            }
          >
            {source.hazards === 'missing' ? (
              <UnavailableNote
                text="Hazards unavailable — this river may have hazards that are not shown."
                onRetry={retry}
              />
            ) : null}
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
                <Text style={[styles.moreText, { color: colors.interactive }]}>
                  Show {hiddenCount} more {hiddenCount === 1 ? 'hazard' : 'hazards'}
                </Text>
              </Pressable>
            ) : null}
          </CollapsibleSection>
        ) : null}

        {/* ── Access points ───────────────────────────────────── */}
        {/* Access points get a plain inline notice rather than an opened
            section: a missing put-in list is an inconvenience, not a hazard,
            and expanding a section to hold one grey line is noise on an already
            dense screen. */}
        {source.access === 'missing' ? (
          <UnavailableNote
            text="Access points unavailable — put-ins for this river are not shown."
            onRetry={retry}
          />
        ) : null}

        {accessPoints.length > 0 ? (
          <CollapsibleSection
            title="Access points"
            leading={<EddySymbol name="accessPoint" size={18} />}
            summary={`${accessPoints.length} put-in${accessPoints.length === 1 ? '' : 's'} and take-out${accessPoints.length === 1 ? '' : 's'}`}
          >
            {/* THE ROW NOW OPENS THE PLACE; the arrow still opens Maps.

                These rows went straight to Apple Maps, which answered "how do I
                get there" and foreclosed every other question a put-in raises —
                is the last mile gravel, is there room for a trailer, is there a
                toilet, who runs a shuttle. All of that was already in the
                database and on the website, and the app had no screen for it.

                So the row is a destination and directions is a control ON the
                row, rather than the row being the control. Nothing that worked
                before stopped working: the navigate arrow to the right is the
                same one-tap handoff, still by coordinate and never by name —
                "Akers Ferry" is ambiguous to a geocoder and most Ozark access
                points are not in one at all. See src/lib/directions.ts.

                A point with no slug cannot be addressed, so it keeps the old
                behaviour of opening Maps directly rather than offering a
                destination that 404s. `slug` is optional on MapAccessPoint for
                exactly this reason. */}
            {accessPoints.map((point) => (
              <Pressable
                key={point.id}
                onPress={() =>
                  point.slug
                    ? router.push(
                        `/river/${slug}/access/${encodeURIComponent(point.slug)}`,
                      )
                    : void Linking.openURL(driveToUrl(point))
                }
                style={({ pressed }) => [
                  styles.accessRow,
                  { backgroundColor: colors.card, opacity: pressed ? 0.6 : 1 },
                  elevation(1),
                ]}
                accessibilityRole="button"
                accessibilityLabel={
                  point.slug
                    ? `${point.name}, mile ${point.riverMile}`
                    : `Directions to ${point.name}, mile ${point.riverMile}`
                }
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
                  // Eddy's mark, whether or not the point is public. A padlock
                  // here swapped the brand out for a warning glyph on the one
                  // row that most needs to look like a place you could go and
                  // ask; `isPublic` is stated in the meta line below instead.
                  <EddySymbol name="accessPoint" size={17} />
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
                {/* A SIBLING of the row's own Pressable, never a child — the
                    same arrangement RiverRow settled on for its star, so the
                    two touch areas cannot overlap and a tap near the arrow
                    cannot be ambiguous about which it meant. Only drawn where
                    the row itself goes somewhere else; on a slug-less point the
                    whole row is already the directions handoff. */}
                {point.slug ? (
                  <Pressable
                    onPress={() => void Linking.openURL(driveToUrl(point))}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`Directions to ${point.name}`}
                  >
                    <Ionicons name="navigate-outline" size={17} color={colors.interactive} />
                  </Pressable>
                ) : (
                  <Ionicons name="navigate-outline" size={16} color={colors.interactive} />
                )}
              </Pressable>
            ))}
          </CollapsibleSection>
        ) : null}

        {/* ── Outfitters ───────────────────────────────────────
            COLLAPSED, because this is not a safety fact and not why anyone
            opened the screen — but present, because "who rents a canoe on this
            river" was a question the app could answer from data it already
            fetched for the map and simply never showed anywhere a person reads
            about a river.

            OUTFITTERS AND SHUTTLES TOGETHER, campgrounds left out. A shuttle
            operator is what most people are actually looking for when they look
            for an outfitter, and separating the two would put one name under two
            headings; campgrounds are already their own map layer and their own
            question.

            The membership test is OUTFITTER_SERVICE_TYPES, the same constant
            the map's Outfitters layer filters on, rather than a list written
            out again here. A second definition of "what counts as an outfitter"
            is how the layer sheet and this section end up disagreeing about a
            business that appears on one and not the other.

            Rows carry only the actions that exist. A dial button on a service
            with no number is a control that fails when pressed. */}
        {outfitters.length > 0 ? (
          <CollapsibleSection
            title="Outfitters"
            leading={<EddySymbol name="outfitter" size={18} />}
            summary={`${outfitters.length} nearby`}
          >
            {outfitters.map((service) => (
              <View
                key={service.id}
                style={[styles.serviceRow, { backgroundColor: colors.card }, elevation(1)]}
              >
                <View style={styles.serviceBody}>
                  <Text style={[styles.serviceName, { color: colors.text }]} numberOfLines={1}>
                    {service.name}
                  </Text>
                  <Text style={[styles.serviceMeta, { color: colors.textMuted }]} numberOfLines={1}>
                    {[
                      [service.city, service.state].filter(Boolean).join(', '),
                      ...service.servicesOffered.slice(0, 2),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                {service.phone ? (
                  <Pressable
                    onPress={() =>
                      void Linking.openURL(`tel:${service.phone!.replace(/[^\d+]/g, '')}`)
                    }
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`Call ${service.name}`}
                  >
                    <Ionicons name="call-outline" size={19} color={colors.interactive} />
                  </Pressable>
                ) : null}
                {service.website ? (
                  <Pressable
                    onPress={() => void Linking.openURL(service.website!)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${service.name} website`}
                  >
                    <Ionicons name="open-outline" size={19} color={colors.interactive} />
                  </Pressable>
                ) : null}
              </View>
            ))}
          </CollapsibleSection>
        ) : null}

        <Text style={[styles.footnote, { color: colors.textSubtle }]}>
          Conditions come from USGS gauges and can trail the river. Always judge the water in front
          of you.
        </Text>

        {/* ── Directly under the disclaimer, on purpose ──
            The line above tells someone the reading can be wrong. This is what
            they can do about it when it was. Quiet, and last, because it is a
            correction to everything above rather than another thing to read —
            and it defaults to recalibration because on a river screen the thing
            people dispute is the verdict, not a spelling. */}
        <Pressable
          onPress={() => setFeedbackOpen(true)}
          style={({ pressed }) => [styles.reportRow, { opacity: pressed ? 0.6 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={`Report a problem with the ${river.name}`}
        >
          <Ionicons name="flag-outline" size={13} color={colors.textSubtle} />
          <Text style={[styles.reportText, { color: colors.textSubtle }]}>
            Didn&apos;t match the river? Tell us
          </Text>
        </Pressable>
      </ScrollView>

      <PhotoSubmitSheet
        visible={photoOpen}
        onDismiss={() => setPhotoOpen(false)}
        riverId={river.id}
        riverName={river.name}
        accessPoints={accessPoints}
      />

      <FeedbackSheet
        visible={feedbackOpen}
        onDismiss={() => setFeedbackOpen(false)}
        defaultType="gauge_recalibration"
        context={{
          type: 'river',
          id: river.id,
          name: river.name,
          data: {
            conditionCode: condition?.code ?? null,
            gaugeHeightFt: condition?.gaugeHeightFt ?? null,
            dischargeCfs: condition?.dischargeCfs ?? null,
            readingTimestamp: condition?.readingTimestamp ?? null,
            gaugeUsgsId: condition?.gaugeUsgsId ?? null,
          },
        }}
      />

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
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 10,
  },
  noticeText: { ...t.sm, fontFamily: fonts.body, flexShrink: 1 },
  retryLink: { ...t.sm, fontFamily: fonts.semibold },
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
  // The right-hand end of the nav row, now that share sits beside the star.
  navActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
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
  customizeButton: { alignItems: 'center', paddingVertical: 10, marginTop: -14, marginBottom: 18 },
  customizeText: { ...t.xs, fontFamily: fonts.semibold },
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
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 13,
  },
  serviceBody: { flex: 1 },
  serviceName: { ...t.sm, fontFamily: fonts.semibold },
  serviceMeta: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  footnote: { ...t.xs, fontFamily: fonts.body, textAlign: 'center', paddingHorizontal: 24, marginTop: 6 },
  reportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
  },
  reportText: { ...t.xs, fontFamily: fonts.medium },
});
