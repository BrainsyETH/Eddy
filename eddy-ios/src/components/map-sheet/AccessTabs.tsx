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
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type {
  AccessPointDetailResponse,
  MapAccessPoint,
  NearbyAccessPoint,
  NpsCampgroundSummary,
} from '@eddy/types';
import { accessPointTypes, accessTypeLabel, campsiteAvailabilityLine } from '@eddy/types';
import { conditionBg, conditionChipBorder, conditionInk, conditionText } from '@/theme/conditions';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { agencyLabel, parkingLabel, roadSurfaceLabel, stripHtml } from '@/lib/accessCopy';
import { formatReading } from '@/lib/readingCopy';
import { Absent, Chips, Fact, LinkRow, Prose, Section } from './sections';

interface TabProps {
  accessPoint: MapAccessPoint;
  detail: AccessPointDetailResponse | null;
  onOpenGauge: (siteId: string) => void;
  onOpenDetail: () => void;
  onOpenRiver: (slug: string) => void;
  /** Hand a neighbouring access to the planner as the other end of a float. */
  onPlanTo: (nearby: NearbyAccessPoint) => void;
  /**
   * Which neighbouring accesses you can sleep at.
   *
   * Passed in rather than derived here: the detail response describes THIS
   * point and names its neighbours, but does not say what they are. The map
   * screen already holds every access point on the river with its types, so it
   * is the only place that can answer this without another request.
   */
  campableIds: Set<string>;
}

/* ── Overview ───────────────────────────────────────────────────────────── */

export function AccessOverviewTab({ accessPoint, detail, onOpenDetail, onOpenRiver }: TabProps) {
  const point = detail?.accessPoint;
  const camping = nearbyCamping(detail);

  return (
    <View>
      <Chips
        labels={[
          ...accessPointTypes(accessPoint).map(accessTypeLabel),
          ...(accessPoint.feeRequired ? ['Fee required'] : []),
          ...(accessPoint.isPublic ? [] : ['Private']),
        ]}
      />

      <Prose>{point?.description ?? accessPoint.description ?? null}</Prose>

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

      {point?.river ? (
        <Section>
          <LinkRow label={`View ${point.river.name}`} onPress={() => onOpenRiver(point.river.slug)} />
          <LinkRow label="Access point details" onPress={onOpenDetail} />
        </Section>
      ) : null}
    </View>
  );
}

/* ── Conditions ─────────────────────────────────────────────────────────── */

export function AccessConditionsTab({ detail, onOpenGauge }: TabProps) {
  const { colors, isDark } = useTheme();
  const status = detail?.gaugeStatus ?? null;

  if (!status) {
    return (
      <Absent>
        No gauge grades this stretch yet, so Eddy has no reading to show for it.
      </Absent>
    );
  }

  const reading =
    status.cfs != null
      ? formatReading(status.cfs, 'cfs')
      : status.heightFt != null
        ? formatReading(status.heightFt, 'ft')
        : null;

  return (
    <View>
      <Pressable
        onPress={() => onOpenGauge(status.usgsId)}
        style={({ pressed }) => [styles.readingBlock, { opacity: pressed ? 0.6 : 1 }]}
        accessibilityRole="button"
        accessibilityLabel={`${status.gaugeName}, ${status.label}. Open the gauge`}
      >
        <View style={styles.readingRow}>
          {reading ? (
            <Text style={[styles.reading, { color: conditionText(status.level, isDark) }]}>
              {reading}
            </Text>
          ) : null}
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
        {/* The station's NAME, always. This is the river's nearest
            at-or-upstream gauge applied to the reach, not a sensor at this
            ramp — and a reading with no station on it reads as measured here.
            Same rule useAccessGaugeStatus states. */}
        <Text style={[styles.gaugeName, { color: colors.textMuted }]} numberOfLines={2}>
          at {status.gaugeName}
        </Text>
      </Pressable>

      <Section>
        <Fact label="Trend" value={status.trend ? trendLabel(status.trend) : null} />
        <Fact label="Updated" value={status.lastUpdated} />
      </Section>

      <Section>
        <LinkRow label="Open gauge" onPress={() => onOpenGauge(status.usgsId)} />
      </Section>
    </View>
  );
}

