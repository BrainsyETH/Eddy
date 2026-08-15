// eddy-ios/src/components/map-sheet/AccessTabs.tsx
// What an access point says, split four ways.
//
// ── One request feeds all of them ─────────────────────────────────────────
// Overview, Conditions, Float trips and Details are every one of them read out
// of a single AccessPointDetailResponse. That is not a coincidence to rely on
// loosely — it is why the tab split costs nothing at the network, and why a tab
// can be added here without anybody having to think about a waterfall.
//
// What is NOT here, deliberately: the threshold band scale on Conditions and
// the hazards on this reach. Both want a second request (or state the map
// screen holds), both are enhancements to a tab that already answers its
// question, and neither should hold up the tabs themselves.
import { useMemo, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EddySymbol } from '@/components/EddySymbol';
import type { PlaceSymbolName } from './placeSymbol';
import type {
  AccessPointDetailResponse,
  MapAccessPoint,
  NearbyAccessPoint,
  NearbyService,
  NpsCampgroundSummary,
  ServiceTier,
} from '@eddy/types';
import { serviceTiers } from '@eddy/types';
import {
  defaultNight,
  localToday,
  nightChoices,
  nightPhrase,
  type NightChoice,
} from './availability';
import { accessAvailability, accessAvailabilityName } from './availabilitySource';
import { bookingAction, bookingLine, siteMixLine, type BookingAction } from './campgroundFacts';
import { CampgroundAvailability } from './CampgroundAvailability';
import { CampsiteList } from './CampsiteList';
import type { DecisionSlot } from './peekSlot';
import {
  AIRBNB_LINK_COLOR,
  airbnbSearchUrl,
  STAY_SEARCH_LABEL,
  staySearchAreaLabel,
} from '@/lib/stays';
import { FilterChips } from '@/components/FilterChips';
import { useCampsiteSites } from '@/hooks/useCampsiteSites';
import {
  filterCounts,
  listsRows,
  SITE_FILTERS,
  sitesOnNight,
  type SiteFilter,
} from './siteList';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import {
  agencyLabel,
  overviewLead,
  parkingLabel,
  roadSurfaceLabel,
  stripHtml,
  waitingCopy,
} from '@/lib/accessCopy';
import {
  Absent,
  AmenityChips,
  Chips,
  Fact,
  FoldedProse,
  LinkRow,
  Prose,
  Section,
} from './sections';
import type { DetailStatus } from '@/hooks/useAccessPointDetail';

interface TabProps {
  accessPoint: MapAccessPoint;
  /**
   * Whether this tab is the one being looked at.
   *
   * Only Camping reads it, and only to gate a request: SheetPager mounts the
   * active page and both neighbours, so "mounted" is not "being read".
   */
  active?: boolean;
  detail: AccessPointDetailResponse | null;
  onOpenGauge: (siteId: string) => void;
  /**
   * The access point's own screen, or NULL when the map could not build a route
   * to one — a put-in with no slug, which the detail route is composed from.
   *
   * Nullable rather than a no-op closure so a tab can leave the row out
   * entirely. A row that does nothing when tapped is the "present and empty"
   * this sheet is built to avoid, and it only became reachable once access
   * points started rendering these tabs before their detail request lands.
   */
  onOpenDetail: (() => void) | null;
  onOpenRiver: (slug: string) => void;
  /**
   * Jump to the Camping tab.
   *
   * The peek's availability card already offers this; Overview's copy of the
   * card needs the same shortcut, because a chart you cannot act on is a dead
   * end when the thing you want is a night.
   */
  onOpenCamping?: () => void;
  /** Hand a neighbouring access to the planner as the other end of a float. */
  onPlanTo: (nearby: NearbyAccessPoint) => void;
  /**
   * WHAT each neighbouring access is, as the mark that draws it.
   *
   * Passed in rather than derived here, and this is not a convenience: the
   * detail response describes THIS point and names its neighbours, but
   * NearbyAccessPoint carries no types at all. The map screen already holds
   * every access point on the river with its types, so it is the only place
   * that can answer this without a request per neighbour — and it resolves them
   * through `placeSymbol`, so a take-out is drawn here exactly as it is drawn
   * when you tap it.
   *
   * This replaces a `campableIds: Set<string>` that answered only "can I sleep
   * there" and was rendered as an emoji glued to the end of the name.
   */
  nearbyMarks: Map<string, PlaceSymbolName>;
  /** Whether the one request behind every tab is pending, done or failed. */
  status: DetailStatus;
  /**
   * WHICH FACT THE PEEK IS ALREADY SHOWING, so this tab does not show it twice.
   *
   * The peek is a sibling ABOVE the pager, not a page of it, so it is on screen
   * at every detent — including the one where somebody is reading Overview. The
   * sheet therefore drew the gauge reading twice at once on any gauged put-in:
   * once in the glance and again under the Water heading, nine points apart.
   *
   * Resolved by `decisionSlot` from the layer that was tapped, and passed in
   * rather than recomputed, because it must be the SAME answer PinSheet acted
   * on. Two derivations of "what is the peek showing" is how they come to
   * disagree, and the disagreement here is invisible until a campground pin
   * silently loses its water reading. Optional so a caller that has no peek —
   * or a test — gets the full, unconditional layout.
   */
  peekSlot?: DecisionSlot;
}

/* ── Overview ───────────────────────────────────────────────────────────── */

/**
 * ── What this tab does NOT open with ──────────────────────────────────────
 * The type pills. They were drawn here as well as in the sheet's own chrome —
 * AccessTypeBadges, in the block above the tab bar — and the chrome is visible
 * whichever tab you are on, so Overview's copy said the same six types, the same
 * fee and a "Private" pill duplicating the notice beside it, nine points below
 * the original. The chrome is the right home for them: they describe the PLACE,
 * not this page of it, and a badge that changes with the tab is a badge nobody
 * can rely on.
 */
