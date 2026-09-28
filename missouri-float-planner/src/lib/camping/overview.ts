import type { SupabaseClient } from '@supabase/supabase-js';
import { bookingUrlFor } from './booking';
import { MAX_AGE_MS } from './read';
import { resolveHorizon, resolveWeekend } from './window';
import type {
  CampingOverview,
  CampingPlace,
  TrackedCampground,
  CampingObservation,
} from './overview-types';

export interface FacilityRow {
  id: string;
  display_name: string;
  source: TrackedCampground['source'];
  source_facility_id: string;
  source_loop: string | null;
  enabled: boolean;
  kind: string;
  access_point_id: string | null;
  nearby_service_id: string | null;
  nps_campground_id: string | null;
  latest: { fetched_at: string }[];
}
export interface ObservationRow {
  facility_id: string;
  date: string;
  sites_open: number;
  sites_reservable: number;
  status: CampingObservation['status'];
  fetched_at: string;
}
export interface PlaceRow {
  id: string;
  name: string;
  type?: string;
  status?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  website?: string | null;
  nps_url?: string | null;
  reservation_url?: string | null;
  managing_agency?: string | null;
  sites_first_come?: number | null;
}
export interface AccessRow {
  location_orig?: { coordinates?: number[] } | null;
  id: string;
  river_id: string;
  nps_campground_id: string | null;
}
export interface IdentityRow {
  access_point_id: string;
  nearby_service_id: string;
  relationship: string;
  verified_at: string | null;
}
export interface OverviewInput {
  facilities: FacilityRow[];
  observations: ObservationRow[];
  services: PlaceRow[];
  nps: PlaceRow[];
  access: AccessRow[];
  identities: IdentityRow[];
  serviceRivers: {
    service_id: string;
    river_id: string;
    is_primary: boolean;
  }[];
  rivers: { id: string; slug: string; name: string }[];
}
export function safeCampingUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && !u.username && !u.password ? raw : null;
  } catch {
    return null;
  }
}
function location(p: PlaceRow | undefined): CampingPlace['location'] {
  if (p?.latitude == null || p.longitude == null) return null;
  const lat = Number(p.latitude),
    lng = Number(p.longitude);
  return Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
    ? { lat, lng }
    : null;
}
export function buildCampingOverview(
  input: OverviewInput,
  now = new Date(),
): CampingOverview {
  const horizon = resolveHorizon(now),
    weekend = resolveWeekend(now);
  const services = new Map(
    input.services
      .filter(
        (p) =>
          !['permanently_closed', 'temporarily_closed'].includes(
            p.status ?? '',
          ),
      )
      .map((p) => [p.id, p]),
  );
  const nps = new Map(input.nps.map((p) => [p.id, p]));
  const access = new Map(input.access.map((p) => [p.id, p]));
  const rivers = new Map(input.rivers.map((p) => [p.id, p]));
  const links = input.identities.filter(
    (l) => l.verified_at && l.relationship === 'same_place',
  );
  const covered = new Set<string>();
  function place(
    serviceId: string | null,
    npsId: string | null,
    accessId: string | null,
  ): CampingPlace {
    const a =
      (accessId ? access.get(accessId) : undefined) ??
      input.access.find(
        (a) =>
          (npsId && a.nps_campground_id === npsId) ||
          (serviceId &&
            links.some(
              (l) =>
                l.nearby_service_id === serviceId && l.access_point_id === a.id,
            )),
      );
    const s = serviceId ? services.get(serviceId) : undefined;
    const n = nps.get(npsId ?? a?.nps_campground_id ?? '');
    const primary = input.serviceRivers
      .filter((l) => l.service_id === serviceId)
      .sort(
        (a, b) =>
          Number(b.is_primary) - Number(a.is_primary) ||
          a.river_id.localeCompare(b.river_id),
      );
    const riverIds = [
      ...new Set(
        [a?.river_id, ...primary.map((l) => l.river_id)].filter(
          (id): id is string => !!id,
        ),
      ),
    ];
    const linkedRivers = riverIds
      .map((id) => rivers.get(id))
      .filter((r): r is NonNullable<typeof r> => !!r);
    const group = linkedRivers[0];
    return {
      id: s?.id ?? n?.id ?? a?.id ?? '',
      name: s?.name ?? n?.name ?? 'Campground',
      place: a
        ? { type: 'access_point', id: a.id }
        : n
          ? { type: 'nps_campground', id: n.id }
          : s
            ? { type: 'service', id: s.id }
            : null,
      location:
        location(s) ??
        location(n) ??
        location(
          a?.location_orig?.coordinates
            ? {
                id: a.id,
                name: '',
                latitude: a.location_orig.coordinates[1],
                longitude: a.location_orig.coordinates[0],
              }
            : undefined,
        ),
      riverSlugs: linkedRivers.map((r) => r.slug),
      displayGroup: group
        ? { key: group.slug, label: group.name }
        : { key: 'other', label: 'Other tracked campgrounds' },
      managingAgency:
        s?.managing_agency ?? (n ? 'National Park Service' : null),
      website: safeCampingUrl(s?.website) ?? safeCampingUrl(n?.nps_url),
      reservationUrl:
        safeCampingUrl(s?.reservation_url) ??
        safeCampingUrl(n?.reservation_url),
      firstCome:
        n?.sites_first_come == null
          ? 'unknown'
          : n.sites_first_come > 0
            ? 'present'
            : 'none',
      accessDestination:
        a && rivers.get(a.river_id)
          ? { riverSlug: rivers.get(a.river_id)!.slug, accessId: a.id }
          : null,
    };
  }
  const enabled = input.facilities.filter(
    (f) => f.enabled && f.kind === 'campground',
  );
  // Fail loudly on overlapping aggregate/loop inventory; don't silently double-count coverage.
  for (const f of enabled)
    if (
      f.source_loop &&
      enabled.some(
        (a) =>
          a.source === f.source &&
          a.source_facility_id === f.source_facility_id &&
          !a.source_loop,
      )
    ) {
      throw new Error('Overlapping camping aggregate and loop inventory');
    }
  const tracked = enabled
    .map((f) => {
      const p = place(
        f.nearby_service_id,
        f.nps_campground_id,
        f.access_point_id,
      );
      if (f.nearby_service_id) covered.add('s:' + f.nearby_service_id);
      if (f.nps_campground_id) covered.add('n:' + f.nps_campground_id);
      if (p.place?.type === 'access_point') {
        const n = access.get(p.place.id)?.nps_campground_id;
        if (n) covered.add('n:' + n);
        for (const l of links.filter((l) => l.access_point_id === p.place!.id))
          covered.add('s:' + l.nearby_service_id);
      }
      const byDate = new Map<string, ObservationRow>();
      for (const r of input.observations.filter(
        (r) => r.facility_id === f.id && horizon.nights.includes(r.date),
      )) {
        const time = Date.parse(r.fetched_at),
          age = now.getTime() - time;
        if (
          !Number.isFinite(time) ||
          age < 0 ||
          age >= MAX_AGE_MS ||
          !Number.isInteger(r.sites_open) ||
          !Number.isInteger(r.sites_reservable) ||
          r.sites_open < 0 ||
          r.sites_open > r.sites_reservable
        )
          continue;
        if (!['open', 'full', 'closed', 'not_yet_released'].includes(r.status))
          continue;
        if (r.status === 'full' && r.sites_reservable <= 0) continue;
        if (r.status === 'open' ? r.sites_open === 0 : r.sites_open !== 0)
          continue;
        if (
          !byDate.has(r.date) ||
          Date.parse(byDate.get(r.date)!.fetched_at) < time
        )
          byDate.set(r.date, r);
      }
      const nights = [...byDate.values()]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((r) => ({
          date: r.date,
          sitesOpen: r.sites_open,
          sitesReservable: r.sites_reservable,
          status: r.status,
          checkedAt: r.fetched_at,
        }));
      const latest =
        [
          ...f.latest.map((r) => r.fetched_at),
          ...input.observations
            .filter((r) => r.facility_id === f.id)
            .map((r) => r.fetched_at),
        ]
          .filter(
            (t) =>
              Number.isFinite(Date.parse(t)) && Date.parse(t) <= now.getTime(),
          )
          .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
      // A loop's stored NPS URL may refer to an obsolete district. Use the curated provider ID.
      const loopUrl =
        f.source === 'recreation_gov' &&
        f.source_loop &&
        /^\d+$/.test(f.source_facility_id)
          ? `https://www.recreation.gov/camping/campgrounds/${f.source_facility_id}`
          : null;
      const url = bookingUrlFor(f.source, loopUrl ?? p.reservationUrl);
      return {
        ...p,
        id: f.id,
        name: f.display_name,
        facilityId: f.id,
        serviceId: f.nearby_service_id,
        loopName: f.source_loop,
        source: f.source,
        booking: url
          ? {
              url,
              label: f.source_loop
                ? 'Book through district permit'
                : 'Check and book',
            }
          : null,
        latestObservationAt: latest,
        freshness: nights.length ? 'fresh' : latest ? 'stale' : 'unknown',
        nights,
      } satisfies TrackedCampground;
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const untracked: CampingPlace[] = [];
  const emitted = new Set<string>();
  for (const [kind, catalog] of [
    ['s', [...services.values()].filter((s) => s.type === 'campground')],
    ['n', input.nps],
  ] as const) {
    for (const record of catalog) {
      if (covered.has(kind + ':' + record.id)) continue;
      const p = place(
        kind === 's' ? record.id : null,
        kind === 'n' ? record.id : null,
        null,
      );
      const key = p.place
        ? p.place.type + ':' + p.place.id
        : kind + ':' + record.id;
      if (!emitted.has(key)) {
        emitted.add(key);
        untracked.push(p);
      }
    }
  }
  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    maxObservationAgeSeconds: MAX_AGE_MS / 1000,
    timeZone: 'America/Chicago',
    horizon: {
      startDate: horizon.startDate,
      endDateExclusive: horizon.endDate,
      nights: horizon.nights,
    },
    weekend: {
      startDate: weekend.startDate,
      endDateExclusive: weekend.endDate,
      nights: weekend.nights,
      label: weekend.label,
    },
    tracked,
    untracked,
  };
}

// Paginate complete public catalogs; never silently accept PostgREST's default row cap.
async function allRows<T>(
  query: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; offset < 10000; offset += 500) {
    const { data, error } = await query(offset, offset + 499);
    if (error)
      throw new Error('Camping overview database read failed', {
        cause: error,
      });
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 500) return out;
  }
  throw new Error('Camping overview catalog exceeds safety limit');
}
export async function loadCampingOverview(
  db: SupabaseClient,
  now = new Date(),
): Promise<CampingOverview> {
  const horizon = resolveHorizon(now);
  const [
    facilities,
    observations,
    services,
    nps,
    access,
    identities,
    serviceRivers,
    rivers,
  ] = await Promise.all([
    allRows<FacilityRow>((a, b) =>
      db
        .from('campsite_facilities')
        .select(
          'id,display_name,source,source_facility_id,source_loop,enabled,kind,access_point_id,nearby_service_id,nps_campground_id,latest:campsite_availability(fetched_at)',
        )
        .order('id')
        .order('fetched_at', { referencedTable: 'latest', ascending: false })
        .limit(1, { referencedTable: 'latest' })
        .range(a, b),
    ),
    allRows<ObservationRow>((a, b) =>
      db
        .from('campsite_availability')
        .select(
          'facility_id,date,sites_open,sites_reservable,status,fetched_at',
        )
        .gte('date', horizon.startDate)
        .lt('date', horizon.endDate)
        .order('facility_id')
        .order('date')
        .range(a, b),
    ),
    allRows<PlaceRow>((a, b) =>
      db
        .from('nearby_services')
        .select(
          'id,name,type,status,latitude,longitude,website,reservation_url,managing_agency',
        )
        .order('id')
        .range(a, b),
    ),
    allRows<PlaceRow>((a, b) =>
      db
        .from('nps_campgrounds')
        .select(
          'id,name,latitude,longitude,nps_url,reservation_url,sites_first_come',
        )
        .order('id')
        .range(a, b),
    ),
    allRows<AccessRow>((a, b) =>
      db
        .from('access_points')
        .select('id,river_id,nps_campground_id,location_orig')
        .eq('approved', true)
        .order('id')
        .range(a, b),
    ),
    allRows<IdentityRow>((a, b) =>
      db
        .from('access_point_services')
        .select('access_point_id,nearby_service_id,relationship,verified_at')
        .eq('relationship', 'same_place')
        .not('verified_at', 'is', null)
        .order('access_point_id')
        .order('nearby_service_id')
        .range(a, b),
    ),
    allRows<OverviewInput['serviceRivers'][number]>((a, b) =>
      db
        .from('service_rivers')
        .select('service_id,river_id,is_primary')
        .order('service_id')
        .order('river_id')
        .range(a, b),
    ),
    allRows<OverviewInput['rivers'][number]>((a, b) =>
      db.from('rivers').select('id,slug,name').order('id').range(a, b),
    ),
  ]);
  return buildCampingOverview(
    {
      facilities,
      observations,
      services,
      nps,
      access,
      identities,
      serviceRivers,
      rivers,
    },
    now,
  );
}
