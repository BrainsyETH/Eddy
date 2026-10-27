import { serviceContactActions } from '@/lib/serviceContactActions';
import { openExternalLink } from '@/lib/openExternalLink';
import { ScenicImage } from '@/components/ScenicImage';
// eddy-ios/app/river/[slug]/access/[accessSlug].tsx
// One access point: whether you can get down there, and what is waiting.
//
// ── The row could not answer the question it raised ────────────────────────
// The river screen listed put-ins as a photo, a name and a river mile, and
// tapping one opened Apple Maps. That is the right answer to "how do I get
// there" and no answer at all to the questions people actually have standing in
// a driveway with a boat on the roof: is the last mile gravel or dirt, is there
// room for a truck and trailer, is there a toilet, who runs a shuttle from
// here, and how far is the next take-out. Every one of those is already in the
// database and was already on the website.
//
// ── What it does with the fields it cannot vouch for ───────────────────────
// Coverage is uneven — this data is hand-curated, and most points carry a few
// of these columns rather than all of them. Every section below is absent when
// it has nothing, never present-and-empty. A screen of "Parking: unknown /
// Facilities: unknown / Road surface: unknown" reads as a broken page; a
// shorter screen reads as a place nobody has written up yet, which is the truth.
//
// ── Directions go to drivingLat/Lng when there is one ──────────────────────
// A gravel bar's coordinate is on the water. The parking area can be a quarter
// mile up a track, and routing a car to the waterline is how people end up
// driving down something they cannot reverse out of. The shared Directions
// chooser preserves this approach.
//
// ── It opens on what the phone already knew ────────────────────────────────
// This screen is reached by tapping a row that was already drawing this place's
// photograph, name and river mile — every one of them out of the on-disk cache
// the launch bundle seeds for all 25 rivers. It nonetheless held a full-screen
// spinner over them until /api/rivers/[slug]/access/[accessSlug] answered,
// which is a blank screen in place of data that had already been rendered once,
// a tap ago.
//
// So the cached point paints first and the request fills in underneath. What
// the seed may NOT carry is anything the cached shape cannot vouch for: the
// road, the parking, the agency and the amenities are absent from
// MapAccessPoint, and drawing their sections empty would state as fact the very
// "unknown" this file's third paragraph refuses to print. Directions is held
// back for a sharper reason — see the seeded body below.

import { NativeHeaderHome } from '@/components/NativeHeaderHome';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type {
  AccessPointGaugeStatus,
  MapAccessPoint,
  NearbyAccessPoint,
  NearbyService,
} from '@eddy/types';
import { accessPointTypes, accessTypeLabel } from '@eddy/types';
import { useAccessPointDetail } from '@/hooks/useAccessPointDetail';
import { usePlaceFavorite } from '@/hooks/usePlaceFavorite';
import { useSavedPlaces } from '@/hooks/useSavedPlaces';
import { savedPlaces } from '@/lib/savedPlacesStore';
import { accessDetailPresentation, retainNewerSavedObservations } from '@/lib/accessDetailPresentation';
import { accessAvailability } from '@/components/map-sheet/availabilitySource';
import { onForeground } from '@/lib/foreground';
import { SavedPlaceSchedule } from '@/components/SavedPlaceSchedule';
import { AmenityChips } from '@/components/map-sheet/sections';
import { placeFromAccess } from '@/lib/savedPlaces';
import type { EstimateStatus } from '@/lib/loadAccessDetail';
import {
  conditionBg,
  conditionChipBorder,
  conditionInk,
  conditionText,
} from '@/theme/conditions';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { formatReading } from '@/lib/readingCopy';
import { EddySymbol, type EddySymbolName } from '@/components/EddySymbol';
import { shareLink } from '@/lib/share';
// Lazy — see the header of PhotoSubmitSheetLazy. Its native expo-image-picker
// import used to run while THIS file loaded, so a stale binary lost the whole
// access-point screen rather than just the photo button.
import { PhotoSubmitSheetLazy } from '@/components/PhotoSubmitSheetLazy';
import { FeedbackSheet } from '@/components/FeedbackSheet';
import { readRiver } from '@/lib/riverCache';
import { useDirectionsMenu } from '@/components/DirectionsMenu';
import {
  agencyLabel,
  isDemandingSurface,
  parkingLabel,
  roadSurfaceLabel,
  stripHtml,
} from '@/lib/accessCopy';
import { CampgroundAvailability } from '@/components/map-sheet/CampgroundAvailability';
import { TREND_ICON } from '@/components/TrendPill';

const SERVICE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  outfitter: 'boat-outline',
  canoe_rental: 'boat-outline',
  shuttle: 'car-outline',
  campground: 'bonfire-outline',
  lodging: 'bed-outline',
};

