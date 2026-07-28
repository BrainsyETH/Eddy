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
// driving down something they cannot reverse out of. See driveTarget below.

import { useEffect, useState } from 'react';
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
  AccessPointDetail,
  AccessPointDetailResponse,
  AccessPointGaugeStatus,
  NearbyAccessPoint,
  NearbyService,
} from '@eddy/types';
import { accessTypeLabel } from '@eddy/types';
import { ApiError, fetchAccessPointDetail } from '@/api/client';
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
import { ShareButton } from '@/components/ShareButton';
import { FeedbackSheet } from '@/components/FeedbackSheet';
import {
  driveToUrl,
  installedNavLinks,
  openNavLink,
  type NavLinkSpec,
} from '@/lib/directions';
import {
  agencyLabel,
  isDemandingSurface,
  parkingLabel,
  roadSurfaceLabel,
  stripHtml,
} from '@/lib/accessCopy';

const TREND_ICON = {
  rising: 'arrow-up' as const,
  falling: 'arrow-down' as const,
  steady: 'remove' as const,
};

const SERVICE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  outfitter: 'boat-outline',
  canoe_rental: 'boat-outline',
  shuttle: 'car-outline',
  campground: 'bonfire-outline',
  lodging: 'bed-outline',
};

/**
 * Where to actually drive.
 *
 * `drivingLat/Lng` when the curator recorded one, the access point's own
 * coordinate otherwise. Never a name — "Akers Ferry" is ambiguous to a geocoder
 * and most Ozark access points are not in one at all, which is the rule the
 * whole of directions.ts is built on.
 */