export function AccessOverviewTab({
  accessPoint,
  detail,
  onOpenDetail,
  onOpenRiver,
  onOpenCamping,
  status: detailStatus,
  peekSlot,
}: TabProps) {
  const point = detail?.accessPoint;
  const camping = nearbyCamping(detail);
  const services = servicesByTier(detail);
  const availability = accessAvailability(point ?? null);
  const availabilityName = accessAvailabilityName(point ?? null, accessPoint.name);
  const { colors } = useTheme();
  // From the detail response when it has landed, from the PIN before that — the
  // map payload carries them too, so the strip paints on the first frame rather
  // than appearing under the reader half a second later.
  const photos = point?.imageUrls?.length ? point.imageUrls : accessPoint.imageUrls ?? [];

  const description = point?.description ?? accessPoint.description ?? null;
  // Only consulted when there is no description; see overviewLead.
  const lead = overviewLead(point ?? null);

  // ── THE PLACE FACTS, each section gated on its OWN content ──────────────
  // Section's `if (!children)` catches null and undefined, not an array of
  // children that all render null — so `<Section><Fact/><Prose/></Section>`
  // draws a bare heading over a gap whenever both are empty. That was survivable
  // while these lived on the Place tab, because `hasDetails` kept the whole tab
  // away from a point with none of them. Overview always renders, so without
  // these three flags every access point in the database would grow three empty
  // headings.
  const road = point?.roadSurface?.length
    ? point.roadSurface.map(roadSurfaceLabel).join(', ')
    : null;
  const parking = parkingLabel(point?.parkingCapacity);
  const tips = stripHtml(point?.localTips);
  const managedBy = point?.managingAgency ? agencyLabel(point.managingAgency) : null;

  const hasGettingIn = Boolean(road || point?.roadAccess);
  const hasParking = Boolean(parking || point?.parkingInfo);
  const hasFacilities = Boolean(
    point?.amenities?.length || point?.facilities || point?.feeNotes || managedBy,
  );
  // ── HAS THIS TAB GOT ANYTHING AT ALL? ─────────────────────────────────
  // The river row is not counted. It is present on every access point in the
  // database — all 406 carry a river_id — so counting it would mean this can
  // never fire, and a lone link is precisely the state being reported as
  // broken.
  // ── A FAILED REQUEST IS NOT AN ANSWER ─────────────────────────────────
  // This folded 'failed' into 'settled' and then said "Eddy has no description
  // for this place yet" — a claim about the DATA made from a failure to load
  // it. Eddy does not know that; the facts that would have filled this tab
  // simply did not arrive. `waitingCopy` below already draws exactly this
  // distinction, and the line just has to use it.
  const settled = detailStatus === 'ready' || detailStatus === 'idle' || detailStatus === 'failed';
  // ── THIS COUNTS EVERY SECTION THE TAB CAN DRAW ────────────────────────
  // It has to. When Place merged in, a point with a road surface and no
  // description would otherwise meet "Eddy has no description for this place
  // yet" sitting directly above a populated Getting in section — a claim the
  // page in front of them disproves.
  const bare =
    !description &&
    !lead &&
    // Counted for the same reason every other section is: a campground whose
    // only fact is its fortnight would otherwise meet "Eddy has no description
    // for this place yet" sitting directly above a populated Campsites card.
    !availability &&
    camping.length === 0 &&
    !hasGettingIn &&
    !hasParking &&
    !hasFacilities &&
    !services.rentals.length &&
    !services.lodging.length &&
    !tips;

  return (
    <View>
      {/* ── WHAT IT LOOKS LIKE, before what it is called ──────────────────
          `imageUrls` has been on the map payload since the imagery backfill and
          the sheet showed one of them at 44pt in the header. A photograph of a
          gravel ramp with room for two cars answers "can I get a trailer down
          there" faster than any sentence on this page, which is why it leads.

          SHORTER THAN THE DETAILS SCREEN'S (110 against 150) and deliberately:
          this is a sheet negotiating with the map for the screen, and the strip
          has to earn its height against the facts below it. Same 8pt gutter and
          the same corner radius, so it reads as the same component seen in a
          smaller room.

          A horizontal scroller inside a page is already proven here —
          FilterChips does it in the Camping tab — including the flexGrow: 0 its
          comment explains. Coverage is partial and always will be, so the
          no-photo case is simply an absent block, never a placeholder. */}
      {photos.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.gallery}
          contentContainerStyle={styles.galleryRow}
        >
          {photos.map((url) => (
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

      {/* The description, or the strongest fact Eddy has instead of one. No
          heading on either: they occupy the same slot and are the same kind of
          sentence. See overviewLead for why 80 of the 81 undescribed access
          points can answer this from data already in the response.

          ── ONLY THE DESCRIPTION FOLDS ────────────────────────────────────
          A description runs to a paragraph and was pushing the water, the road
          and the parking off the first screenful of the tab that exists to
          summarise them. `lead` is already a single borrowed fact, and folding
          one sentence behind a "More" would hide the only thing an undescribed
          put-in has to say in order to save a line it was not costing. */}
      {description ? <FoldedProse>{description}</FoldedProse> : <Prose>{lead}</Prose>}

      {/* ── ABSENT-NEVER-EMPTY GETS A FLOOR AT THE TAB LEVEL ──────────────
          That rule is right for a SECTION — a heading over nothing is a
          promise unkept — and it is what left this tab as a single link. A
          landing tab that resolves to nothing has to say so.

          Through waitingCopy, so there is ONE voice rather than a second copy
          of it — and so a failed request says "unavailable right now" instead
          of claiming Eddy has nothing. Those are different facts and the reader
          can act on only one of them.

          Only once the request has settled: before that, silence is honest,
          because something may still arrive. */}
      {bare && settled ? <Absent>{waitingCopy(detailStatus, 'description')}</Absent> : null}

      {/* ── THERE IS NO WATER SECTION ANY MORE, ON EITHER KIND OF PIN ─────
          On a put-in the peek's compact reading is nine points up the screen
          and never scrolls away, so a Water heading here could only add the
          trend and the timestamp — and the detail endpoint has never populated
          `trend` (it is `null` on every response it has ever sent), while
          `lastUpdated` arrived as a raw ISO timestamp. A heading standing over
          a wire timestamp is a row about the database, which is exactly what
          this sheet's absent-never-empty rule exists to keep off it.

          On a campground pin the reading now rides in the corner of the peek's
          availability card (see CampgroundAvailability's `water`), so between
          the two peek shapes every gauged pin still shows the water exactly
          once — just never down here. */}

      {/* ── Campsite availability, on the same rule, in the other direction ─
          A campground you reached by tapping its put-in mark has its fortnight
          nowhere on this page: the glance gave its one slot to the water, and
          Camping is a swipe away. So Overview carries the card exactly when the
          peek does not — the mirror of the Water rule above, so between the two
          the reader always sees the availability once and never twice.

          The read-only card, not Camping's operable night chips: fourteen
          columns at twenty points is a chart you can look at, and the 44pt
          chips you can book with are what the Camping tab is for. Tapping it
          goes there. */}
      {availability && peekSlot !== 'availability' ? (
        <Section title="Campsites">
          <CampgroundAvailability
            availability={availability}
            name={availabilityName}
            today={localToday()}
            onPress={onOpenCamping ?? undefined}
          />
        </Section>
      ) : null}

      {/* ── EVERYTHING BELOW WAS THE PLACE TAB ────────────────────────────
          Ordered the way somebody standing in a driveway with a boat on the
          roof asks: can I get down there, can I park, what is there, where do I
          sleep, who rents boats, anything else. See tabs.ts for why the split
          ended. */}
      {hasGettingIn ? (
        <Section title="Getting in" symbol="road">
          <Fact label="Road" value={road} />
          <Prose>{point?.roadAccess}</Prose>
        </Section>
      ) : null}

      {hasParking ? (
        <Section title="Parking" symbol="parking">
          <Fact label="Capacity" value={parking} />
          <Prose>{point?.parkingInfo}</Prose>
        </Section>
      ) : null}

      {hasFacilities ? (
        <Section title="Facilities" symbol="facilities">
          {/* ── THE MARK WHERE THE CATALOG HAS ONE, THE WORD WHERE IT DOES
              NOT ─────────────────────────────────────────────────────────
              These were raw database slugs in text pills: `boat_ramp` rendered
              as "boat_ramp". accessAmenities is the one derivation that turns
              the column into a label and, for the four the catalog draws, a
              mark — and it is the same module the river sheet's access rows
              ask, so a put-in cannot say "Boat ramp" in one place and
              "boat_ramp" in another. Picnic and store keep the label alone
              rather than borrow a drawing that means something else. */}
          <AmenityChips amenities={point?.amenities} />
          <Prose>{point?.facilities}</Prose>
          <Fact label="Fees" value={point?.feeNotes} />
          <Fact label="Managed by" value={managedBy} />
        </Section>
      ) : null}

      {/* ── Camping nearby ────────────────────────────────────────────────
          On EVERY access point, not only the ones that are themselves a
          campground. "Where do I sleep the night before?" is asked at the
          put-in you are looking at, and answering it only on campground pins
          answers it in the one place it was not asked.

          Name, distance and who runs it — no site counts, no fees. Those exist
          for NPS sites and not for most others, and a list that showed them
          where it could would read as though the rest had none.

          ── AND IT IS STILL DRAWN EXACTLY ONCE ─────────────────────────────
          The two service sections below take `rentals` and `lodging` from the
          same `servicesByTier` call that produced this one, and the tiers
          partition — so merging Place in could not reintroduce the duplicate
          that split them in the first place. That property is the reason the
          merge is safe, and it lives in servicesByTier rather than here. */}
      {camping.length ? (
        <Section title="Camping nearby">
          {camping.map((entry) => (
            <LinkRow
              key={entry.key}
              label={entry.name}
              detail={entry.detail}
              external={entry.external}
              onPress={entry.onPress}
            />
          ))}
        </Section>
      ) : null}

      {services.rentals.length ? (
        <Section title="Outfitters and shuttles">
          {services.rentals.map((service) => {
            const row = serviceRow(service);
            return (
              <LinkRow
                key={row.key}
                label={row.name}
                detail={service.phone ?? row.detail}
                external
                onPress={row.onPress}
              />
            );
          })}
        </Section>
      ) : null}

      {services.lodging.length ? (
        <Section title="Cabins and lodging">
          {services.lodging.map((service) => {
            const row = serviceRow(service);
            return (
              <LinkRow
                key={row.key}
                label={row.name}
                detail={service.phone ?? row.detail}
                external
                onPress={row.onPress}
              />
            );
          })}
        </Section>
      ) : null}

      {tips ? (
        <Section title="River notes">
          <Prose>{tips}</Prose>
        </Section>
      ) : null}

      {/* ── ONE WAY OUT, AND NOW IT IS UNCONDITIONAL ──────────────────────
          There used to be two rows to one destination — Overview's "Access
          point details" and Place's "Open the full details screen" — so the
          rule became "Overview carries it exactly when Place does not", spelled
          `hasPlaceTab`. With one tab there is one row, and the branch that
          decided which tab owned it is gone with the tab.

          It is `onOpenDetail` alone that gates it now, which is the honest
          condition: null means the map could not compose a route, not that
          another tab has the link.

          The river row stands on its own condition rather than sharing the
          section's: it needs the river's NAME, which only the detail response
          carries, and this tab is drawn from the first frame. */}
      {point?.river || onOpenDetail ? (
        <Section>
          {point?.river ? (
            <LinkRow
              label={`View ${point.river.name}`}
              symbol="river"
              onPress={() => onOpenRiver(point.river.slug)}
            />
          ) : null}
          {onOpenDetail ? (
            <LinkRow label="Access point details" symbol="accessPoint" onPress={onOpenDetail} />
          ) : null}
        </Section>
      ) : null}
    </View>
  );
}

/* ── Float trips ────────────────────────────────────────────────────────── */

/**
 * Where you can float from here, and what is at the other end.
 *
 * ── EACH ROW WEARS ITS DESTINATION'S OWN MARK ─────────────────────────────
 *
 * The only thing distinguishing these rows used to be a bare '⛺' appended to
 * the name string on the ones you could sleep at — an emoji, rendered in the
 * system font, in a product that draws every place in its own art. What the
 * take-out IS changes the trip more than its distance does: a boat ramp means a
 * trailer can meet you, a campground means the float can be two days.
 *
 * The mark comes from `nearbyMarks`, resolved by the map screen through the same
 * `placeSymbol` precedence the pin sheet's own header uses, so a neighbour is
 * drawn here exactly as it is drawn when you tap it. It has to come from there:
 * NearbyAccessPoint is the wire shape and carries no types at all, while the map
 * screen already holds every access point on the river with theirs.
 *
 * ── The direction glyphs are the section's, not the row's ─────────────────
 * Downstream and upstream are a property of the GROUP — every row under one
 * heading shares it — so drawing an arrow on each row would repeat the heading
 * once per line. Ionicons rather than Eddy art: an arrow is a direction, not a
 * thing, and the catalog is a catalog of things.
 */
export function AccessFloatsTab({ detail, onPlanTo, nearbyMarks }: TabProps) {
  const { colors } = useTheme();
  const nearby = detail?.nearbyAccessPoints ?? [];

  if (!nearby.length) {
    return <Absent>No neighbouring access points are mapped on this stretch yet.</Absent>;
  }

  const downstream = nearby.filter((n) => n.direction === 'downstream');
  const upstream = nearby.filter((n) => n.direction === 'upstream');

  const group = (
    title: string,
    icon: 'arrow-down' | 'arrow-up',
    entries: NearbyAccessPoint[],
    verb: string,
  ) =>
    entries.length ? (
      <View style={styles.group}>
        <View style={styles.groupHead}>
          <Ionicons name={icon} size={13} color={colors.textMuted} />
          <Text style={[styles.groupTitle, { color: colors.textMuted }]}>{title}</Text>
        </View>
        {entries.map((entry) => {
          const mark = nearbyMarks.get(entry.id) ?? 'accessPoint';
          return (
            <Pressable
              key={entry.id}
              onPress={() => onPlanTo(entry)}
              style={({ pressed }) => [styles.floatRow, { opacity: pressed ? 0.6 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={`${verb} ${entry.name}, ${entry.distanceMiles.toFixed(1)} miles`}
            >
              {/* A well, so the row's optical left edge holds still: the
                  catalog's drawings are trimmed to their own ink and a wide mark
                  would otherwise start further left than a square one. Same
                  reasoning as PlaceHead's frame. */}
              <View style={[styles.floatWell, { backgroundColor: colors.cardRaised }]}>
                <EddySymbol name={mark} size={17} />
              </View>
              <View style={styles.floatText}>
                <Text style={[styles.floatName, { color: colors.text }]} numberOfLines={1}>
                  {entry.name}
                </Text>
                <Text style={[styles.floatMeta, { color: colors.textMuted }]} numberOfLines={1}>
                  {entry.distanceMiles.toFixed(1)} mi
                  {entry.estimatedFloatTime ? ` · ${entry.estimatedFloatTime}` : ''}
                </Text>
              </View>
              <Text style={[styles.floatAction, { color: colors.interactive }]}>Plan</Text>
            </Pressable>
          );
        })}
      </View>
    ) : null;

  return (
    <View>
      {group('Downstream take-outs', 'arrow-down', downstream, 'Float to')}
      {group('Upstream put-ins', 'arrow-up', upstream, 'Float from')}
    </View>
  );
}

/**
 * How old the site list is, in the reader's own clock.
 *
 * A named site shown as open is a stronger claim than a count, and the sync
 * runs once a night — so the list says when it was checked rather than
 * implying it is live. The row itself opens the booking page, which is.
 */
function checkedLine(fetchedAt: string): string {
  const at = new Date(fetchedAt);
  if (Number.isNaN(at.getTime())) return 'Checked recently';
  return `Checked ${at.toLocaleString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

/* ── Camping ────────────────────────────────────────────────────────────── */

/**
 * Present when this place camps, whatever kind of place it is.
 *
 * Built from the access point's own fields plus the NPS record when there is
 * one — NOT from the NPS record alone. A Missouri State Park or MDC campground
 * has no nps_campgrounds row at all, and a tab that keyed off that would have
 * shown nothing for exactly the sites that most need describing.
 */
/**
 * The tab's one call to action, and the only control on it that takes money.
 *
 * ── AN OUTLINE IS THE RANK, NOT A COMPROMISE ON IT ────────────────────────
 *
 * ADR 0007 gives the app one filled pill per screen — the form separation that
 * lets a single object read as "the thing to press" — and on this tab the peek's
 * "Use as put-in" already is it. The peek does not scroll away, so a filled
 * Book would sit beside a filled put-in and the screen would have two primaries
 * and therefore none.
 *
 * The border is 1.5 where the peek's outlined Directions is 1, which is what
 * separates the page's own primary from a secondary action, and the label names
 * where the tap lands because it lands outside the app.
 */
function BookButton({ action }: { action: BookingAction }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => void Linking.openURL(action.url)}
      style={({ pressed }) => [
        styles.book,
        { borderColor: colors.accentFill, opacity: pressed ? 0.6 : 1 },
      ]}
      // A link, not a button: it leaves for the browser, and the role is how a
      // VoiceOver reader knows that before they commit to it. Same distinction
      // CampsiteList's rows make.
      accessibilityRole="link"
      accessibilityLabel={`${action.label}. Opens in the browser.`}
    >
      <Ionicons name="calendar-outline" size={16} color={colors.accentFill} />
      <Text style={[styles.bookText, { color: colors.accentFill }]} numberOfLines={1}>
        {action.label}
      </Text>
      <Ionicons name="open-outline" size={14} color={colors.accentFill} />
    </Pressable>
  );
}

/**
 * The night this page is showing, said in words.
 *
 * ── THE PAGE STATES ITS OWN CONTEXT ───────────────────────────────────────
 *
 * Everything below this line — the chips, the filters, the site rows — is about
 * ONE night, and until this existed the only thing on the page that named which
 * was a chip that started off-screen. A reader met a list of campsites and had
 * to infer the day from a control they could not see.
 *
 * So the day comes FIRST and the count second, which is the opposite order to
 * the peek's card. That card is a glance deciding whether to open the sheet at
 * all, and there the number is the point. Here the number is an answer to a
 * question the reader has to know they asked.
 *
 * ── One utterance, not two ────────────────────────────────────────────────
 * Two Texts would be two VoiceOver stops for one statement, and "Friday, Aug
 * 14" followed later by "13 of 52 sites open" is a fragment and an orphan. The
 * same reason NightStrip is a single element.
 */
function NightStatus({ night }: { night: NightChoice | null }) {
  const { colors } = useTheme();
  if (!night) return null;

  // Null only when the night was never measured, which most campgrounds are.
  // The day still draws: what the reader is looking at is true either way.
  const phrase = nightPhrase(night);

  return (
    <View
      style={styles.nightStatus}
      accessible
      accessibilityLabel={phrase ? `${night.longLabel}. ${phrase}` : night.longLabel}
    >
      <Text style={[styles.nightDay, { color: colors.text }]} numberOfLines={1}>
        {night.longLabel}
      </Text>
      {phrase ? (
        <Text style={[styles.nightPhrase, { color: colors.textMuted }]} numberOfLines={1}>
          {phrase}
        </Text>
      ) : null}
    </View>
  );
}

export function AccessCampingTab({ accessPoint, detail, status, active = false }: TabProps) {
  const { colors } = useTheme();
  const point = detail?.accessPoint;
  const nps = point?.npsCampground ?? null;
  const availability = accessAvailability(point);

  const today = localToday();
  const nights = useMemo(() => nightChoices(availability, today), [availability, today]);

  // Only the nights that were measured are offered. An unmeasured one has no
  // inventory behind it, so a chip for it is a promise this tab cannot keep and
  // the reader pays a tap to find that out — the rule tabs.ts states for tabs,
  // one level down. The strip in the peek still draws the gap, which is where
  // "nothing is known about these nights" belongs.
  const offered = useMemo(() => nights.filter((night) => night.mark !== 'none'), [nights]);

  // Default to the weekend the peek's card describes — or, when that night was
  // not measured, the first measured night AFTER it rather than the first
  // measured night at all. See defaultNight: falling back to the earliest would
  // walk the reader back to tonight while the peek above still described a
  // weekend three days out.
  //
  // It is NOT the first chip, which is what makes the status line and
  // `scrollToActive` below load-bearing rather than polish: a default the
  // reader cannot see is indistinguishable from no default at all.
  const [selected, setSelected] = useState<string | null>(null);
  const selectedDate =
    selected ?? defaultNight(nights, availability?.window.startDate) ?? today;
  const selectedNight = useMemo(
    () => nights.find((night) => night.date === selectedDate) ?? null,
    [nights, selectedDate],
  );

  const [filters, setFilters] = useState<SiteFilter[]>([]);
  // The RESPONSE's coordinates, or the pin's. A stay search needs a point on the
  // map and nothing else, so it has no reason to wait for a detail request —
  // and it is the one thing still worth offering when that request brought back
  // nothing at all.
  const stayUrl = airbnbSearchUrl(point?.coordinates ?? accessPoint.coordinates ?? null);

  // The one link that takes a booking, and the pages that do not. The official
  // site is no longer offered to bookingAction: it is a park page in every row
  // Eddy holds, so it can only ever become the "Official site" row below.
  //
  // `point.booking` is the server's reservation URL for campgrounds with no NPS
  // record — the state parks, and Red Bluff. It is read from `point` rather
  // than from `availability` on purpose: a stale sync empties availability, and
  // where to book is not a fact that goes stale with this weekend's numbers.
  const booking = bookingAction(nps, availability?.source, point?.booking);
  const showOfficialSite = Boolean(
    point?.officialSiteUrl && point.officialSiteUrl !== booking?.url,
  );

  // Only asked for once this is the live tab — see PinSheet's call site.
  const { sites, status: sitesStatus } = useCampsiteSites(
    active ? (availability?.facilityId ?? null) : null,
  );

  const entries = useMemo(
    () =>
      sites ? sitesOnNight(sites.sites, sites.window.nights, selectedDate) : [],
    [sites, selectedDate],
  );
  const counts = useMemo(() => filterCounts(entries), [entries]);

  // ── HIDDEN CHIPS MUST NOT KEEP FILTERING ────────────────────────────────
  // Whether the list draws rows is a property of the NIGHT, not the campground:
  // a fully booked night has nothing in `open` and collapses to summaries even
  // where every site carries a booking link. So a reader can filter to Electric,
  // step to a booked-out night, and watch the chip row vanish with the filter
  // still applied — narrowing a summary they can no longer see the control for.
  //
  // The filters are therefore spent only while their row is on screen. The state
  // survives, so stepping back to a night with rows restores the selection
  // rather than silently dropping it.
  const showFilters = useMemo(() => listsRows(entries), [entries]);
  const activeFilters = showFilters ? filters : [];

  // ── WITHOUT THE RESPONSE, SHOW WHAT THE PIN KNOWS ───────────────────────
  //
  // This used to be a bare early return, so a tab that had qualified from the
  // pin's own type tags — `isCampground(accessPoint)`, which needs no request —
  // could offer a reader nothing at all but one line. When that line also said
  // "Loading…" for a request that had already settled, the tab was permanently
  // a dead end on a place Eddy plainly knows is a campground.
  //
  // The amenities are on the access point the map already holds, and the stay
  // search needs only coordinates, which it also holds. Neither waits for
  // anything. Live availability genuinely is not knowable here — it arrives only
  // with the response — so the line below says so rather than leaving a gap.
  if (!point) {
    return (
      <View>
        <AmenityChips amenities={accessPoint.amenities} />
        <Absent>{waitingCopy(status, 'campground details')}</Absent>
        {stayUrl ? (
          <Section>
            {/* No `symbol`. This row used to carry the campground mark and the
                settled row below never did, so one pin drew the same link two
                ways depending on whether a request had landed — and the mark was
                wrong either way: the row opens Airbnb, not a campground. */}
            <LinkRow
              label={STAY_SEARCH_LABEL}
              detail={staySearchAreaLabel()}
              external
              externalTint={AIRBNB_LINK_COLOR}
              onPress={() => void Linking.openURL(stayUrl)}
            />
          </Section>
        ) : null}
      </View>
    );
  }

  return (
    <View>
      {/* ── THE DAY THIS PAGE IS ABOUT, BEFORE ANY CONTROL ────────────────
          This slot used to hold a copy of the peek's headline, suppressed when
          the peek was already showing it. Suppression was the wrong shape: it
          made the tab say nothing at all on exactly the pins where the peek
          spoke, and it left the tab's real problem untouched — the SITE LIST
          BELOW IS ONE NIGHT, and nothing on the page named which.

          Nothing did, because the two things that could have were both unable
          to. The peek's headline describes the WINDOW — the server folds that
          count over the weekend on purpose (availability.ts) — and the chip
          that carries the selected night opened several chips along a
          fourteen-wide scroller, off the right-hand edge.

          So this is not the peek's sentence any more. The peek answers "is this
          place worth considering at all", over its window; this answers "what
          am I looking at", for one night. Two different facts, which is why it
          no longer needs a condition to avoid being a second copy of one. */}
      <NightStatus night={selectedNight} />

      {/* The fortnight, at a size that can be tapped — the peek draws the same
          nights as a chart because fourteen columns is twenty points each and
          nothing that small may be a control.

          `scrollToActive` because the selection is NOT the first chip: it opens
          on the weekend the window describes, which starts life off-screen. See
          FilterChips. */}
      {offered.length ? (
        <FilterChips
          chips={offered.map((night) => {
            const phrase = nightPhrase(night);
            return {
              key: night.date,
              label: night.label,
              // ── A ZERO IS ONLY PRINTED WHERE IT IS TRUE ────────────────
              // `empty` means the inventory exists and none of it is left, so
              // "0" is the fact. `dash` means the campground is not offering
              // the night at all — shut for the season, or not yet released —
              // and there is no inventory for the zero to be OF. Printing one
              // there tells a reader to keep refreshing for a cancellation
              // that is not coming.
              //
              // A badgeless chip is unambiguous only because the unmeasured
              // nights are gone from this row: `offered` is what makes the
              // absence readable as "not offered" rather than "not known".
              count: night.mark === 'dash' ? undefined : (night.count ?? undefined),
              // The date AND the state. The visible chip carries the date in
              // its label and the state in a badge the ear cannot see, so a
              // listener given only the phrase would not know which night it
              // described.
              accessibilityLabel: phrase ? `${night.longLabel}. ${phrase}` : night.longLabel,
            };
          })}
          active={[selectedDate]}
          onToggle={setSelected}
          paddingHorizontal={0}
          scrollToActive
        />
      ) : null}

      {/* ── THE WAY TO BOOK COMES BEFORE THE INVENTORY ────────────────────
          This sat at the very bottom, under the site list, the whole "About
          this campground" table, the amenity chips and the season notes. On
          Onondaga that is sixty-four rows of scrolling before the only link
          that can actually reserve any of them, and the report was simply that
          there was no link — which is what a link nobody reaches amounts to.

          The order now matches what a reader is doing: how many are open, on
          which night, HOW TO TAKE ONE, and then the detail about the place.

          `officialSiteUrl` is no longer gated on the absence of an NPS record.
          It was, so a state park — which has no NPS row and therefore no
          reservation URL either — depended on this single row, while a federal
          site that had both showed only one of them. Both are worth having:
          they are the booking system and the park's own page. */}
      {/* ── THE WAY TO PAY IS A BUTTON, NOT ONE OF THREE ROWS ─────────────
          This was a "Book" section holding up to three LinkRows of identical
          weight, of which exactly one took a booking — the other two are a park
          website and an NPS page. A heading that promises booking over a list
          where booking is one option in three makes the reader do the sorting.

          Outlined rather than filled, deliberately. ADR 0007 gives the app one
          filled pill per screen and the peek's "Use as put-in" already spends
          it — and the peek never scrolls away, so a second fill would sit on
          screen beside the first. A 1.5pt border reads heavier than the
          outlined Directions beside that pill without competing with the fill.

          See bookingAction for which link it takes and why the state-park case
          is evidence rather than a guess. */}
      {booking ? <BookButton action={booking} /> : null}

      {/* What is left of that section: the pages ABOUT the place, which were
          never the booking link and no longer sit under a heading claiming they
          were. Whichever URL the button took is not repeated here. */}
      {showOfficialSite || nps?.npsUrl ? (
        <Section>
          {showOfficialSite ? (
            <LinkRow
              label={nps ? 'Park website' : 'Official site'}
              external
              onPress={() => void Linking.openURL(point.officialSiteUrl as string)}
            />
          ) : null}
          {nps?.npsUrl ? (
            <LinkRow
              label="Campground page"
              external
              onPress={() => void Linking.openURL(nps.npsUrl as string)}
            />
          ) : null}
        </Section>
      ) : null}

      <Prose>{nps?.reservationInfo ?? null}</Prose>

      {/* ── THE HEADING NAMES THE NIGHT, because the list is one night ────
          It read "Sites", full stop, above a list built for `selectedDate` —
          and the control that sets that date is two sections up, on the far
          side of Book and the reservation prose. Even a reader who knew a night
          was selected could not see which one from here.

          The night's own label, so the heading and the chip cannot name
          different days; see NightChoice.longLabel. */}
      {availability?.facilityId ? (
        <Section
          title={selectedNight ? `Sites · ${selectedNight.longLabel}` : 'Sites'}
        >
          {sitesStatus === 'ready' && sites ? (
            <>
              {/* ── ONLY WHERE THE LIST IS ROWS ───────────────────────────
                  Where it collapses to "Basic — 12 of 40 open" per kind, these
                  chips split the same sites by the same kinds and print the
                  same counts, and tapping Electric leaves the Electric line the
                  reader was already reading. Two copies of one breakdown, of
                  which only this one has to be operated. See listsRows. */}
              {showFilters ? (
                <FilterChips
                  chips={SITE_FILTERS.filter((f) => counts[f] > 0).map((f) => ({
                    key: f,
                    label: f,
                    count: counts[f],
                  }))}
                  active={filters}
                  onToggle={(key) =>
                    setFilters((current) =>
                      current.includes(key as SiteFilter)
                        ? current.filter((f) => f !== key)
                        : [...current, key as SiteFilter],
                    )
                  }
                  paddingHorizontal={0}
                />
              ) : null}
              <CampsiteList
                entries={entries}
                filters={activeFilters}
                date={selectedDate}
                dateLabel={selectedNight?.longLabel}
              />
              {/* Synced once a night, and a named site is a stronger claim than
                  a count — so the reader is told how old it is, and the row
                  itself opens the booking page that is authoritative. */}
              {sites.fetchedAt ? (
                <Text style={[styles.checked, { color: colors.textSubtle }]}>
                  {checkedLine(sites.fetchedAt)}
                </Text>
              ) : null}
            </>
          ) : sitesStatus === 'failed' ? (
            <Absent>Sites unavailable right now.</Absent>
          ) : sitesStatus === 'ready' ? (
            // Resolved, with nothing to list — an untracked campground, which
            // is the common case. Absent, never a spinner: this used to fall
            // through to "Loading sites…" and stay there for good, because
            // nothing was still coming.
            null
          ) : (
            <Absent>Loading sites…</Absent>
          )}
        </Section>
      ) : null}

      <Section title="About this campground">
        <Fact label="Managed by" value={point.managingAgency ? agencyLabel(point.managingAgency) : null} />
        {/* ── ONE ROW PER AXIS, NOT ONE ROW PER NUMBER ──────────────────────
            These were eight labelled rows carrying one integer each — Sites,
            Reservable, First come, and then the five-way mix — which is most of
            a screen of scrolling on any site whose record is complete, for
            reference a reader reaches only after they have decided they want
            the place. What decides a trip is still in here: whether a camper
            fits, whether there is power, whether you have to carry in. It is
            the LABEL COLUMN that was not earning its keep, once per fact.

            Zero and absent are still both left out, which is the rule the old
            per-row countOrNull applied and campgroundFacts now applies inside
            the line. See its header for why the two axes stay apart. */}
        <Fact label="Sites" value={siteMixLine(nps)} />
        <Fact label="Booking" value={bookingLine(nps)} />
        <Fact label="Fees" value={feeLine(nps, point)} />
      </Section>

      {/* Only the ones that are a yes. A grid of "Dump station: No" is a
          checklist of what a place is not. */}
      <Chips labels={campAmenities(nps)} />

      {nps?.operatingHours?.length ? (
        <Section title="Season">
          {nps.operatingHours.map((hours) => (
            <Prose key={hours.name || hours.description}>{hours.description}</Prose>
          ))}
        </Section>
      ) : null}

      <Section>
        {/* The booking links moved ABOVE the site inventory — see the Book
            section. What stays down here is the one destination that points
            somewhere else entirely. */}
        {/* ── When the campground is full, this is the next question ────────
            Last in the section on purpose: it points away from the place the
            reader opened, so it must never outrank the campground's own
            booking link. A search, never a count — Airbnb publishes no
            listings API, and a badge reading "12 nearby" would promise a
            number Eddy has not got. See lib/stays.ts. */}
        {stayUrl ? (
          <LinkRow
            label={STAY_SEARCH_LABEL}
            detail={staySearchAreaLabel()}
            external
            externalTint={AIRBNB_LINK_COLOR}
            onPress={() => void Linking.openURL(stayUrl)}
          />
        ) : null}
      </Section>
    </View>
  );
}

/* ── Shared derivations ─────────────────────────────────────────────────── */

// AccessDetailsTab ('Place') is gone. Its sections were merged into Overview in
// full — the two tabs both answered "what is this place", so which one held a
// given fact was a coin toss the reader paid a swipe to resolve. tabs.ts carries
// the reasoning; nothing it drew was dropped.

// `waitingCopy` moved to lib/accessCopy.ts — it is a string derived from a
// status and nothing else, and this file cannot be imported by the web suite,
// which is the only runner the Expo app has. Its distinction between "failed"
// and "genuinely empty" is now testable, which it needed to be: the tab-level
// empty line briefly reported a failed request as confirmed absence.

// `countOrNull` moved to campgroundFacts.ts as `counted`, for the same reason
// waitingCopy moved to lib/accessCopy.ts: it is a string derived from a number
// and nothing else, this file cannot be imported by the web suite, and the rule
// it encodes — that zero and absent are the same fact about a campground — is
// now asserted rather than assumed.

/**
 * What it costs, preferring the campground's own fee table over the access
 * point's note — the table is the specific answer and the note is often the
 * park's, not the campground's.
 */
function feeLine(
  nps: NpsCampgroundSummary | null,
  point: { feeNotes: string | null; feeRequired: boolean },
): string | null {
  const paid = nps?.fees?.filter((fee) => fee.cost && fee.cost !== '0.00') ?? [];
  if (paid.length) {
    return paid.map((fee) => `$${fee.cost} ${fee.title}`.trim()).join(' · ');
  }
  return point.feeNotes ?? (point.feeRequired ? 'Fee required' : null);
}

/** The amenities a campground HAS. See the call site for why only those. */
function campAmenities(nps: NpsCampgroundSummary | null): string[] {
  const a = nps?.amenities;
  if (!a) return [];
  const out: string[] = [];
  if (a.toilets?.some(present)) out.push('Toilets');
  if (a.showers?.some(present)) out.push('Showers');
  if (a.potableWater?.some(present)) out.push('Drinking water');
  if (present(a.campStore)) out.push('Camp store');
  if (present(a.firewoodForSale)) out.push('Firewood');
  if (present(a.dumpStation)) out.push('Dump station');
  if (present(a.trashCollection)) out.push('Trash collection');
  if (present(a.cellPhoneReception)) out.push('Cell reception');
  return out;
}

/**
 * The NPS API answers these in prose, not booleans.
 *
 * "None", "No" and "" all mean absent; anything else — "Flush Toilets",
 * "Yes - year round" — means the place has one. Treating a non-empty string as
 * truthy would put "No cell reception" on the card as a feature.
 */
function present(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalised = value.trim().toLowerCase();
  return normalised !== '' && normalised !== 'no' && normalised !== 'none' && normalised !== 'unknown';
}

/**
 * How to reach a service: the phone if there is one, else the website.
 *
 * Phone first, which is the rule the whole app follows — at a put-in on one bar
 * of signal a number you can tap beats a page you have to load. Written once
 * because it was written twice, identically, in the two places that list these
 * services, and a second copy is a second chance to disagree about whether a
 * bare "example.com" needs a scheme.
 */
export function serviceUrl(service: NearbyService): string | null {
  if (service.phone) return `tel:${service.phone.replace(/[^\d+]/g, '')}`;
  if (!service.website) return null;
  return /^https?:\/\//i.test(service.website) ? service.website : `https://${service.website}`;
}

/**
 * The embedded services on this access point, split by what they DO.
 *
 * ── ONE HEADING WAS DOING THE WORK OF THREE ───────────────────────────────
 *
 * Place listed every entry under "Outfitters and shuttles" with no filter at
 * all, and 28 of the 57 entries Eddy holds are not outfitters: 17 are lodging
 * and 11 are campgrounds. So a cabin rental was announced as a shuttle
 * operator, and — worse — the campgrounds appeared TWICE in one sheet, once
 * here and once in Overview's "Camping nearby", which is exactly the
 * duplication the tab consolidation existed to end.
 *
 * `serviceTiers` is the same rule the map layers ask. These entries carry a
 * `type` and no `servicesOffered`, so it falls through to the kind floor — which
 * is what that floor is for.
 */
function servicesByTier(detail: AccessPointDetailResponse | null) {
  const services = detail?.accessPoint?.nearbyServices ?? [];
  const inTier = (tier: ServiceTier) =>
    services.filter((service) => serviceTiers(service).includes(tier));
  return {
    rentals: inTier('rentals'),
    lodging: inTier('lodging'),
    camping: inTier('camping'),
  };
}

/** A service as a row: name, whatever qualifies it, and a way to reach it. */
function serviceRow(service: NearbyService) {
  const url = serviceUrl(service);
  return {
    key: `service-${service.name}`,
    name: service.name,
    detail: [service.distance, service.notes].filter(Boolean).join(' · ') || null,
    external: true,
    onPress: () => {
      if (url) void Linking.openURL(url);
    },
  };
}

/** Places to sleep near this put-in, whoever runs them. Overview's, and only. */
function nearbyCamping(detail: AccessPointDetailResponse | null) {
  return servicesByTier(detail).camping.map(serviceRow);
}

const styles = StyleSheet.create({
  // flexGrow: 0 is load-bearing, not tidiness — a horizontal ScrollView in a
  // column stretches to fill the cross axis and would squeeze everything below
  // it. FilterChips carries the same line for the same reason.
  gallery: { flexGrow: 0, marginTop: 4 },
  galleryRow: { gap: 8, paddingRight: 16 },
  // 110 tall against the details screen's 150: the same picture in a smaller
  // room, kept at roughly 8:5 so a landscape photograph is not cropped to a
  // letterbox. No border — the well's fill shows through while the image loads.
  galleryImage: { width: 176, height: 110, borderRadius: 12 },
  // The reading block's styles left with it — see AccessGaugeReading in
  // sections.tsx. They were this file's only condition-tinted anything.
  checked: { ...t.xs, fontFamily: fonts.body, marginTop: 8 },
  book: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    // The 44pt touch floor from DESIGN.md §6, same as the peek's action row.
    minHeight: 44,
    marginTop: 14,
    borderRadius: 10,
    // 1.5 rather than 1: this is the page's primary and the outlined control it
    // must out-rank — Directions, in the peek — is a hairline.
    borderWidth: 1.5,
  },
  bookText: { ...t.sm, fontFamily: fonts.semibold },
  nightStatus: { marginTop: 10 },
  // t.base rather than the peek card's display face. This names the page's
  // subject; it is not competing with the glance that decided you opened it.
  nightDay: { ...t.base, fontFamily: fonts.heading },
  nightPhrase: { ...t.sm, fontFamily: fonts.body, marginTop: 1 },
  // Section's own spacing, restated here because the heading carries a glyph and
  // Section takes a plain string title.
  group: { marginTop: 14 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  groupTitle: { ...t.sm, fontFamily: fonts.semibold },
  floatRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  floatWell: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatText: { flex: 1, minWidth: 0 },
  floatName: { ...t.sm, fontFamily: fonts.medium },
  floatMeta: { ...t.sm, fontFamily: fonts.body, marginTop: 1 },
  floatAction: { ...t.sm, fontFamily: fonts.semibold },
});