/**
 * The place, drawn from what the phone already had.
 *
 * Serves two states that are the same page: the request is still in flight, and
 * the request failed with a cached point in hand. Both used to be a screen with
 * nothing on it — the first a spinner, the second "Access point unavailable" —
 * over a photograph, a name and a river mile that were on the disk and had been
 * on the previous screen a tap earlier.
 *
 * ── What is deliberately NOT offered here ─────────────────────────────────
 *
 * Directions. A cached MapAccessPoint has no `drivingLat/Lng`, so a button here
 * would route to the point's own coordinate — for a gravel bar, the waterline.
 * The curated driving coordinate prevents that mistake. Offering Directions
 * half a second sooner is not worth sending somebody down a track they cannot
 * reverse out of. It appears with the coordinate that makes it correct.
 *
 * Also absent: the fee chip and the managing agency, which the cached shape
 * does not carry. Absent reads as "not recorded", which is what this screen
 * does with every field it cannot vouch for — so the seed is honest rather than
 * merely shorter.
 *
 * View on map IS offered: it needs an id and a river slug, both of which the
 * seed has, and it cannot send a car anywhere.
 */
function SeededAccessPoint({
  point,
  riverName,
  riverSlug,
  /** Null while the request is still running; the reason once it has failed. */
  failure,
}: {
  point: MapAccessPoint;
  riverName: string | null;
  riverSlug: string;
  failure: string | null;
}) {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['left', 'right']}>
      <Stack.Screen options={{ title: point.name }} />
      <NativeHeaderHome />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.body}>
        {point.imageUrls && point.imageUrls.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.gallery}
          >
            {point.imageUrls.map((url) => (
              <ScenicImage
                key={url}
                source={{ uri: url }}
                style={[styles.galleryImage, { backgroundColor: colors.cardRaised }]}
                // Required by RN's a11y lint: a photograph must not be
                // colour-inverted by Smart Invert, unlike UI chrome.
                accessibilityIgnoresInvertColors
              />
            ))}
          </ScrollView>
        ) : null}

        <Text style={[styles.name, { color: colors.text }]}>{point.name}</Text>
        {riverName ? <AccessRiverLink name={riverName} slug={riverSlug} /> : null}

        <View style={styles.stats}>
          {[
            `Mile ${point.riverMile}`,
            ...accessPointTypes(point).map(accessTypeLabel),
            point.isPublic ? 'Public' : 'Private',
          ]
            .filter(Boolean)
            .map((label) => (
              <View key={label} style={[styles.stat, { backgroundColor: colors.cardRaised }]}>
                <Text style={[styles.statText, { color: colors.textMuted }]}>{label}</Text>
              </View>
            ))}
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={() =>
              // navigate, not push — see the loaded screen's copy of this
              // control for why the Map tab must not be minted twice.
              router.navigate({
                pathname: '/',
                params: { focusAccess: point.id, focusRiver: riverSlug },
              })
            }
            style={({ pressed }) => [
              styles.secondaryAction,
              { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Show ${point.name} on the map`}
          >
            <Ionicons name="map-outline" size={15} color={colors.text} />
            <Text style={[styles.secondaryActionText, { color: colors.text }]}>View on map</Text>
          </Pressable>
        </View>

        <View style={styles.seedPending}>
          {failure ? (
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>{failure}</Text>
          ) : (
            <ActivityIndicator color={colors.interactive} />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * A titled block that renders nothing at all when it has nothing to say.
 *
 * `symbol` is optional and only the three sections the website also marks carry
 * one — road, parking, facilities. Giving every heading a sticker would turn a
 * scannable column of text into a column of noise, and it would spend the marks'
 * only job: they exist so the eye can find "is there a toilet" without reading.
 */
function Section({
  title,
  symbol,
  children,
}: {
  title: string;
  symbol?: EddySymbolName;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        {symbol ? <EddySymbol name={symbol} size={20} /> : null}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function GaugeCard({ status, age, onOpen }: { status: AccessPointGaugeStatus; age: string; onOpen: () => void }) {
  const { colors, elevation, isDark } = useTheme();
  const reading =
    status.cfs != null
      ? formatReading(status.cfs, 'cfs')
      : status.heightFt != null
        ? formatReading(status.heightFt, 'ft')
        : null;

  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => [
        styles.gaugeCard,
        { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
        elevation(1),
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${status.gaugeName}, ${status.label}${reading ? `, ${reading}` : ''}, ${age}`}
    >
      <View style={styles.gaugeCardTop}>
        <Text style={[styles.gaugeName, { color: colors.textMuted }]}>
          {status.gaugeName} · {age}
        </Text>
        <View
          style={[
            styles.chip,
            {
              backgroundColor: conditionBg(status.level, isDark),
              borderColor: conditionChipBorder(status.level, isDark),
            },
          ]}
        >
          <Text style={[styles.chipText, { color: conditionInk(status.level, isDark) }]}>
            {status.label}
          </Text>
        </View>
      </View>
      <View style={styles.gaugeCardBottom}>
        <Text
          style={[
            styles.gaugeReading,
            { color: reading ? conditionText(status.level, isDark) : colors.textSubtle },
          ]}
        >
          {reading ?? 'No reading'}
        </Text>
        {/* Muted ink, never green-for-rising: on a river approaching flood,
            "rising" is the opposite of good news. The chip carries the verdict. */}
        {status.trend ? (
          <Ionicons name={TREND_ICON[status.trend]} size={13} color={colors.textMuted} />
        ) : null}
        <View style={styles.gaugeSpacer} />
        <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
      </View>
    </Pressable>
  );
}