function driveTarget(point: AccessPointDetail) {
  const lat = point.drivingLat ?? point.coordinates.lat;
  const lng = point.drivingLng ?? point.coordinates.lng;
  return { name: point.name, coordinates: { lng, lat } };
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

function GaugeCard({ status, onOpen }: { status: AccessPointGaugeStatus; onOpen: () => void }) {
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
      accessibilityLabel={`${status.gaugeName}, ${status.label}${reading ? `, ${reading}` : ''}`}
    >
      <View style={styles.gaugeCardTop}>
        <Text style={[styles.gaugeName, { color: colors.textMuted }]} numberOfLines={1}>
          {status.gaugeName}
        </Text>
        <View
          style={[
            styles.chip,
            {
              backgroundColor: conditionBg(status.level),
              borderColor: conditionChipBorder(status.level),
            },
          ]}
        >
          <Text style={[styles.chipText, { color: conditionInk(status.level) }]}>
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
      {service.website ? (
        <Pressable
          onPress={() => void Linking.openURL(service.website!)}
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

function NearbyRow({ point, onPress }: { point: NearbyAccessPoint; onPress: () => void }) {
  const { colors, elevation } = useTheme();
  const meta = [
    `${point.distanceMiles.toFixed(1)} mi ${point.direction}`,
    point.estimatedFloatTime,
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

  const [data, setData] = useState<AccessPointDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /**
   * Which offroad map apps this phone actually has.
   *
   * Starts empty and stays empty for most people, which is the correct default:
   * the row is drawn only for what came back, so a phone with none of them
   * never sees it. Probed after the access point loads because the links need
   * its coordinates.
   */
  const [navLinks, setNavLinks] = useState<NavLinkSpec[]>([]);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  useEffect(() => {
    if (!slug || !accessSlug) return;
    const controller = new AbortController();

    void (async () => {
      try {
        const result = await fetchAccessPointDetail(slug, accessSlug, controller.signal);
        if (controller.signal.aborted) return;
        setData(result);
        setError(null);
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.message === 'Request cancelled') return;
        setError(
          err instanceof ApiError && err.status === 404
            ? 'This access point is no longer published.'
            : 'Could not load this access point.',
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [slug, accessSlug]);

  // Deliberately not named `point` — that name belongs to the non-optional
  // narrowing below the early returns, which the whole render leans on.
  const loadedPoint = data?.accessPoint;
  useEffect(() => {
    if (!loadedPoint) return;
    let live = true;
    void installedNavLinks(loadedPoint).then((links) => {
      if (live) setNavLinks(links);
    });
    return () => {
      live = false;
    };
  }, [loadedPoint]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.screen, styles.centre, { backgroundColor: colors.bg }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color={colors.interactive} />
      </SafeAreaView>
    );
  }

  if (error || !data) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.navRow}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </Pressable>
        </View>
        <View style={[styles.centre, styles.emptyBody]}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Access point unavailable</Text>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            {error ?? 'Could not load this access point.'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const point = data.accessPoint;
  const tips = stripHtml(point.localTips);
  const parking = parkingLabel(point.parkingCapacity);
  const hasRoad = point.roadSurface.length > 0 || Boolean(point.roadAccess);
  const hasParking = Boolean(parking) || Boolean(point.parkingInfo);
  const hasFacilities =
    point.amenities.length > 0 || Boolean(point.facilities) || Boolean(point.npsCampground);
  const hasNotes = Boolean(point.description) || Boolean(tips);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.navRow}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <View style={styles.navActions}>
          <Pressable
            onPress={() => router.push(`/river/${point.river.slug}`)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={`Open ${point.river.name}`}
          >
            <Text style={[styles.navRiver, { color: colors.interactive }]} numberOfLines={1}>
              {point.river.name}
            </Text>
          </Pressable>
          {/* point.path is the WEBSITE's state-segmented path, served by the
              API precisely because this screen's route has no state in it and
              could not build one. See src/lib/share.ts.

              Absent when the deploy this build is talking to predates the
              field — a build outlives the deploy it was cut against, and a
              share button is not worth handing someone /undefined. */}
          {point.path ? (
            <ShareButton title={point.name} path={point.path} label={`Share ${point.name}`} />
          ) : null}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* ── What it looks like ──────────────────────────────────
            A horizontal strip rather than one hero: several photos of a put-in
            answer more than one does — the ramp, the parking, the water — and
            coverage is partial enough that a fixed-height hero would be an
            empty grey box on most points. Absent entirely when there are none. */}
        {point.imageUrls.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.gallery}
          >
            {point.imageUrls.map((url) => (
              <Image
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

        {/* ── Quick stats ─────────────────────────────────────────
            The facts that decide whether to drive here, in one row of chips.
            Private and fee are stated positively rather than by omission: "you
            can walk on but it costs" is a different trip from "you cannot". */}
        <View style={styles.stats}>
          {[
            `Mile ${point.riverMile}`,
            ...point.types.map(accessTypeLabel),
            point.isPublic ? 'Public' : 'Private',
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
          <Pressable
            onPress={() => void Linking.openURL(driveToUrl(driveTarget(point)))}
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
          </Pressable>

          {point.officialSiteUrl ? (
            <Pressable
              onPress={() => void Linking.openURL(point.officialSiteUrl!)}
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

        {/* ── The last half mile ──────────────────────────────────
            Apple Maps above will get you to the area. What it will not do is
            draw the unnamed track that the final half mile to an Ozark put-in
            usually is, or route down it. onX and Gaia will, and anyone who owns
            them owns them for this.

            Only what the phone actually has, so this row is absent for most
            people rather than being three buttons that bounce to the App Store.
            See installedNavLinks. */}
        {navLinks.length > 0 ? (
          <View style={styles.navApps}>
            <Text style={[styles.navAppsLabel, { color: colors.textSubtle }]}>Open in</Text>
            <View style={styles.navAppsRow}>
              {navLinks.map((link) => (
                <Pressable
                  key={link.app}
                  onPress={() => void openNavLink(link)}
                  style={({ pressed }) => [
                    styles.navApp,
                    { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${point.name} in ${link.label} ${link.subtitle}`}
                >
                  <Text style={[styles.navAppText, { color: colors.text }]}>{link.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {/* ── The water ──────────────────────────────────────────
            Pre-graded by the server, so this access point and its river cannot
            disagree about the same water. Taps through to the gauge itself. */}
        {data.gaugeStatus ? (
          <Section title="River right now">
            <GaugeCard
              status={data.gaugeStatus}
              onOpen={() =>
                router.push(`/gauge/${encodeURIComponent(data.gaugeStatus!.usgsId)}`)
              }
            />
          </Section>
        ) : null}

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
            {point.amenities.length > 0 ? (
              <View style={styles.chips}>
                {point.amenities.map((amenity) => (
                  <View
                    key={amenity}
                    style={[styles.chipOutline, { borderColor: colors.border, backgroundColor: colors.card }]}
                  >
                    <Text style={[styles.chipOutlineText, { color: colors.textMuted }]}>
                      {amenity}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
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
                      void Linking.openURL(
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

        {data.nearbyAccessPoints.length > 0 ? (
          <Section title="Nearby access">
            {data.nearbyAccessPoints.map((nearby) => (
              <NearbyRow
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
        <Pressable
          onPress={() => setFeedbackOpen(true)}
          style={({ pressed }) => [styles.reportRow, { opacity: pressed ? 0.6 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={`Report a problem with ${point.name}`}
        >
          <Ionicons name="flag-outline" size={13} color={colors.textSubtle} />
          <Text style={[styles.reportText, { color: colors.textSubtle }]}>
            Something here out of date?
          </Text>
        </Pressable>
      </ScrollView>

      <FeedbackSheet
        visible={feedbackOpen}
        onDismiss={() => setFeedbackOpen(false)}
        defaultType="inaccurate_data"
        context={{
          type: 'access_point',
          id: point.id,
          name: `${point.name} (${point.river.name})`,
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centre: { alignItems: 'center', justifyContent: 'center' },
  emptyBody: { flex: 1, paddingHorizontal: 32, gap: 10 },
  emptyTitle: { ...t.xl, fontFamily: fonts.heading, textAlign: 'center' },
  emptyText: { ...t.sm, fontFamily: fonts.body, textAlign: 'center' },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
  },
  // The right-hand end of the nav row, now that share sits beside the river link.
  navActions: { flexDirection: 'row', alignItems: 'center', gap: 14, flexShrink: 1 },
  navRiver: { ...t.sm, fontFamily: fonts.medium, flexShrink: 1 },
  reportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
  },
  reportText: { ...t.xs, fontFamily: fonts.medium },
  body: { paddingBottom: 40 },
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
  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: 16 },
  primaryAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 13,
    borderRadius: 14,
  },
  primaryActionText: { ...t.base, fontFamily: fonts.semibold },
  secondaryAction: {
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionText: { ...t.sm, fontFamily: fonts.medium },
  // Tighter to the actions above than a Section would be: these are the same
  // question as Directions, asked of a different app, not a new topic.
  navApps: { paddingHorizontal: 16, marginTop: 12 },
  navAppsLabel: { ...t.xs, fontFamily: fonts.medium, marginBottom: 6 },
  navAppsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  navApp: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
  },
  navAppText: { ...t.sm, fontFamily: fonts.medium },
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
  gaugeCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gaugeName: { ...t.xs, fontFamily: fonts.body, flex: 1 },
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
  footnote: {
    ...t.xs,
    fontFamily: fonts.body,
    paddingHorizontal: 20,
    marginTop: 26,
    lineHeight: 17,
  },
});
