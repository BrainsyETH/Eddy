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
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EddySymbol } from '@/components/EddySymbol';
import type { PlaceSymbolName } from './placeSymbol';
import type {
  AccessPointDetailResponse,
  MapAccessPoint,
  NearbyAccessPoint,
  NpsCampgroundSummary,
} from '@eddy/types';
import { AvailabilityGlance } from './AvailabilityGlance';
import { localToday, nightChoices } from './availability';
import { accessAvailability, accessAvailabilityName } from './availabilitySource';
import { CampsiteList } from './CampsiteList';
import { airbnbSearchUrl, STAY_SEARCH_LABEL, stayRadiusLabel } from '@/lib/stays';
import { FilterChips } from '@/components/FilterChips';
import { useCampsiteSites } from '@/hooks/useCampsiteSites';
import {
  filterCounts,
  SITE_FILTERS,
  sitesOnNight,
  type SiteFilter,
} from './siteList';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { agencyLabel, parkingLabel, roadSurfaceLabel, stripHtml } from '@/lib/accessCopy';
import { Absent, AccessGaugeReading, Chips, Fact, LinkRow, Prose, Section } from './sections';
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
   * Whether the Place tab qualified.
   *
   * Overview needs it to decide whether IT has to carry the route to the full
   * details screen. Place owns that link whenever it exists — one destination,
   * one strongest affordance — but Place is gated on having facts about the
   * place, and a few access points have none at all.
   */
  hasPlaceTab: boolean;
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
  onOpenGauge,
  onOpenRiver,
  hasPlaceTab,
}: TabProps) {
  const point = detail?.accessPoint;
  const camping = nearbyCamping(detail);
  const status = detail?.gaugeStatus ?? null;

  return (
    <View>
      <Prose>{point?.description ?? accessPoint.description ?? null}</Prose>

      {/* ── WHAT THE CONDITIONS TAB USED TO BE ────────────────────────────
          Two facts, which is not a destination. The reading itself is in the
          peek and is visible from every tab, so a page that opened with a
          second rendering of it — and then offered an "Open gauge" row under a
          block that was already one big tap target to the gauge — was charging
          a swipe for a trend and a timestamp.

          They qualify the number above rather than replacing it, which is what
          makes this the right home: Overview is where a reader goes for the
          sentences about a place, and "rising, read twenty minutes ago" is a
          sentence about the number they have already seen. */}
      {status ? (
        <Section title="Water">
          {/* ── THE READING IS HERE TOO, and that is not the duplication the
              Conditions tab was ────────────────────────────────────────────
              What that tab repeated was the peek's block verbatim and then
              offered a second link to the same gauge. This is the full block
              under a heading, on a page reached by swiping — and it has to be,
              because the peek does NOT always carry the water. Tap a pin on the
              campgrounds layer and the reserved slot goes to availability
              instead (peekSlot.ts), so without this the reader would meet
              "Rising, updated 20 minutes ago" attached to no number at all. */}
          <AccessGaugeReading status={status} onOpenGauge={onOpenGauge} />
          <Fact label="Trend" value={status.trend ? trendLabel(status.trend) : null} />
          <Fact label="Updated" value={status.lastUpdated} />
        </Section>
      ) : null}

      {/* ── Camping nearby ────────────────────────────────────────────────
          On EVERY access point, not only the ones that are themselves a
          campground. "Where do I sleep the night before?" is asked at the
          put-in you are looking at, and answering it only on campground pins
          answers it in the one place it was not asked.

          Name, distance and who runs it — no site counts, no fees. Those exist
          for NPS sites and not for most others, and a list that showed them
          where it could would read as though the rest had none. */}
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

      {/* ── ONE WAY OUT, NOT TWO ──────────────────────────────────────────
          This used to offer "Access point details" as well, which opens exactly
          what Place's "Open the full details screen" opens — two rows, the same
          destination, one swipe apart, and the reader has no way to know they
          are the same. Place kept it, because that is the tab the full screen
          is an extension of.

          The river row stands on its own condition rather than sharing the
          section's: it needs the river's NAME, which only the detail response
          carries, and this tab is drawn from the first frame. */}
      {point?.river || (onOpenDetail && !hasPlaceTab) ? (
        <Section>
          {point?.river ? (
            <LinkRow
              label={`View ${point.river.name}`}
              symbol="river"
              onPress={() => onOpenRiver(point.river.slug)}
            />
          ) : null}
          {/* ── ONLY WHEN PLACE IS NOT THERE TO CARRY IT ──────────────────
              Removing this row was right — it opened exactly what Place's
              "Open the full details screen" opens, one swipe apart, and a
              reader has no way to know two rows are one destination. But Place
              qualifies on having something to say about the place, and a
              handful of access points have nothing: no road surface, no
              parking, no facilities, no fee note, no tips. Those lost their
              only route to their own screen.

              So the rule is one link, not zero: Overview carries it exactly
              when Place does not exist to. */}
          {onOpenDetail && !hasPlaceTab ? (
            <LinkRow label="Access point details" symbol="accessPoint" onPress={onOpenDetail} />
          ) : null}
        </Section>
      ) : null}
    </View>
  );
}