function ServiceRow({ service }: { service: NearbyService }) {
  const { colors, elevation } = useTheme();
  const website = serviceContactActions({ website: service.website }).find(action => action.label === 'Website')?.url;
  const meta = [service.distance, service.notes].filter(Boolean).join(' · ');

  return (
    <View style={[styles.serviceRow, { backgroundColor: colors.card }, elevation(1)]}>
      <Ionicons
        name={SERVICE_ICON[service.type] ?? 'business-outline'}
        size={18}
        color={colors.interactive}
      />
      <View style={styles.serviceBody}>
        <Text style={[styles.serviceName, { color: colors.text }]} numberOfLines={1}>
          {service.name}
        </Text>
        {meta ? (
          <Text style={[styles.serviceMeta, { color: colors.textMuted }]} numberOfLines={2}>
            {meta}
          </Text>
        ) : null}
      </View>
      {/* Only what exists. A dialer button on a service with no number is a
          control that fails when pressed, which is worse than one absent. */}
      {service.phone ? (
        <Pressable
          onPress={() => void Linking.openURL(`tel:${service.phone!.replace(/[^\d+]/g, '')}`)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Call ${service.name}`}
        >
          <Ionicons name="call-outline" size={19} color={colors.interactive} />
        </Pressable>
      ) : null}
      {website ? (
        <Pressable
          onPress={() => void openExternalLink(website)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Open ${service.name} website`}
        >
          <Ionicons name="open-outline" size={19} color={colors.interactive} />
        </Pressable>
      ) : null}
    </View>
  );
}