function trendLabel(trend: 'rising' | 'falling' | 'steady'): string {
  if (trend === 'rising') return 'Rising';
  if (trend === 'falling') return 'Falling';
  return 'Holding steady';
}

/* ── Float trips ────────────────────────────────────────────────────────── */

export function AccessFloatsTab({ detail, onPlanTo, campableIds }: TabProps) {
  const { colors } = useTheme();
  const nearby = detail?.nearbyAccessPoints ?? [];

  if (!nearby.length) {
    return <Absent>No neighbouring access points are mapped on this stretch yet.</Absent>;
  }

  const downstream = nearby.filter((n) => n.direction === 'downstream');
  const upstream = nearby.filter((n) => n.direction === 'upstream');
  const group = (title: string, entries: NearbyAccessPoint[], verb: string) =>
    entries.length ? (
      <Section title={title}>
        {entries.map((entry) => (
          <Pressable
            key={entry.id}
            onPress={() => onPlanTo(entry)}
            style={({ pressed }) => [styles.floatRow, { opacity: pressed ? 0.6 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={`${verb} ${entry.name}, ${entry.distanceMiles.toFixed(1)} miles`}
          >
            <View style={styles.floatText}>
              <Text style={[styles.floatName, { color: colors.text }]} numberOfLines={1}>
                {entry.name}
                {campableIds.has(entry.id) ? '  ⛺' : ''}
              </Text>
              <Text style={[styles.floatMeta, { color: colors.textMuted }]} numberOfLines={1}>
                {entry.distanceMiles.toFixed(1)} mi
                {entry.estimatedFloatTime ? ` · ${entry.estimatedFloatTime}` : ''}
              </Text>
            </View>
            <Text style={[styles.floatAction, { color: colors.interactive }]}>Plan</Text>
          </Pressable>
        ))}
      </Section>
    ) : null;

  return (
    <View>
      {group('Downstream take-outs', downstream, 'Float to')}
      {group('Upstream put-ins', upstream, 'Float from')}
    </View>
  );
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
export function AccessCampingTab({ detail }: TabProps) {
  const point = detail?.accessPoint;
  const nps = point?.npsCampground ?? null;
  const availability = campsiteAvailabilityLine(nps?.availability, nps?.name ?? point?.name);

  if (!point) return <Absent>Camping details are still loading.</Absent>;

  return (
    <View>
      {availability ? <Prose>{availability}</Prose> : null}

      <Section>
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

      <Prose>{nps?.reservationInfo ?? null}</Prose>

      <Section>
        {nps?.reservationUrl ? (
          <LinkRow
            label="Reserve a site"
            external
            onPress={() => void Linking.openURL(nps.reservationUrl as string)}
          />
        ) : null}
        {nps?.npsUrl ? (
          <LinkRow
            label="Campground page"
            external
            onPress={() => void Linking.openURL(nps.npsUrl as string)}
          />
        ) : null}
        {!nps && point.officialSiteUrl ? (
          <LinkRow
            label="Official site"
            external
            onPress={() => void Linking.openURL(point.officialSiteUrl as string)}
          />
        ) : null}
      </Section>
    </View>
  );
}

/* ── Details ────────────────────────────────────────────────────────────── */

export function AccessDetailsTab({ detail, onOpenDetail }: TabProps) {
  const point = detail?.accessPoint;
  if (!point) return <Absent>Details are still loading.</Absent>;

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

      <Section>
        <LinkRow label="Open the full details screen" onPress={onOpenDetail} />
      </Section>
    </View>
  );
}

/* ── Shared derivations ─────────────────────────────────────────────────── */

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
  readingBlock: { marginTop: 10 },
  readingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reading: { ...t.lg, fontFamily: fonts.mono },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  chipText: { ...t.sm, fontFamily: fonts.semibold },
  gaugeName: { ...t.sm, fontFamily: fonts.body, marginTop: 3 },
  floatRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  floatText: { flex: 1, minWidth: 0 },
  floatName: { ...t.sm, fontFamily: fonts.medium },
  floatMeta: { ...t.sm, fontFamily: fonts.body, marginTop: 1 },
  floatAction: { ...t.sm, fontFamily: fonts.semibold },
});
