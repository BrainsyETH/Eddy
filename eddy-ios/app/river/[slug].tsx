// eddy-ios/app/river/[slug].tsx
// One river: what it's doing right now, what could hurt you, and where to get on.
//
// This is the screen the whole app was missing. River Reports listed rivers and
// tapping one went nowhere; the alert engine had no button; hazards existed in
// the database and appeared on no surface at all.
//
// Free/paid boundary:
//   FREE  condition, reading, the gauge picker, percentile context, hazards,
//         access points, the 72-hour rain and forecast-stage strip — and the bell
//   PAID  Eddy's take, whole: the written read, the weather paragraph and the
//         bottom line. The last two used to be free; see the header of EddyTake
//         for why the carve-out was withdrawn and what keeps it defensible.
//
// Everything FACTUAL about the water is free, and that is a rule rather than a
// description — see the header of PaywallSheet. What is sold is Eddy's writing
// about those facts, never the facts. The bell used
// to be the second paid affordance and is no longer: alerting is free in its
// entirety. It still needs an ACCOUNT, which is not a tier — a notification has
// to have somewhere to go, and an anonymous id is replaced on reinstall.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
  MapAccessPoint,
  MapGauge,
  RiverConditionDetail,
  RiverListItem,
  RiverOutlookResponse,
  RiverService,
  RiverVisual,
  RiverVisualsResponse,
  DamSnapshot,
} from '@eddy/types';
import {
  accessPointTypes,
  accessTypeLabel,
  campsiteAvailabilityLine,
  describeAlertRule,
  isCampground,
  serviceEligible,
  serviceTiers,
  type AlertSubscriptionKind,
} from '@eddy/types';
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
  conditionShortLabel,
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
import { SafetyDisclaimer } from '@/components/SafetyDisclaimer';
import { EddyTake } from '@/components/EddyTake';
import { damForRiver } from '@/components/dam/RiverDamPanel';
import { TailwaterStatusRow } from '@/components/dam/TailwaterStatusRow';
import { RiverReaches } from '@/components/river/RiverReaches';
import { GaugeChart } from '@/components/GaugeChart';
import { offeringLabel } from '@/map/serviceLayers';
import { Otter, otterForCondition } from '@/components/Otter';
import { CollapsibleSection } from '@/components/CollapsibleSection';
import { GaugePicker } from '@/components/GaugePicker';
import { RiverVisuals } from '@/components/RiverVisuals';
// Lazy, and NOT for bundle size. PhotoSubmitSheet imports expo-image-picker at
// module scope, so on a binary built before that native module existed this
// import threw while THIS file was still loading — killing the whole river
// screen over a feature nobody had touched. See PhotoSubmitSheetLazy's header.
import { PhotoSubmitSheetLazy } from '@/components/PhotoSubmitSheetLazy';
import { ShareButton } from '@/components/ShareButton';
import { FeedbackSheet } from '@/components/FeedbackSheet';
import { ReadingScale } from '@/components/ReadingScale';
import { PaywallSheet } from '@/components/PaywallSheet';
import { PushPrimer } from '@/components/PushPrimer';
import { AlertSignInSheet } from '@/components/AlertSignInSheet';
import { gaugeConditionCode, gaugeLink, gaugesForRiver } from '@/lib/gaugeCondition';
import { driveToUrl } from '@/lib/directions';
import { useAccount } from '@/hooks/useAccount';
import { useEddyUpdates } from '@/hooks/useEddyUpdates';
import { useAlertGate } from '@/hooks/useAlertGate';
import { useAlertRules } from '@/hooks/useAlertRules';
import { useSession } from '@/hooks/useSession';
import { useStarredRivers } from '@/hooks/useStarredRivers';
import { readConditions, readIndex } from '@/lib/riverCache';
import { useRiverData } from '@/hooks/useRiverData';
import { selectEddySays } from '@/lib/eddySays';
import { effectiveReadingAgeHours, readingBand } from '@/lib/offline-cache';
import { goBack } from '@/lib/nav';
import { TrendPill } from '@/components/TrendPill';

/**
 * What the one-tap bell subscribes to.
 *
 * Safety, not everything: it covers high and dangerous transitions without also
 * opting somebody into routine floatability news, and the full editor still
 * offers the broader choices. Named here so the subscribe call and the sentence
 * the push primer shows cannot drift — which is exactly what happened when the
 * primer's copy was written by hand against an earlier `kind: 'all'`.
 */
const BELL_KIND: AlertSubscriptionKind = 'safety';

/** "on high and dangerous water" — the shared phrasing, not a second copy. */
const BELL_PROMISE = describeAlertRule({
  mode: 'condition',
  conditionKind: BELL_KIND,
  metric: null,
  comparator: null,
  thresholdValue: null,
  thresholdValueMax: null,
});


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
/**
 * Direction, as a glyph. The same three the Today rows and Favorites cards use.
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

/**
 * One place on the river you can get to.
 *
 * Extracted so Access points and Campgrounds draw the SAME row rather than two
 * that look alike — a campground reached through the second heading has to open
 * the same detail screen, carry the same photo and hand over the same
 * coordinate as the one reached through the first, and two copies of eighty
 * lines of JSX is how that stops being true.
 */