function NearbyRow({ point, onPress, estimatesStatus }: { point: NearbyAccessPoint; onPress: () => void; estimatesStatus: EstimateStatus }) {
  const { colors, elevation } = useTheme();
  const meta = [
    `${point.distanceMiles.toFixed(1)} mi ${point.direction}`,
    point.estimatedFloatTime ?? (point.isFloatEndpoint !== false && estimatesStatus === 'loading' ? 'Calculating…' : point.isFloatEndpoint !== false && estimatesStatus === 'failed' ? 'Estimate unavailable' : null),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.nearbyRow,
        { backgroundColor: colors.card, opacity: pressed ? 0.6 : 1 },
        elevation(1),
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${point.name}, ${meta}`}
    >
      <Ionicons
        name={point.direction === 'upstream' ? 'arrow-up-outline' : 'arrow-down-outline'}
        size={17}
        color={colors.interactive}
      />
      <View style={styles.nearbyBody}>
        <Text style={[styles.nearbyName, { color: colors.text }]} numberOfLines={1}>
          {point.name}
        </Text>
        <Text style={[styles.nearbyMeta, { color: colors.textMuted }]} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
    </Pressable>
  );
}

export default function AccessPointDetailScreen() {
  const { slug, accessSlug } = useLocalSearchParams<{ slug: string; accessSlug: string }>();
  const router = useRouter();
  const { colors, elevation } = useTheme();
  const { showDirections, directionsMenu } = useDirectionsMenu();

  const detailRoute = slug && accessSlug ? `/river/${slug}/access/${accessSlug}` : null;
  const { places, owner, ready } = useSavedPlaces();
  const saved = places.find(place => place.detailRoute === detailRoute);
  const [now, setNow] = useState(Date.now);
  const [revision, setRevision] = useState(0);
  const lastAttempt = useRef(now);
  const { detail: data, status, estimatesStatus, error } = useAccessPointDetail(detailRoute, revision);
  const presentation = accessDetailPresentation(data, saved, now);
  const loading = status === 'loading';
  const favorite = usePlaceFavorite(data ? placeFromAccess(data, new Date(now).toISOString()) : saved ?? null);

  // Opening uses the normal detail loader. Refresh a long-lived screen on
  // return, while the minute timer only ages readings and never polls.
  useFocusEffect(useCallback(() => {
    const resume = () => {
      const at = Date.now();
      setNow(at);
      if (at - lastAttempt.current >= 15 * 60_000) {
        lastAttempt.current = at;
        setRevision(value => value + 1);
      }
    };
    resume();
    const off = onForeground(resume);
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => { off(); clearInterval(timer); };
  }, []));

  // Update only an existing save; store.replace guards account switches and
  // removal during a request. Route-estimate enrichment does not rewrite it.
  const livePoint = data?.accessPoint;
  const liveGauge = data?.gaugeStatus;
  useEffect(() => {
    if (!ready || !livePoint) return;
    const previous = savedPlaces.snapshot().places.find(place => place.detailRoute === detailRoute);
    if (!previous) return;
    const at = Date.now();
    const next = retainNewerSavedObservations(
      placeFromAccess({ accessPoint: livePoint, gaugeStatus: liveGauge ?? null, nearbyAccessPoints: [] }, new Date(at).toISOString(), previous),
      previous, at, accessAvailability(livePoint),
    );
    void savedPlaces.replace(previous, next, owner).catch(() => {});
  }, [ready, owner, detailRoute, livePoint, liveGauge]);

  /**
   * The point as the tapped row already knew it, off the disk cache.
   *
   * Held with the route it answers, for the reason useAccessPointDetail states
   * about its own payload: an AsyncStorage read for the put-in somebody just
   * dismissed must not land under the one they tapped next.
   *
   * Never merged into `data`. A MapAccessPoint is a structural SUBSET of an
   * AccessPointDetail, and the fields it lacks — the road, the parking, the
   * agency, the driving coordinate — are exactly the ones this screen refuses
   * to render as blanks. Kept apart, the seed can only ever say things it
   * actually knows.
   */
  const [seedFor, setSeedFor] = useState<{
    route: string;
    point: MapAccessPoint;
    /** The river's name for the nav row, when the same entry happens to hold it. */
    riverName: string | null;
  } | null>(null);
  const route = `${slug}/${accessSlug}`;
  const seed = seedFor?.route === route ? seedFor : null;

  useEffect(() => {
    if (!slug || !accessSlug) return;
    let live = true;
    // ONE read for both the point and the river's name: they are two fields of
    // the same stored entry, and two readRiver calls would be two AsyncStorage
    // round trips on the path whose whole purpose is not to wait.
    void readRiver(slug).then((stored) => {
      if (!live) return;
      const point = stored?.payload?.accessPoints?.find((entry) => entry.slug === accessSlug);
      if (!point) return;
      setSeedFor({
        route: `${slug}/${accessSlug}`,
        point,
        riverName: stored?.payload?.river?.name ?? null,
      });
    });
    return () => {
      live = false;
    };
  }, [slug, accessSlug]);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);

  if (!presentation && seed && (loading || error || !data)) {
    return (
      <SeededAccessPoint
        point={seed.point}
        riverName={seed.riverName}
        riverSlug={slug}
        // Waiting and having failed are told apart here as they are in
        // useAccessPointDetail's DetailStatus, and for the same reason: both
        // render the same page, and a reader with no way to tell which cannot
        // know whether to wait or to stop waiting.
        failure={loading ? null : (error ?? 'Could not load the rest of this access point.')}
      />
    );
  }

  if (!presentation && loading) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['left', 'right']}>
        <NativeHeaderHome />
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.centre, styles.emptyBody]}>
          <ActivityIndicator size="large" color={colors.interactive} accessibilityLabel="Loading access point" />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!presentation) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['left', 'right']}>
        <NativeHeaderHome />
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.centre, styles.emptyBody]}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Access point unavailable</Text>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            {error ?? 'Could not load this access point.'}
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const { point, camping, gauge, gaugeAge } = presentation;
  const sharePath = point.path;
  const tips = stripHtml(point.localTips);
  const parking = parkingLabel(point.parkingCapacity);
  const hasRoad = point.roadSurface.length > 0 || Boolean(point.roadAccess);
  const hasParking = Boolean(parking) || Boolean(point.parkingInfo);
  const hasFacilities =
    point.amenities.length > 0 || Boolean(point.facilities) || Boolean(point.feeNotes) || Boolean(point.npsCampground);
  const hasNotes = Boolean(point.description) || Boolean(tips);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['left', 'right']}>
      <Stack.Screen options={{ title: point.name }} />
      <NativeHeaderHome />

      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon={favorite.starred ? 'star.fill' : 'star'} accessibilityLabel={favorite.starred ? `Remove ${point.name} from Favorites` : `Save ${point.name}`}
          onPress={() => void favorite.toggle()}>{favorite.starred ? 'Saved' : 'Save'}</Stack.Toolbar.Button>
        {sharePath ? (
          <Stack.Toolbar.Button
            icon="square.and.arrow.up"
            accessibilityLabel={`Share ${point.name}`}
            onPress={() => void shareLink(point.name, sharePath)}
          >
            Share
          </Stack.Toolbar.Button>
        ) : null}
      </Stack.Toolbar>

      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.body}>
        {/* ── What it looks like ──────────────────────────────────
            A horizontal strip rather than one hero: several photos of a put-in
            answer more than one does — the ramp, the parking, the water — and
            coverage is partial enough that a fixed-height hero would be an
            empty grey box on most points. Absent entirely when there are none.

            These are CURATED images of the place, not community river photos —
            a different set from the ones the Add a photo button below feeds,
            which are banded by water level and live on the river screen. */}
        {point.imageUrls.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.gallery}
          >
            {point.imageUrls.map((url) => (
              <ScenicImage
                key={url}
                source={{ uri: url }}
                style={[styles.galleryImage, { backgroundColor: colors.cardRaised }]}
                // Required by RN's a11y lint: a photograph must not be
                // colour-inverted by Smart Invert, unlike UI chrome.
                accessibilityIgnoresInvertColors
              />
            ))}
          </ScrollView>
        ) : null}

        <Text style={[styles.name, { color: colors.text }]}>{point.name}</Text>
        {point.river.name ? <AccessRiverLink name={point.river.name} slug={point.river.slug} /> : null}

        {/* ── Quick stats ─────────────────────────────────────────
            The facts that decide whether to drive here, in one row of chips.
            Private and fee are stated positively rather than by omission: "you
            can walk on but it costs" is a different trip from "you cannot". */}
        <View style={styles.stats}>
          {[
            point.riverMile != null ? `Mile ${point.riverMile}` : null,
            ...point.types.map(accessTypeLabel),
            point.isPublic === undefined ? null : point.isPublic ? 'Public' : 'Private',
            point.feeRequired ? 'Fee required' : null,
            point.managingAgency ? agencyLabel(point.managingAgency) : null,
          ]
            .filter(Boolean)
            .map((label) => (
              <View key={label} style={[styles.stat, { backgroundColor: colors.cardRaised }]}>
                <Text style={[styles.statText, { color: colors.textMuted }]}>{label}</Text>
              </View>
            ))}
        </View>

        {/* ── Get there ──────────────────────────────────────────
            The primary action, above everything descriptive: someone who opened
            this screen from a list already decided they are interested. */}
        <View style={styles.actions}>
          {presentation.canDrive ? <Pressable
            onPress={() => showDirections(point)}
            style={({ pressed }) => [
              styles.primaryAction,
              {
                backgroundColor: pressed ? colors.accentFillPressed : colors.accentFill,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Directions to ${point.name}`}
          >
            <Ionicons name="navigate" size={17} color={colors.onAccent} />
            <Text style={[styles.primaryActionText, { color: colors.onAccent }]}>Directions</Text>
          </Pressable> : null}

          {/* ── BACK TO THE MAP, WITH THIS PLACE SELECTED ────────────
              The sheet has always been able to reach this screen and this
              screen could not get back: the only route to the map was the tab
              bar, which lands wherever the map was left — possibly a different
              river, at whatever zoom. So "where is this actually, and what is
              around it" was a question the product could ask and not answer.

              It carries the point's identity as params rather than merely
              switching tabs, and the map re-selects it — see the Map screen's
              `focus` handling. Beside Directions: that chooser leaves the app,
              this stays in it.

              Saved-only snapshots do not retain the database id needed to
              select the map pin. Offer this once the live response supplies it. */}
          {point.id ? <Pressable
            onPress={() =>
              // navigate, not push: the Map tab already exists — returning to
              // it is the intent, and push minted a fresh copy of the tab on
              // the stack instead.
              router.navigate({
                pathname: '/',
                params: { focusAccess: point.id, focusRiver: point.river.slug },
              })
            }
            style={({ pressed }) => [
              styles.secondaryAction,
              { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Show ${point.name} on the map`}
          >
            <Ionicons name="map-outline" size={15} color={colors.text} />
            <Text style={[styles.secondaryActionText, { color: colors.text }]}>View on map</Text>
          </Pressable> : null}

          {point.officialSiteUrl ? (
            <Pressable
              onPress={() => void openExternalLink(point.officialSiteUrl!)}
              style={({ pressed }) => [
                styles.secondaryAction,
                { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
              ]}
              accessibilityRole="button"
            >
              <Text style={[styles.secondaryActionText, { color: colors.text }]}>Official site</Text>
            </Pressable>
          ) : null}
        </View>

        {camping ? <Section title="Campsites">
          <CampgroundAvailability
            wrapText style={styles.availabilityInset}
            availability={camping.availability} name={camping.name} today={camping.today}
            pending={!camping.availability} pendingLabel="Availability out of date"
          />
          {camping.age !== 'Time unknown' ? <Text style={[styles.prose, { color: colors.textMuted }]}>Checked {camping.age}</Text> : null}
        </Section> : null}

        {gauge ? <Section title="River conditions">
          <GaugeCard status={gauge} age={gaugeAge}
            onOpen={() => router.push(`/gauge/${encodeURIComponent(gauge.usgsId)}`)} />
        </Section> : null}
        {saved ? <View style={{ paddingHorizontal: 20 }}><SavedPlaceSchedule place={saved} now={now} /></View> : null}

        {hasRoad ? (
          <Section title="Getting in" symbol="road">
            <View style={styles.chips}>
              {point.roadSurface.map((surface) => {
                // The demanding surfaces wear the warm accent rather than the
                // neutral chip. "Unmaintained gravel" is the fact that decides
                // whether a trailer comes, and six identical grey chips state
                // it without communicating it.
                const demanding = isDemandingSurface(surface);
                return (
                  <View
                    key={surface}
                    style={[
                      styles.chipOutline,
                      {
                        borderColor: demanding ? colors.warm : colors.border,
                        backgroundColor: colors.card,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipOutlineText,
                        { color: demanding ? colors.warm : colors.textMuted },
                      ]}
                    >
                      {roadSurfaceLabel(surface)}
                    </Text>
                  </View>
                );
              })}
            </View>
            {point.roadAccess ? (
              <Text style={[styles.prose, { color: colors.textMuted }]}>{point.roadAccess}</Text>
            ) : null}
          </Section>
        ) : null}

        {hasParking ? (
          <Section title="Parking" symbol="parking">
            {parking ? (
              <Text style={[styles.prose, { color: colors.text }]}>{parking}</Text>
            ) : null}
            {point.parkingInfo ? (
              <Text style={[styles.prose, { color: colors.textMuted }]}>{point.parkingInfo}</Text>
            ) : null}
          </Section>
        ) : null}

        {hasFacilities ? (
          <Section title="Facilities" symbol="facilities">
            <View style={{ paddingHorizontal: 20 }}><AmenityChips amenities={point.amenities} /></View>
            {point.facilities ? (
              <Text style={[styles.prose, { color: colors.textMuted }]}>{point.facilities}</Text>
            ) : null}
            {point.feeNotes ? (
              <Text style={[styles.prose, { color: colors.textMuted }]}>{point.feeNotes}</Text>
            ) : null}

            {/* NPS campgrounds carry booking information nothing else here does,
                and "can I reserve this or is it first-come" is the whole
                question for a campground with a boat ramp. */}
            {point.npsCampground ? (
              <View style={[styles.npsCard, { backgroundColor: colors.card }, elevation(1)]}>
                <Text style={[styles.npsName, { color: colors.text }]}>
                  {point.npsCampground.name}
                </Text>
                <Text style={[styles.npsMeta, { color: colors.textMuted }]}>
                  {[
                    point.npsCampground.totalSites > 0
                      ? `${point.npsCampground.totalSites} sites`
                      : null,
                    point.npsCampground.sitesReservable > 0
                      ? `${point.npsCampground.sitesReservable} reservable`
                      : null,
                    point.npsCampground.sitesFirstCome > 0
                      ? `${point.npsCampground.sitesFirstCome} first-come`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                {point.npsCampground.reservationInfo ? (
                  <Text style={[styles.prose, { color: colors.textMuted }]}>
                    {point.npsCampground.reservationInfo}
                  </Text>
                ) : null}
                {point.npsCampground.reservationUrl ?? point.npsCampground.npsUrl ? (
                  <Pressable
                    onPress={() =>
                      void openExternalLink(
                        (point.npsCampground!.reservationUrl ?? point.npsCampground!.npsUrl)!,
                      )
                    }
                    style={({ pressed }) => [
                      styles.secondaryAction,
                      { borderColor: colors.border, opacity: pressed ? 0.6 : 1, marginTop: 10 },
                    ]}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.secondaryActionText, { color: colors.text }]}>
                      {point.npsCampground.reservationUrl ? 'Reserve a site' : 'Open on nps.gov'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </Section>
        ) : null}

        {point.nearbyServices.length > 0 ? (
          <Section title="Outfitters and shuttles">
            {point.nearbyServices.map((service, i) => (
              <ServiceRow key={`${service.name}-${i}`} service={service} />
            ))}
          </Section>
        ) : null}

        {hasNotes ? (
          <Section title="River notes">
            {point.description ? (
              <Text style={[styles.prose, { color: colors.textMuted }]}>{point.description}</Text>
            ) : null}
            {/* Flattened from the admin's rich text — see stripHtml for why the
                app does not carry an HTML renderer for one field. */}
            {tips ? (
              <Text style={[styles.prose, { color: colors.textMuted }]}>{tips}</Text>
            ) : null}
          </Section>
        ) : null}

        {presentation.nearbyAccessPoints.length > 0 ? (
          <Section title="Nearby access">
            {presentation.nearbyAccessPoints.map((nearby) => (
              <NearbyRow
                estimatesStatus={estimatesStatus}
                key={nearby.id}
                point={nearby}
                onPress={() =>
                  // replace, not push: hopping put-in to put-in down a river is
                  // browsing, and pushing each one builds a back stack whose
                  // every entry is the same screen.
                  router.replace(
                    `/river/${point.river.slug}/access/${encodeURIComponent(nearby.slug)}`,
                  )
                }
              />
            ))}
          </Section>
        ) : null}

        {presentation.extraFacts.map(fact => <Section key={fact.label} title={fact.label}>
          <Text style={[styles.prose, { color: colors.textMuted }]}>{fact.value}</Text>
        </Section>)}
        {point.booking && !point.npsCampground?.reservationUrl ? <Pressable
          accessibilityRole="button" onPress={() => void openExternalLink(point.booking!.url)}
          style={({ pressed }) => [styles.secondaryAction, styles.photoCta, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}>
          <Text style={[styles.secondaryActionText, { color: colors.interactive }]}>Book campsite</Text>
        </Pressable> : null}
        {presentation.extraLinks.map(link => <Pressable key={link.url}
          accessibilityRole="button" onPress={() => void openExternalLink(link.url)}
          style={({ pressed }) => [styles.secondaryAction, styles.photoCta, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}>
          <Text style={[styles.secondaryActionText, { color: colors.interactive }]}>{link.label}</Text>
        </Pressable>)}

        <Text style={[styles.footnote, { color: colors.textSubtle }]}>
          Access details are community-maintained and can change with the season. Conditions on the
          ground win.
        </Text>

        {/* "Community-maintained" is a claim the line above makes and, until
            now, nothing on this screen made good on. A gate that is locked, a
            road that washed out, parking that is gone — those change between
            seasons and the only person who knows is the one who just drove
            there. Defaults to inaccurate_data rather than recalibration: what
            is wrong on this screen is a FACT ABOUT A PLACE, not a threshold. */}
        {/* ── The photo, asked for where the photographer is standing ──
            The river screen's gallery is the other end of this: it shows what
            the water looks like at a level, and it is fed from here. Someone
            reading an access-point screen is either at the put-in or about to
            be, which is the only moment the photo can actually be taken. */}
        {data ? <Pressable
          onPress={() => setPhotoOpen(true)}
          style={({ pressed }) => [
            styles.secondaryAction,
            styles.photoCta,
            { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Add a photo of ${point.name}`}
        >
          <Ionicons name="camera-outline" size={16} color={colors.interactive} />
          <Text style={[styles.secondaryActionText, { color: colors.interactive }]}>
            Add a photo of the river here
          </Text>
        </Pressable> : null}

        {data ? <Pressable
          onPress={() => setFeedbackOpen(true)}
          style={({ pressed }) => [styles.reportRow, { opacity: pressed ? 0.6 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={`Report a problem with ${point.name}`}
        >
          <Ionicons name="flag-outline" size={13} color={colors.textSubtle} />
          <Text style={[styles.reportText, { color: colors.textSubtle }]}>
            Something here out of date?
          </Text>
        </Pressable> : null}
      </ScrollView>

      {/* One access point, already chosen — the sheet's picker collapses to a
          single selected chip rather than asking a question this screen has
          already answered. */}
      {data ? <PhotoSubmitSheetLazy
        visible={photoOpen}
        onDismiss={() => setPhotoOpen(false)}
        riverId={data.accessPoint.riverId}
        riverName={data.accessPoint.river.name}
        accessPoints={[data.accessPoint]}
        initialAccessPointId={data.accessPoint.id}
      /> : null}

      {data ? <FeedbackSheet
        visible={feedbackOpen}
        onDismiss={() => setFeedbackOpen(false)}
        defaultType="inaccurate_data"
        context={{
          type: 'access_point',
          id: data.accessPoint.id,
          name: `${point.name} (${point.river.name})`,
        }}
      /> : null}
      {directionsMenu}
    </SafeAreaView>
  );
}

/** Keep long river names readable without crowding the native Share control. */
function AccessRiverLink({ name, slug }: { name: string; slug: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => router.push(`/river/${slug}`)}
      accessibilityRole="button"
      accessibilityLabel={`Open ${name}`}
      style={({ pressed }) => [styles.riverLink, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Text style={[styles.riverLinkText, { color: colors.interactive }]}>{name}</Text>
      <Ionicons name="chevron-forward" size={14} color={colors.interactive} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  availabilityInset: { marginHorizontal: 16, marginTop: 16, marginBottom: 12 },
  screen: { flex: 1 },
  centre: { alignItems: 'center', justifyContent: 'center' },
  emptyBody: { flexGrow: 1, padding: 32, gap: 10 },
  emptyTitle: { ...t.xl, fontFamily: fonts.heading, textAlign: 'center' },
  emptyText: { ...t.sm, fontFamily: fonts.body, textAlign: 'center' },
  riverLink: { minHeight: 44, paddingHorizontal: 20, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  riverLinkText: { ...t.sm, fontFamily: fonts.medium, flexShrink: 1 },
  // Centred and full-width under the content, above the quieter report link.
  photoCta: {
    flexDirection: 'row',
    gap: 7,
    marginHorizontal: 16,
    marginTop: 22,
  },
  reportRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
  },
  reportText: { ...t.xs, fontFamily: fonts.medium },
  body: { paddingTop: 12, paddingBottom: 40 },
  gallery: { paddingHorizontal: 16, gap: 8, paddingBottom: 4 },
  galleryImage: { width: 240, height: 150, borderRadius: 14 },
  name: { ...t['2xl'], fontFamily: fonts.heading, paddingHorizontal: 20, marginTop: 12 },
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 20,
    marginTop: 8,
  },
  stat: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  statText: { ...t.xs, fontFamily: fonts.medium },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16, marginTop: 16 },
  /** Under the seeded body, where the sections the request is still fetching go. */
  seedPending: { alignItems: 'center', marginTop: 28 },
  primaryAction: {
    flex: 1,
    minWidth: 150,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 13,
    borderRadius: 14,
  },
  primaryActionText: { ...t.base, fontFamily: fonts.semibold },
  // A ROW, because one of these carries a mark. "Official site" has no icon and
  // the gap collapses to nothing on it, so both keep the same pill — the same
  // arrangement the sheet's chips use for the same reason.
  secondaryAction: {
    minHeight: 44,
    maxWidth: '100%',
    flexShrink: 1,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionText: { ...t.sm, fontFamily: fonts.medium, flexShrink: 1 },
  section: { marginTop: 22 },
  // The padding that used to sit on sectionTitle lives here now, so a mark and
  // its heading share one baseline and one left edge with the prose below.
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  sectionTitle: { ...t.lg, fontFamily: fonts.heading },
  prose: { ...t.sm, fontFamily: fonts.body, paddingHorizontal: 20, marginTop: 8, lineHeight: 21 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 20 },
  chipOutline: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 9, borderWidth: 1 },
  chipOutlineText: { ...t.xs, fontFamily: fonts.medium },
  chip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  chipText: { ...t.xs, fontFamily: fonts.semibold },
  gaugeCard: { marginHorizontal: 16, borderRadius: 14, padding: 13 },
  gaugeCardTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  gaugeName: { ...t.xs, fontFamily: fonts.body, flexGrow: 1, flexShrink: 1, flexBasis: 200 },
  gaugeCardBottom: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  gaugeReading: { ...t.xl, fontFamily: fonts.mono },
  gaugeSpacer: { flex: 1 },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 13,
  },
  serviceBody: { flex: 1 },
  serviceName: { ...t.sm, fontFamily: fonts.semibold },
  serviceMeta: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  nearbyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 13,
  },
  nearbyBody: { flex: 1 },
  nearbyName: { ...t.sm, fontFamily: fonts.semibold },
  nearbyMeta: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  npsCard: { marginHorizontal: 16, marginTop: 12, padding: 14, borderRadius: 14 },
  npsName: { ...t.base, fontFamily: fonts.semibold },
  npsMeta: { ...t.xs, fontFamily: fonts.body, marginTop: 3 },
  // Full-strength ink rather than the muted meta above it: this is the line
  // that decides whether the Reserve button is worth pressing.
  footnote: {
    ...t.xs,
    fontFamily: fonts.body,
    paddingHorizontal: 20,
    marginTop: 26,
    lineHeight: 17,
  },
});