function trendLabel(trend: 'rising' | 'falling' | 'steady'): string {
  if (trend === 'rising') return 'Rising';
  if (trend === 'falling') return 'Falling';
  return 'Holding steady';
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
export function AccessCampingTab({ accessPoint, detail, status, active = false }: TabProps) {
  const { colors } = useTheme();
  const point = detail?.accessPoint;
  const nps = point?.npsCampground ?? null;
  const availability = accessAvailability(point);
  const name = accessAvailabilityName(point);

  const today = localToday();
  const nights = useMemo(() => nightChoices(availability, today), [availability, today]);

  // Default to the weekend the hero describes, so the tab opens agreeing with
  // the number above it rather than on an arbitrary night.
  const [selected, setSelected] = useState<string | null>(null);
  const selectedDate = selected ?? availability?.window.startDate ?? nights[0]?.date ?? today;

  const [filters, setFilters] = useState<SiteFilter[]>([]);
  // The RESPONSE's coordinates, or the pin's. A stay search needs a point on the
  // map and nothing else, so it has no reason to wait for a detail request —
  // and it is the one thing still worth offering when that request brought back
  // nothing at all.
  const stayUrl = airbnbSearchUrl(point?.coordinates ?? accessPoint.coordinates ?? null);

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
        <Chips labels={accessPoint.amenities ?? []} />
        <Absent>{waitingCopy(status, 'campground details')}</Absent>
        {stayUrl ? (
          <Section>
            <LinkRow
              label={STAY_SEARCH_LABEL}
              detail={stayRadiusLabel()}
              external
              symbol="campground"
              onPress={() => void Linking.openURL(stayUrl)}
            />
          </Section>
        ) : null}
      </View>
    );
  }

  return (
    <View>
      <AvailabilityGlance
        availability={availability}
        name={name}
        today={today}
        showStrip={false}
      />

      {/* The fortnight, at a size that can be tapped. The peek draws the same
          nights as a chart because fourteen columns is twenty points each and
          nothing that small may be a control; here they are a real 44pt row. */}
      {nights.some((night) => night.count !== null) ? (
        <FilterChips
          chips={nights.map((night) => ({
            key: night.date,
            label: night.label,
            count: night.count ?? undefined,
          }))}
          active={[selectedDate]}
          onToggle={setSelected}
          paddingHorizontal={0}
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
      <Section title="Book">
        {nps?.reservationUrl ? (
          <LinkRow
            label="Reserve a site"
            external
            symbol="campground"
            onPress={() => void Linking.openURL(nps.reservationUrl as string)}
          />
        ) : null}
        {point.officialSiteUrl ? (
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

      <Prose>{nps?.reservationInfo ?? null}</Prose>

      {availability?.facilityId ? (
        <Section title="Sites">
          {sitesStatus === 'ready' && sites ? (
            <>
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
              <CampsiteList entries={entries} filters={filters} date={selectedDate} />
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
        <Fact
          label="Sites"
          value={nps && nps.totalSites > 0 ? String(nps.totalSites) : null}
        />
        <Fact
          label="Reservable"
          value={nps && nps.sitesReservable > 0 ? String(nps.sitesReservable) : null}
        />
        <Fact
          label="First come"
          value={nps && nps.sitesFirstCome > 0 ? String(nps.sitesFirstCome) : null}
        />
        {/* The mix, when the record breaks it down. What decides a trip is not
            how many sites there are but whether one of them takes a camper or
            can only be reached by boat. Zero and absent are both left out —
            "RV sites: 0" is a sentence about the database. */}
        <Fact label="Tent only" value={countOrNull(nps?.sitesTentOnly)} />
        <Fact label="RV only" value={countOrNull(nps?.sitesRvOnly)} />
        <Fact label="Electric" value={countOrNull(nps?.sitesElectrical)} />
        <Fact label="Group" value={countOrNull(nps?.sitesGroup)} />
        <Fact label="Walk or boat in" value={countOrNull(nps?.sitesWalkBoatTo)} />
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
            detail={stayRadiusLabel()}
            external
            onPress={() => void Linking.openURL(stayUrl)}
          />
        ) : null}
      </Section>
    </View>
  );
}

/* ── Details ────────────────────────────────────────────────────────────── */

export function AccessDetailsTab({ detail, onOpenDetail, status }: TabProps) {
  const point = detail?.accessPoint;
  if (!point) return <Absent>{waitingCopy(status, 'details')}</Absent>;

  const road = point.roadSurface?.length
    ? point.roadSurface.map(roadSurfaceLabel).join(', ')
    : null;
  const parking = parkingLabel(point.parkingCapacity);
  const tips = stripHtml(point.localTips);

  return (
    <View>
      <Section title="Getting in">
        <Fact label="Road" value={road} />
        <Prose>{point.roadAccess}</Prose>
      </Section>

      <Section title="Parking">
        <Fact label="Capacity" value={parking} />
        <Prose>{point.parkingInfo}</Prose>
      </Section>

      <Section title="Facilities">
        <Chips labels={point.amenities ?? []} />
        <Prose>{point.facilities}</Prose>
        <Fact label="Fees" value={point.feeNotes} />
        <Fact
          label="Managed by"
          value={point.managingAgency ? agencyLabel(point.managingAgency) : null}
        />
      </Section>

      {point.nearbyServices?.length ? (
        <Section title="Outfitters and shuttles">
          {point.nearbyServices.map((service) => (
            <LinkRow
              key={`${service.name}-${service.phone ?? service.website ?? ''}`}
              label={service.name}
              detail={service.phone ?? service.notes ?? null}
              external
              onPress={() => {
                const url = service.phone
                  ? `tel:${service.phone.replace(/[^\d+]/g, '')}`
                  : service.website
                    ? /^https?:\/\//i.test(service.website)
                      ? service.website
                      : `https://${service.website}`
                    : null;
                if (url) void Linking.openURL(url);
              }}
            />
          ))}
        </Section>
      ) : null}

      {tips ? (
        <Section title="River notes">
          <Prose>{tips}</Prose>
        </Section>
      ) : null}

      {onOpenDetail ? (
        <Section>
          <LinkRow label="Open the full details screen" onPress={onOpenDetail} />
        </Section>
      ) : null}
    </View>
  );
}

/* ── Shared derivations ─────────────────────────────────────────────────── */

/**
 * What a tab says while it has nothing, told apart by WHY.
 *
 * "Unavailable" on a request still in flight tells the reader to give up on
 * something that is about to arrive; a spinner on a request that already failed
 * asks them to wait for something that never will. Restrained on purpose —
 * neither case is an error the reader caused or can do anything about.
 */
function waitingCopy(status: DetailStatus, subject: string): string {
  if (status === 'loading') return `Loading ${subject}…`;
  if (status === 'failed') return `${sentence(subject)} unavailable right now.`;
  // ── SETTLED, AND NOTHING IS COMING ──────────────────────────────────────
  // 'idle' means no request was ever made — the pin carries no detail route —
  // and 'ready' here means one was made and came back without an access point.
  // Both used to fall through to "Loading…", which is a promise this tab cannot
  // keep: the spinner-less wait never ends, and a reader watching it has no way
  // to learn that. This is the reported bug.
  return `Eddy has no ${subject} for this place.`;
}

/** Capitalised for the start of a sentence, since the subjects are noun phrases. */
function sentence(subject: string): string {
  return subject.charAt(0).toUpperCase() + subject.slice(1);
}

/** Absent for both "none" and "not recorded", which a camper reads the same. */
function countOrNull(count: number | null | undefined): string | null {
  return count && count > 0 ? String(count) : null;
}

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

/** Places to sleep near this put-in, whoever runs them. */
function nearbyCamping(detail: AccessPointDetailResponse | null) {
  const services = detail?.accessPoint?.nearbyServices ?? [];
  return services
    .filter((service) => service.type === 'campground')
    .map((service) => {
      const url = service.phone
        ? `tel:${service.phone.replace(/[^\d+]/g, '')}`
        : service.website
          ? /^https?:\/\//i.test(service.website)
            ? service.website
            : `https://${service.website}`
          : null;
      return {
        key: `service-${service.name}`,
        name: service.name,
        detail: [service.distance, service.notes].filter(Boolean).join(' · ') || null,
        external: true,
        onPress: () => {
          if (url) void Linking.openURL(url);
        },
      };
    });
}

const styles = StyleSheet.create({
  // The reading block's styles left with it — see AccessGaugeReading in
  // sections.tsx. They were this file's only condition-tinted anything.
  checked: { ...t.xs, fontFamily: fonts.body, marginTop: 8 },
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