function AccessRow({ point, riverSlug }: { point: MapAccessPoint; riverSlug: string }) {
  const router = useRouter();
  const { colors, elevation } = useTheme();

  return (
    /* THE ROW OPENS THE PLACE; the arrow still opens Maps.

       These rows went straight to Apple Maps, which answered "how do I get
       there" and foreclosed every other question a put-in raises — is the last
       mile gravel, is there room for a trailer, is there a toilet, who runs a
       shuttle. All of that was already in the database and on the website, and
       the app had no screen for it.

       So the row is a destination and directions is a control ON the row,
       rather than the row being the control. Nothing that worked before stopped
       working: the navigate arrow to the right is the same one-tap handoff,
       still by coordinate and never by name — "Akers Ferry" is ambiguous to a
       geocoder and most Ozark access points are not in one at all. See
       src/lib/directions.ts.

       A point with no slug cannot be addressed, so it keeps the old behaviour
       of opening Maps directly rather than offering a destination that 404s.
       `slug` is optional on MapAccessPoint for exactly this reason. */
    <Pressable
      onPress={() =>
        point.slug
          ? router.push(`/river/${riverSlug}/access/${encodeURIComponent(point.slug)}`)
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
      {/* WHAT IT LOOKS LIKE. A put-in's name is a label and its river mile is a
          coordinate; neither answers the question people actually have standing
          in a driveway with a boat on the roof, which is whether they can get
          down there. The photo does, and it has been on the wire all along —
          see imageUrls on MapAccessPoint.

          The icon stays for every point without one, rather than a grey
          placeholder box: coverage is partial by nature, and a row that looks
          broken is worse than a row that is plain. `isPublic` keeps its cue in
          the meta line below either way. */}
      {point.imageUrls?.[0] ? (
        <Image
          source={{ uri: point.imageUrls[0] }}
          style={[styles.accessThumb, { backgroundColor: colors.cardRaised }]}
          // Required by RN's a11y lint: a photograph must not be
          // colour-inverted by Smart Invert, unlike UI chrome.
          accessibilityIgnoresInvertColors
        />
      ) : (
        // Eddy's mark, whether or not the point is public. A padlock here
        // swapped the brand out for a warning glyph on the one row that most
        // needs to look like a place you could go and ask; `isPublic` is stated
        // in the meta line below instead.
        //
        // The CAMPGROUND mark on a place you can sleep at, since this row now
        // appears under two headings and the mark is the fastest way to tell
        // which kind of stop it is when it is not carrying a photo.
        <EddySymbol name={isCampground(point) ? 'campground' : 'accessPoint'} size={17} />
      )}
      <View style={styles.accessBody}>
        <Text style={[styles.accessName, { color: colors.text }]}>{point.name}</Text>
        <Text style={[styles.accessMeta, { color: colors.textMuted }]}>
          {/* What is actually there, from the same resolver the map callout
              uses — a boat ramp you can camp at is a different stop from a
              gravel bar. */}
          {[
            `Mile ${point.riverMile}`,
            ...accessPointTypes(point).map(accessTypeLabel),
            point.isPublic ? null : 'Private',
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
      {/* A SIBLING of the row's own Pressable, never a child — the same
          arrangement RiverRow settled on for its star, so the two touch areas
          cannot overlap and a tap near the arrow cannot be ambiguous about
          which it meant. Only drawn where the row itself goes somewhere else;
          on a slug-less point the whole row is already the directions
          handoff. */}
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
  );
}

/**
 * A business on the river: an outfitter, a shuttle, or a campground.
 *
 * Shared by Outfitters and Campgrounds. Rows carry only the actions that exist
 * — a dial button on a service with no number is a control that fails when
 * pressed.
 */
function ServiceRow({ service }: { service: RiverService }) {
  const { colors, elevation } = useTheme();

  return (
    <View style={[styles.serviceRow, { backgroundColor: colors.card }, elevation(1)]}>
      <View style={styles.serviceBody}>
        <Text style={[styles.serviceName, { color: colors.text }]} numberOfLines={1}>
          {service.name}
        </Text>
        <Text style={[styles.serviceMeta, { color: colors.textMuted }]} numberOfLines={1}>
          {[
            [service.city, service.state].filter(Boolean).join(', '),
            // Eddy's words, not the enum's. This printed the raw tokens —
            // "canoe_rental · kayak_rental" — which is the same lowercase
            // database string that used to reach the map as "cabin lodge".
            ...service.servicesOffered.slice(0, 2).map(offeringLabel),
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        {/* Live inventory, for the campgrounds in the section above. The field
            has been on the wire since availability shipped and this row was the
            one campground surface that never read it — so the river screen
            listed a state park by name and city while the map beside it knew
            how many sites were free. Null for most rows, and null renders
            nothing rather than "unknown". */}
        {campsiteAvailabilityLine(service.availability, service.name) ? (
          <Text style={[styles.serviceAvailability, { color: colors.text }]} numberOfLines={1}>
            {campsiteAvailabilityLine(service.availability, service.name)}
          </Text>
        ) : null}
      </View>
      {service.phone ? (
        <Pressable
          onPress={() => void Linking.openURL(`tel:${service.phone!.replace(/[^\d+]/g, '')}`)}
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
  );
}

export default function RiverDetailScreen() {
  // Set only when the reader arrived from somewhere that knows which water they
  // came for — today the dam screen. `section` names the reach to mark in the
  // reaches panel; `gauge` is the provider-native site id that reads it. Both
  // are optional, and an unknown value for either does nothing.
  const { slug, section, gauge: gaugeParam } = useLocalSearchParams<{
    slug: string;
    section?: string;
    gauge?: string;
  }>();
  const router = useRouter();
  const { colors, elevation } = useTheme();
  const { getAccessToken } = useSession();
  const { isStarred, toggleStar } = useStarredRivers();

  /**
   * Eddy's FREE line about this river, for the deck over EddyTake's read.
   *
   * INITIATES, unlike the map sheet's reader — this screen is reachable
   * directly from a deep link or a push, so it cannot assume the Today tab has
   * already filled the shared cache. One batched request covers every river and
   * is shared with every other surface that wants a line.
   *
   * Selected rather than read: selectEddySays returns a shape with no field the
   * paid quote could arrive in, which is what keeps the gated column out of a
   * free surface by construction rather than by care. See src/lib/eddySays.ts.
   */
  const { updates: eddyUpdates } = useEddyUpdates();
  const eddySays = selectEddySays(slug ? eddyUpdates?.[slug] : null);

  // Eddy's take is the one gated card on this screen, and it fails OPEN — see
  // the `entitled` computation below and the prop comment in EddyTake. Every
  // measured fact about the water stays free.
  const { entitlement, loaded: accountLoaded, error: accountError } = useAccount();

  const [river, setRiver] = useState<RiverListItem | null>(null);
  const [condition, setCondition] = useState<RiverConditionDetail | null>(null);
  /**
   * Set only when the condition on screen came off the disk, and carrying the
   * age it ACTUALLY has rather than the one it claims.
   *
   * readingAgeHours is a scalar the server computed at request time, so a
   * cached reading replayed three days later still says "1" and the screen
   * prints "Updated an hour ago" forever. The correction is the time elapsed
   * since the cache entry was written.
   *
   * Computed here in the effect rather than at render, because it needs a clock
   * and a component that reads one during render is not idempotent — the same
   * reading would band differently on two renders a few hours apart with no
   * state change to explain it.
   */
  const [cachedReadingAgeHours, setCachedReadingAgeHours] = useState<number | null | undefined>(
    undefined,
  );
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

  /**
   * The gauge the reader arrived on, when a dam sent them to a specific one.
   *
   * DERIVED, not stored. Writing it into pickedGaugeId from the fetch callback
   * meant the arrival was a side effect racing the load, and it re-entered the
   * outlook effect without being one of its dependencies. Derived, it is simply
   * a lower-priority default: an explicit pick always wins, and there is no
   * moment where the two disagree.
   *
   * No match means this river does not carry that station, and the primary
   * reading stands.
   */
  const arrivalGaugeId = gaugeParam
    ? (gauges.find((g) => g.usgsSiteId === gaugeParam)?.id ?? null)
    : null;

  /**
   * Which gauge the whole panel below reads — condition, scale, 72-hour strip,
   * weather and Eddy's report all follow it.
   *
   * This is what makes "open the river below this dam" true rather than merely
   * marked further down the page. It matters most on the river the feature
   * exists for: migration 00198 attaches Clearwater's release with
   * is_primary = false ON PURPOSE and get_river_condition filters
   * is_primary = TRUE, so the Black's headline is a gauge that is NOT the dam's
   * — and 00204 calls reading the above-dam gauge below the dam "the worst
   * place to be wrong".
   *
   * The picker sits visibly above the card and writes pickedGaugeId, so an
   * arrival is a starting position the reader can see and change, never a
   * hidden override.
   */
  const shownGaugeId = pickedGaugeId ?? arrivalGaugeId;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  // Session, sign-in sheet, push primer and the busy flag — the gate every
  // alert write passes through, shared with the full editor. See useAlertGate.
  const gate = useAlertGate();

  // This screen owns the BELL, but the Alerts tab owns the LIST, and they read
  // different things: the bell from its own fetchSubscriptions call below, the
  // list from AlertRulesProvider. /api/me/alerts already merges river
  // subscriptions and gauge rules server-side, so the data was never the
  // problem — the provider's copy simply went stale the moment the bell wrote
  // through it. Turning alerts off here left them listed as on over there.
  // `rules` as well as the refresh: turning the bell off DELETES, and the
  // server cascades that delete to every gauge alert parented to this
  // subscription. Counting them is the only way this screen can say so before
  // it happens — see unsubscribe.
  const { rules: alertRules, refresh: refreshAlertRules } = useAlertRules();
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
  /**
   * The community photo being reported, when the sheet was opened by its flag.
   *
   * Null is the ordinary case and means the sheet opens as it always has: a
   * gauge-recalibration report about the river. One sheet serves both because
   * they are the same form with different defaults, and two mounted modals to
   * express that would be two things to keep in step.
   */
  const [reportedPhoto, setReportedPhoto] = useState<RiverVisual | null>(null);
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
        // Start the network refresh immediately, but read disk first. On a
        // cache hit the identity needed by every request below is available
        // without a network round-trip; fetchRivers still refreshes the cache
        // alongside the screen.
        const networkIndex = fetchRivers(controller.signal).then(
          (value) => value,
          (err) => {
            if (err instanceof ApiError && err.message === 'Request cancelled') return null;
            return null;
          },
        );
        const cached = await readIndex();
        let rivers: RiverListItem[] | null = cached?.payload ?? null;
        if (!rivers) rivers = await networkIndex;
        if (!rivers) throw new ApiError('Could not load rivers');

        let match = rivers.find((r) => r.slug === slug) ?? null;
        // A newly-added river will not be in an older disk index. Give the
        // in-flight network index one chance before declaring it missing.
        if (!match && cached) {
          const refreshed = await networkIndex;
          match = refreshed?.find((r) => r.slug === slug) ?? null;
        }
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
        // the disk. These remaining requests describe the STATE of the water.
        // They settle independently so the primary condition never waits for
        // the statewide gauge list, photos, or dam metadata.
        void fetchCondition(match.id, controller.signal).then(
          // Settled rather than caught, because the two failures are different
          // screens. A THROWN request is "we could not ask", and the last
          // reading we kept — aged and labelled — beats a blank card at a put-in
          // with no signal. `available: false` is the server telling us this
          // river has no reading right now, which is an answer, and answering it
          // from disk would be re-showing stale water as current.
          (condition) => {
            if (controller.signal.aborted) return;
            setCondition(condition);
            setCachedReadingAgeHours(undefined);
          },
          async (err) => {
            if (err instanceof ApiError && err.message === 'Request cancelled') return;
            const stored = await readConditions();
            if (controller.signal.aborted) return;
            const kept = stored?.payload?.[match.id] ?? null;
            setCondition(kept);
            setCachedReadingAgeHours(
              kept
                ? effectiveReadingAgeHours(kept.readingAgeHours, stored!.fetchedAt, Date.now())
                : undefined,
            );
          },
        );
        // Thin coverage by nature — verified community photos exist for three
        // rivers of twenty-four — so a null here is the ordinary case and the
        // card just does not render.
        void fetchRiverVisuals(slug, controller.signal).then(
          (looks) => {
            if (!controller.signal.aborted) setVisuals(looks);
          },
          () => {
            if (!controller.signal.aborted) setVisuals(null);
          },
        );
        // Statewide and CDN-cached, and the only place carrying every gauge's
        // ladder PER RIVER — which is what lets the picker below grade a
        // shared station against this river rather than its neighbour's.
        // Failing just means no picker; the primary reading is unaffected.
        void fetchGauges(controller.signal).then(
          (allGauges) => {
            if (!controller.signal.aborted) setGauges(gaugesForRiver(allGauges, slug));
          },
          () => {
            if (!controller.signal.aborted) setGauges([]);
          },
        );
        // The dam controlling this reach, if one does. Ten items, CDN-cached,
        // and already returning [] on failure — so this costs one cheap
        // request to answer a question with no endpoint of its own, rather
        // than adding /api/rivers/[slug]/dam for a panel that is absent on
        // every river but one.
        void fetchDams(controller.signal).then(
          (dams) => {
            if (!controller.signal.aborted) setDam(damForRiver(dams, slug));
          },
          () => {
            if (!controller.signal.aborted) setDam(null);
          },
        );
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
    const askedFor = shownGaugeId && shownGaugeId !== primaryGaugeId ? shownGaugeId : null;
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
  }, [slug, shownGaugeId, primaryGaugeId]);

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
   * Safety is the one-tap default. It covers high and dangerous transitions
   * without also opting someone into routine floatability news; the full alert
   * editor still offers both broader choices.
   *
   * No paywall path any more. A missing session is an AUTH problem and gets a
   * sign-in sheet; presenting an offer to sell something to someone whose token
   * refresh just failed was never honest.
   */
  const subscribe = useCallback(async () => {
    if (!river) return;
    try {
      await gate.run(async (token) => {
        await subscribeToRiver(token, river.id, BELL_KIND);
        setSubscribed(true);
        // Local state first so the bell answers immediately; the provider
        // catches up in the background. Not awaited — a slow list must not
        // make the tap feel slow, and a failed refresh leaves a stale list
        // rather than a subscription that did not happen.
        void refreshAlertRules();
      });
    } catch {
      // The gate has already absorbed the two auth cases and opened the
      // sign-in sheet for them. Anything reaching here is a real failure.
      setSubscribeError('Could not turn on alerts. Try again.');
    }
  }, [river, gate, refreshAlertRules]);

  /**
   * The gauge alerts that would go with this river alert.
   *
   * `parent_subscription_id` is a foreign key with `on delete cascade`, so
   * unsubscribing here removes every gauge rule created from this alert's edit
   * screen — server-side, silently, and with no way back. The Alerts tab's
   * swipe-to-delete has always counted them in its confirmation; the bell
   * deleted the same rows and said nothing at all.
   *
   * Read from the rules list rather than fetched: /api/me/alerts already merges
   * both tables and the provider is holding the result. Empty when the list has
   * not loaded, which degrades to the plain confirmation rather than a wrong
   * count.
   */
  const cascadingAlerts = useCallback((): number => {
    const parent = (alertRules ?? []).find(
      (r) => r.source === 'river_condition' && r.riverId === river?.id,
    );
    if (!parent) return 0;
    return (alertRules ?? []).filter((r) => r.parentId === parent.id).length;
  }, [alertRules, river?.id]);

  /** Turn alerts off. Deliberately reachable — see Stage 3 of the alert plan. */
  const unsubscribe = useCallback(async () => {
    if (!river) return;
    try {
      await gate.run(
        async (token) => {
          await unsubscribeFromRiver(token, river.id);
          setSubscribed(false);
          // The direction that actually got reported: alerts turned off here
          // still showed as on in the Alerts tab, which reads as "the off
          // switch does nothing" on a feature whose whole promise is that it
          // stops.
          void refreshAlertRules();
        },
        // Turning alerts OFF must never ask for permission to send them.
        { primes: false },
      );
    } catch {
      setSubscribeError('Could not turn alerts off. Try again.');
    }
  }, [river, gate, refreshAlertRules]);

  const onNotify = useCallback(() => {
    setSubscribeError(null);
    if (!subscribed) {
      void subscribe();
      return;
    }

    // ── Turning the bell off can delete more than the bell ────────────────
    //
    // Only when it actually would. Switching off an alert with nothing hanging
    // off it is a reversible one-tap thing and putting a dialog in front of it
    // would be ceremony — the confirmation appears exactly when there is
    // something to lose that the button does not name.
    const count = cascadingAlerts();
    if (count === 0) {
      void unsubscribe();
      return;
    }

    Alert.alert(
      `Turn off alerts and delete ${count} more?`,
      `The ${count} gauge ${count === 1 ? 'alert' : 'alerts'} you set on ${river?.name ?? 'this river'} go with it. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Turn off', style: 'destructive', onPress: () => void unsubscribe() },
      ],
    );
  }, [subscribed, subscribe, unsubscribe, cascadingAlerts, river?.name]);

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
        <Pressable onPress={() => goBack(router)} hitSlop={10}>
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
  const pickedGauge = shownGaugeId ? gauges.find((g) => g.id === shownGaugeId) ?? null : null;
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
  const rawReadingAgeHours = pickedGauge ? pickedGauge.readingAgeHours : condition?.readingAgeHours;

  /**
   * How the reading is allowed to present itself.
   *
   * Only a CACHED condition earns a band; a live one keeps the behaviour it has
   * always had, where a stale gauge is handled by accuracyNote. The picked
   * gauge is never banded either — it comes from the live statewide fetch, not
   * from disk.
   *
   *   fresh    normal colour, plus an offline glyph on the age line
   *   stale    grey, and "Last known: Good" instead of "Good - Floatable"
   *   expired  grey, and the age is not printed at all — past two days the
   *            number stops being information and becomes decoration
   */
  const cachedReading = cachedReadingAgeHours !== undefined && !pickedGauge;
  const readingAgeHours = cachedReading ? cachedReadingAgeHours : rawReadingAgeHours;
  const band = cachedReading ? readingBand(cachedReadingAgeHours ?? null) : 'fresh';
  // A grey chip over a confident label would be the screen arguing with itself.
  const shownCode = band === 'fresh' ? code : 'unknown';
  const shownGaugeName = pickedGauge ? pickedGauge.name : condition?.gaugeName;
  // The station the chart plots, resolved the same way as the name beside it so
  // the two can never describe different gauges. Null on a river with none.
  const shownSiteId = pickedGauge ? pickedGauge.usgsSiteId : (condition?.gaugeUsgsId ?? null);

  // Not memoised: this is a filter over a list of a few dozen that only changes
  // when the fetch lands, and a useMemo below three early returns would be a
  // conditional hook. Same reason the sorted hazards above are computed inline.
  // ── ELIGIBLE, BUT NOT NECESSARILY MAPPABLE ──────────────────────────────
  // A LIST is the one surface where a service with no coordinates still belongs:
  // 128 of the directory's 156 rows have no geocode, and this section is where
  // a reader can still reach them. So `serviceEligible` applies — a closed
  // business is wrong here exactly as it is wrong on the map — and
  // `mappableService` deliberately does not.
  const outfitters = services.filter(
    (s) => serviceTiers(s).includes('rentals') && serviceEligible(s),
  );

  // ── The two halves of "where can I camp on this river" ──────────────────────
  // isCampground is the shared resolver in @eddy/types — the same one the map's
  // campground layer and the planner's overnight logic ask — so a place that
  // counts as a campground on the map counts as one here. Reading `type` alone
  // would miss every put-in tagged both, which is most of them.
  const campgroundPoints = accessPoints.filter(isCampground);
  // ── THE CAMPING TIER, NOT THE `campground` TYPE ────────────────────────
  //
  // This read `s.type === 'campground'` and so missed 36 businesses that record
  // a camping offering while being filed as something else — the canoe livery
  // with thirty riverside sites is the common case, and it is exactly the place
  // people ask this section about. It also kept closed rows, having never asked
  // `serviceEligible`.
  //
  // ── AND IT NO LONGER EXCLUDES THE OUTFITTERS ABOVE ────────────────────
  //
  // The old comment here said "services excluded from Outfitters above", which
  // was true while the two lists were mutually exclusive BY TYPE. They are not:
  // 40 of these businesses are in both tiers, because they rent boats and have
  // campsites. Both listings are true, and they answer different questions —
  // "who shuttles me" and "where do I sleep" — so the same name appearing under
  // both headings is the model working rather than a duplicate.
  //
  // That is a different thing from the duplication removed from the pin sheet,
  // where a campground was listed under "Outfitters and shuttles" AND under
  // "Camping nearby": there one of the two headings was simply wrong. Here each
  // row prints its own offerings, so a livery under Campgrounds reading
  // "Canoe rental · Primitive camping" explains itself.
  //
  // `mappableService` is deliberately NOT asked. This is a list, and a list is
  // the one surface where a service with no geocode still belongs — 128 of 156
  // have none, and this is where they stay reachable.
  const campgroundServices = services.filter(
    (s) => serviceTiers(s).includes('camping') && serviceEligible(s),
  );
  const campgroundTotal = campgroundPoints.length + campgroundServices.length;
  // Says how many of them you can also put in at, because that is the thing
  // this section is otherwise silently repeating from the list above it.
  const campgroundSummary =
    campgroundPoints.length > 0
      ? `${campgroundTotal} · ${campgroundPoints.length} you can also put in at`
      : `${campgroundTotal} on this river`;

  /**
   * Which way the water is going, for the station actually on screen.
   *
   * ── The outlook is the authority, because it FOLLOWS THE PICKER ───────────
   * /outlook?gaugeId re-reads the whole panel for whichever station the picker
   * is on and returns that station's trend with it. The rivers index also
   * carries one — it is what the Today and Favorites rows draw — but it is
   * always the RIVER's rated gauge, so on a five-gauge river it would print
   * Van Buren's direction under a Montauk reading. That is the same mismatch
   * the outlook effect was written to end.
   *
   * So: the outlook's trend when there is an outlook, the index's only while
   * the primary is the one being shown, and nothing at all otherwise. Nothing
   * is worse than a direction belonging to another stretch.
   *
   * Withheld on a CACHED reading for the same reason the percentile is: the
   * trend arrives live and the number beside it did not, and a fresh "Rising
   * fast" over a two-day-old reading is the screen contradicting itself.
   */
  const shownTrend =
    band !== 'fresh'
      ? null
      : (outlook?.trend ?? (pickedGauge ? null : (river.currentCondition?.trend ?? null)));

  const caveat = condition && !pickedGauge ? accuracyNote(condition) : null;

  const percentileText = percentileSentence(condition?.percentile);
  const starred = isStarred('river', river.id);
  const sortedHazards = sortHazards(hazards);
  const criticalCount = criticalHazards(hazards).length;
  const shownHazards = showAllHazards ? sortedHazards : criticalHazards(hazards);
  const hiddenCount = sortedHazards.length - shownHazards.length;

  // THREE states, because "we failed to find out" and "we have not found out
  // yet" call for opposite defaults.
  //
  // FAILS OPEN on error, same as the map's offline row: an unreachable
  // /api/me/profile means we do not KNOW whether this person subscribed, and
  // locking a paying customer's read on a river bank with one bar is a worse
  // outcome by far than letting an unsubscribed one read it. Null is that case.
  //
  // WAITS while loading. This used to collapse into the same null, so every
  // cold open painted the full paid report until the profile call returned —
  // the report leaked to non-subscribers on every launch, and subscribers saw
  // it flash out and back. 'pending' renders a skeleton instead.
  const entitled = !accountLoaded
    ? ('pending' as const)
    : accountError
      ? null
      : Boolean(entitlement?.isActive);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.navRow}>
        <Pressable onPress={() => goBack(router)} hitSlop={12} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <View style={styles.navActions}>
          {/* river.path is the WEBSITE's /rivers/<state>/<slug>, served by the
              API. This screen's own route has no state segment and cannot be
              turned into a working link — see src/lib/share.ts. */}
          <ShareButton
            title={river.name}
            path={river.path}
            label={`Share ${river.name}`}
            // The FREE summary, never the gated report. Null on a river with no
            // current update, and the message is then what it has always been.
            note={eddySays?.text ?? null}
          />
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
          selectedId={shownGaugeId ?? gauges.find((g) => gaugeLink(g, slug)?.isPrimary)?.id ?? ''}
          onSelect={setPickedGaugeId}
        />

        {/* ── Live status ─────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: colors.card }, elevation(2)]}>
          <View style={styles.statusHead}>
            <Otter mood={otterForCondition(shownCode)} size={64} />
            <View style={styles.statusHeadText}>
              <View
                style={[
                  styles.conditionChip,
                  {
                    backgroundColor: conditionBg(shownCode),
                    borderColor: conditionChipBorder(shownCode),
                  },
                ]}
              >
                <Text style={[styles.conditionChipText, { color: conditionInk(shownCode) }]}>
                  {/* The long label is an instruction — "Do Not Float",
                      "Floatable" — and an instruction is a claim about right
                      now. A reading recovered from disk names what was last
                      seen and stops there. */}
                  {band === 'fresh'
                    ? conditionLongLabel(code)
                    : `Last known: ${conditionShortLabel(code)}`}
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

            {/* ── Which way it is going, top right ──────────────────
                It used to ride the "Updated 40 minutes ago · Van Buren" line
                at the FOOT of this card, sharing one 12pt row with a station
                name that had to truncate to make room. Three facts of
                different kinds in one line, and the only forward-looking one
                was last and smallest.

                Up here it sits level with the condition chip, which is what it
                qualifies: the chip says where the river is, this says where it
                is heading. Same pairing the Today rows and the Favorites cards
                already draw, and the foot of the card is left to say plainly
                when the reading was taken and which station took it.

                Still muted ink, never green-for-rising — on a river
                approaching flood "rising fast" is the opposite of good news,
                and the chip beside it already carries the verdict. */}
            {shownTrend ? (
              <TrendPill direction={shownTrend.direction} label={shownTrend.label} />
            ) : null}
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
          {/* LIVE ONLY, on top of primary-only. The percentile is computed
              against TODAY's day-of-year, so a cached "lower than most years
              for late July" read in September is wrong twice over. */}
          {percentileText && !pickedGauge && !cachedReading ? (
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

          {/* Past forty-eight hours the age is not printed at all. "Updated 3
              days ago" invites arithmetic against water that has rained twice
              since; the honest form is to stop claiming an age.

              PROVENANCE ONLY, now that the trend has moved to the head of the
              card. This line answers "how do you know" — when the reading was
              taken and which station took it — and it gets the whole width for
              it, so a station name no longer truncates to make room for a
              direction it has nothing to do with. */}
          {(readingAgeHours != null && band !== 'expired') || shownGaugeName ? (
            <View style={styles.updatedRow}>
              {cachedReading ? (
                <Ionicons name="cloud-offline-outline" size={12} color={colors.textSubtle} />
              ) : null}
              <Text style={[styles.updated, { color: colors.textSubtle }]} numberOfLines={1}>
                {readingAgeHours != null && band !== 'expired'
                  ? `${readingAge(readingAgeHours)}${shownGaugeName ? ` · ${shownGaugeName}` : ''}`
                  : (shownGaugeName ?? '')}
              </Text>
            </View>
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
        {/* Dam operations, directly under the reading they explain. This used
            to be one muted line at the very BOTTOM of the screen, below the
            outfitters — the controlling fact about a regulated river, filed
            under trivia. Renders nothing for a flood-control project with no
            turbines, which is every dam but three. */}
        <TailwaterStatusRow dam={dam} />

        <RiverReaches reaches={reaches} highlightSlug={section} damName={dam?.name ?? null} />

        {/* ── How it got to that number ──────────────────────────
            THIRD, directly under the status card and the reaches — above the
            take and the photos. This order is the redesign's deliberate
            reversal of the one this comment used to defend ("the card says
            what the river IS … and this says how it got there", with the
            chart closing the column): the hydrograph now carries the NWS
            flood stages and the official forecast, which are safety context,
            and safety context reads before interpretation, not after the
            photo gallery.

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
            // Only when the chart is showing the station the condition was
            // computed from: /api/conditions resolves stages for ITS source
            // gauge, and pinning those to a picked sibling would flood-line
            // one station with another's thresholds. A picked gauge simply
            // has none here (MapGauge carries no stages) — same as the gauge
            // screen before /api/gauges/[siteId] is consulted.
            floodStages={
              shownSiteId === condition?.gaugeUsgsId ? condition?.floodStages ?? null : null
            }
            title="Recent history"
          />
        ) : null}

        {/* ── What it means. Under the hydrograph: the card says what the
               river IS, the chart says how it got there and what the NWS
               expects, and this says what to do about it. Hidden entirely when
               the river has no gauge or every upstream source failed — an
               empty interpretation is worse than none. ── */}
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
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <View style={styles.outlookLoading}>
              <ActivityIndicator size="small" color={colors.interactive} />
              <Text style={[styles.outlookLoadingText, { color: colors.textMuted }]}>
                {shownGaugeName ? `Reading ${shownGaugeName}…` : 'Reading the gauge…'}
              </Text>
            </View>
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
            // Unconditional, unlike the one above. Reporting a photo needs
            // nothing but the photo, and a river whose access points failed to
            // load is not a river whose community content stops being
            // reportable — see RiverVisuals' header.
            onReportPhoto={(visual) => {
              setReportedPhoto(visual);
              setFeedbackOpen(true);
            }}
          />
        ) : null}

        {/* ── The bell. ──
            Two states, because a button that reads the same before and after
            you press it cannot tell you whether it worked. The "on" state is
            deliberately quiet — outlined rather than filled — so the screen
            stops selling something the user has already agreed to.

            The one-tap subscription is safety-first and standing rather than
            one-shot. */}
        <Pressable
          onPress={onNotify}
          disabled={gate.busy}
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
          {gate.busy ? (
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
              <AccessRow key={point.id} point={point} riverSlug={slug} />
            ))}
          </CollapsibleSection>
        ) : null}

        {/* ── Campgrounds ──────────────────────────────────────
            THE SAME PLACES AGAIN, ON PURPOSE. Most Ozark campgrounds on these
            rivers are also put-ins — Red Bluff, Hazel Creek, Montauk — so they
            were already in the list above, filed under the question "where do I
            get on the water" and identifiable as somewhere to sleep only by a
            reader who noticed the word Campground in a dot-separated meta line
            four items long. "Where can I camp on this river" is a different
            question asked at a different moment, usually days earlier, and it
            deserves a heading rather than a filter of one.

            So a campground appears TWICE on this screen and that is the design,
            not an oversight. It is one place with two uses, and dropping it from
            Access points to avoid the repeat would hide a put-in from the list
            of put-ins.

            Two sources, like the map's campground layer: access points tagged
            `campground`, and services of type campground on this river — the
            latter had no home on this screen at all, because the Outfitters
            section below deliberately excludes them. A private riverside
            campground that is not a public access was invisible here. */}
        {campgroundPoints.length > 0 || campgroundServices.length > 0 ? (
          <CollapsibleSection
            title="Campgrounds"
            leading={<EddySymbol name="campground" size={18} />}
            summary={campgroundSummary}
          >
            {campgroundPoints.map((point) => (
              // Keyed apart from the identical row in Access points above:
              // React would otherwise see one element moving between two
              // parents rather than two rows, and remount it on every toggle.
              <AccessRow key={`camp-${point.id}`} point={point} riverSlug={slug} />
            ))}
            {campgroundServices.map((service) => (
              <ServiceRow key={service.id} service={service} />
            ))}
          </CollapsibleSection>
        ) : null}

        {/* ── Outfitters ───────────────────────────────────────
            COLLAPSED, because this is not a safety fact and not why anyone
            opened the screen — but present, because "who rents a canoe on this
            river" was a question the app could answer from data it already
            fetched for the map and simply never showed anywhere a person reads
            about a river.

            OUTFITTERS AND SHUTTLES TOGETHER, campgrounds left out — they have
            their own section directly above. A shuttle operator is what most
            people are actually looking for when they look for an outfitter, and
            separating the two would put one name under two headings.

            The membership test is the shared `serviceTiers`, the same rule the
            map's own tier filters on, rather than a list written out again
            here. A second definition of "what counts as an outfitter" is how
            the layer sheet and this section end up disagreeing about a business
            that appears on one and not the other.

            It used to be a list of TYPE STRINGS, and it was wrong in a way
            nothing reported: three of its four members were from the access
            point's vocabulary and matched no directory row, while the campground
            and cabin rows that actually run shuttles were excluded for being
            filed under the wrong noun. The tier asks what a business DOES. */}
        {outfitters.length > 0 ? (
          <CollapsibleSection
            title="Outfitters"
            leading={<EddySymbol name="outfitter" size={18} />}
            summary={`${outfitters.length} nearby`}
          >
            {outfitters.map((service) => (
              <ServiceRow key={service.id} service={service} />
            ))}
          </CollapsibleSection>
        ) : null}

        <SafetyDisclaimer />

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
            Didn&apos;t match the river? Tell Eddy
          </Text>
        </Pressable>
      </ScrollView>

      <PhotoSubmitSheetLazy
        visible={photoOpen}
        onDismiss={() => setPhotoOpen(false)}
        riverId={river.id}
        riverName={river.name}
        accessPoints={accessPoints}
      />

      {/* ── One sheet, two jobs, and a key that keeps them apart ──────
          `defaultType` seeds FeedbackSheet's `type` with useState, so it is read
          once per mount and NOT when the prop changes. Without the key, opening
          the sheet from a photo flag after it had been dismissed as a gauge
          report would show the photo's context under the gauge type — the
          report would file as the wrong class, silently, which is the one
          outcome a reporting mechanism must not have. Changing the key remounts
          it, which is the whole point of a key here rather than an oversight. */}
      <FeedbackSheet
        key={reportedPhoto ? `photo:${reportedPhoto.id}` : 'river'}
        visible={feedbackOpen}
        onDismiss={() => {
          setFeedbackOpen(false);
          setReportedPhoto(null);
        }}
        defaultType={reportedPhoto ? 'objectionable_content' : 'gauge_recalibration'}
        context={
          reportedPhoto
            ? {
                type: 'river',
                id: river.id,
                name: river.name,
                // Enough to FIND and unpublish the photo without a reply. A
                // report a moderator has to answer before they can act on it is
                // a report that misses the day it mattered.
                data: {
                  visualId: reportedPhoto.id,
                  imageUrl: reportedPhoto.imageUrl,
                  accessPointName: reportedPhoto.accessPointName ?? null,
                  description: reportedPhoto.description ?? null,
                },
              }
            : {
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
              }
        }
      />

      {/* Only Eddy's written read opens this now. The bell used to, and does
          not: nothing about being alerted is for sale. */}
      <PaywallSheet
        visible={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        riverName={river.name}
      />

      <AlertSignInSheet
        visible={gate.signInOpen}
        riverName={river.name}
        onSignedIn={() => {
          gate.setSignInOpen(false);
          // Finish what they tapped. The session is live now, so this is the
          // same call that failed a moment ago.
          void subscribe();
        }}
        onDismiss={() => gate.setSignInOpen(false)}
      />

      <PushPrimer
        visible={gate.primerOpen}
        riverName={river.name}
        // Describes what the BELL actually subscribes to, which is `safety` —
        // high and dangerous water, and nothing about the river merely becoming
        // floatable. The sheet used to promise both, from a fixed string
        // written when this tap sent `kind: 'all'`.
        promise={BELL_PROMISE}
        onAllow={async () => {
          gate.setPrimerOpen(false);
          // Spends the one-shot prompt. The outcome needs no handling here:
          // the subscription already exists either way, and someone who
          // declines still sees the change in the Alerts feed.
          await gate.enablePush();
        }}
        onDismiss={() => gate.setPrimerOpen(false)}
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
  // `flex-start` so the trend sits at the TOP right rather than centred against
  // a 64pt otter — level with the condition chip, which is the thing it
  // qualifies.
  statusHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  // Centred within the row it used to define, so the chip and reading keep the
  // vertical position they had beside the otter.
  statusHeadText: { flex: 1, gap: 8, justifyContent: 'center', minHeight: 64 },
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
  updatedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 },
  // marginTop moves to the row so the glyph and the text sit on one baseline.
  // `flex: 1` still lets a long station name take the width — but it is the
  // only thing competing for it now that the trend has moved to the card head.
  updated: { ...t.xs, fontFamily: fonts.body, flex: 1 },
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
  // Only when the deck is above it, so the spinner row keeps its own spacing
  // on the rivers that have no free line to head it with.
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
  // No marginHorizontal. It carried 16 on top of the ScrollView's own 16, so
  // service rows sat inset 32 while every access and hazard row on the screen
  // sat at 16 — one column of cards with a second column half a thumb narrower
  // inside it. The campgrounds section, which draws both kinds of row side by
  // side, is where that finally became impossible to read as deliberate.
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 8,
    padding: 12,
    borderRadius: 13,
  },
  serviceBody: { flex: 1 },
  serviceName: { ...t.sm, fontFamily: fonts.semibold },
  serviceMeta: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  serviceAvailability: { ...t.xs, fontFamily: fonts.semibold, marginTop: 2 },
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
