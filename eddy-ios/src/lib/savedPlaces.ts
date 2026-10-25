import type { AccessPointDetailResponse, AccessPointGaugeStatus, DamSnapshot, RiverService } from '@eddy/types';
import { centralDayKey, scheduleIsStale } from '@eddy/conditions/dam-schedule-copy';
import { stripHtml, roadSurfaceLabel, parkingLabel, agencyLabel } from './accessCopy';
import { serviceContactActions } from './serviceContactActions';

export interface SavedPlace {
  version: 1;
  id: string;
  kind: 'access' | 'campground';
  name: string;
  riverSlug: string | null;
  riverName: string | null;
  coordinates: { lat: number; lng: number };
  drivingLat?: number | null;
  drivingLng?: number | null;
  canDrive: boolean;
  detailRoute: string | null;
  notes: string[];
  amenities: string[];
  links: { label: string; url: string }[];
  savedAt: string;
  detailsDownloadedAt: string | null;
  gauge: { reading: AccessPointGaugeStatus; downloadedAt: string } | null;
  dam: { snapshot: DamSnapshot; downloadedAt: string } | null;
}
interface PlacePin {
  id: string; name: string; layer: string; coordinates: SavedPlace['coordinates'];
  riverSlug?: string | null; detailRoute?: string | null; body?: string | null;
  contactLinks?: { label: string; url: string }[]; link?: { label: string; url: string } | null;
}
export function accessPlaceId(route: string) { return `access:${route}`; }
export function placeFromPin(pin: PlacePin, now: string): SavedPlace | null {
  const access = pin.detailRoute?.match(/^\/river\/([^/]+)\/access\/([^/]+)$/);
  if (!access && pin.layer !== 'campgrounds') return null;
  return { version: 1, id: access ? accessPlaceId(pin.detailRoute!) : `place:${pin.id}`,
    kind: pin.layer === 'campgrounds' ? 'campground' : 'access', name: pin.name,
    riverSlug: access?.[1] ?? pin.riverSlug ?? null, riverName: null, coordinates: pin.coordinates,
    canDrive: !access, detailRoute: access ? pin.detailRoute! : null,
    notes: pin.body ? [stripHtml(pin.body)].filter((n): n is string => !!n) : [], amenities: [],
    links: pin.contactLinks ?? (pin.link ? [pin.link] : []), savedAt: now,
    detailsDownloadedAt: access ? null : now, gauge: null, dam: null };
}
export function placeFromAccess(data: AccessPointDetailResponse, now: string, previous?: SavedPlace): SavedPlace {
  const a = data.accessPoint;
  const route = `/river/${a.river.slug}/access/${a.slug}`;
  return { version: 1, id: accessPlaceId(route), kind: a.types.includes('campground') ? 'campground' : 'access',
    name: a.name, riverSlug: a.river.slug, riverName: a.river.name, coordinates: a.coordinates,
    drivingLat: a.drivingLat, drivingLng: a.drivingLng, canDrive: true, detailRoute: route,
    notes: [a.description, a.parkingInfo ?? parkingLabel(a.parkingCapacity), a.roadAccess, a.roadSurface?.map(roadSurfaceLabel).join(' · '),
      a.managingAgency ? agencyLabel(a.managingAgency) : null, a.facilities, a.localTips, a.feeNotes,
      !a.isPublic ? 'Private access' : null, a.feeRequired ? 'Fee required' : null]
      .map(n => stripHtml(n ?? null)).filter((n): n is string => !!n),
    amenities: a.amenities,
    links: [a.officialSiteUrl ? { label: 'Official website', url: a.officialSiteUrl } : null,
      a.booking ? { label: 'Reservations', url: a.booking.url } : null].filter((link): link is { label: string; url: string } => !!link),
    savedAt: previous?.savedAt ?? now, detailsDownloadedAt: now,
    gauge: data.gaugeStatus ? { reading: data.gaugeStatus, downloadedAt: now } : previous?.gauge ?? null,
    dam: previous?.dam ?? null };
}
export function placeFromService(service: RiverService, previous: SavedPlace, now: string): SavedPlace {
  return { ...previous, name: service.name,
    coordinates: service.latitude != null && service.longitude != null ? { lat: service.latitude, lng: service.longitude } : previous.coordinates,
    notes: [stripHtml(service.description), service.status === 'temporarily_closed' ? 'Temporarily closed'
      : service.status === 'closed' || service.status === 'permanently_closed' ? 'Closed' : null]
      .filter((n): n is string => !!n), links: serviceContactActions(service), detailsDownloadedAt: now };
}
/** A whole-river association is authoritative; proximity or a partial reach is not. */
export function wholeRiverDam(dams: readonly DamSnapshot[], riverSlug: string | null) {
  const candidates = dams.filter(d => riverSlug && d.tailwater?.riverSlug === riverSlug && !d.tailwater.sectionSlug);
  return candidates.length === 1 ? candidates[0] : null;
}
export function savedScheduleState(day: DamSnapshot['schedule'][number], now: Date) {
  if (day.scheduleDate < centralDayKey(now.getTime())) return 'Historical schedule';
  if (!day.retrievedAt || !Number.isFinite(Date.parse(day.retrievedAt))) return 'Schedule age unknown';
  return scheduleIsStale(day.retrievedAt, now.getTime()) ? 'Older schedule' : 'Downloaded schedule';
}

export const SAVED_PLACES_KEY = 'eddy.savedPlaces.v1';
interface Storage { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void> }
export function decodeSavedPlaces(raw: string | null): SavedPlace[] {
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (parsed?.version !== 1 || !Array.isArray(parsed.places)) throw new Error('Unsupported saved places');
  return parsed.places.filter((p: SavedPlace) => p?.version === 1 && typeof p.id === 'string' && typeof p.name === 'string' &&
    (p.kind === 'access' || p.kind === 'campground') && Number.isFinite(p.coordinates?.lat) && Number.isFinite(p.coordinates?.lng) &&
    Math.abs(p.coordinates.lat) <= 90 && Math.abs(p.coordinates.lng) <= 180 && typeof p.savedAt === 'string' &&
    (p.detailRoute == null || typeof p.detailRoute === 'string') &&
    Array.isArray(p.notes) && p.notes.every(n => typeof n === 'string') &&
    Array.isArray(p.amenities) && p.amenities.every(n => typeof n === 'string') &&
    Array.isArray(p.links) && p.links.every(l => typeof l?.label === 'string' && typeof l.url === 'string'))
    .map((p: SavedPlace) => ({ ...p,
      gauge: p.gauge && typeof p.gauge.reading?.usgsId === 'string' && typeof p.gauge.reading.gaugeName === 'string' &&
        (p.gauge.reading.cfs == null || Number.isFinite(p.gauge.reading.cfs)) &&
        (p.gauge.reading.heightFt == null || Number.isFinite(p.gauge.reading.heightFt)) ? p.gauge : null,
      dam: p.dam && typeof p.dam.snapshot?.id === 'string' && typeof p.dam.snapshot.name === 'string' && p.dam.snapshot.metrics &&
        Array.isArray(p.dam.snapshot.schedule) && p.dam.snapshot.schedule.every(d => typeof d?.scheduleDate === 'string' &&
          Array.isArray(d.hours) && d.hours.every(h => Number.isFinite(h.hourEnding) && Number.isFinite(h.megawatts)) && Array.isArray(d.idle)) ? p.dam : null,
    }));
}
/** Disk commits precede success; late downloads cannot restore a removed place. */
export function createSavedPlacesStore(storage: Storage) {
  let state: { ready: boolean; places: SavedPlace[]; error: string | null } = { ready: false, places: [], error: null };
  let epoch = 0;
  let loading: Promise<void> | null = null;
  let writes = Promise.resolve();
  const listeners = new Set<() => void>();
  const publish = (next: typeof state) => { state = next; listeners.forEach(fn => fn()); };
  const load = () => {
    if (state.ready && !state.error) return Promise.resolve();
    if (loading) return loading;
    const at = epoch;
    loading = storage.getItem(SAVED_PLACES_KEY).then(raw => {
      if (at === epoch) publish({ ready: true, places: decodeSavedPlaces(raw), error: null });
    }).catch(() => { if (at === epoch) publish({ ready: true, places: [], error: 'Couldn’t load saved places' }); })
      .finally(() => { loading = null; });
    return loading;
  };
  const change = (fn: (places: SavedPlace[]) => SavedPlace[]) => {
    const at = epoch;
    const task = writes.catch(() => {}).then(async () => {
      await load();
      if (at !== epoch) return;
      if (state.error) throw new Error(state.error);
      const next = fn(state.places);
      if (next === state.places) return;
      await storage.setItem(SAVED_PLACES_KEY, JSON.stringify({ version: 1, places: next }));
      if (at === epoch) publish({ ready: true, places: next, error: null });
    });
    writes = task;
    return task;
  };
  return {
    snapshot: () => state,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    load,
    save: (place: SavedPlace) => change(rows => [place, ...rows.filter(p => p.id !== place.id)]),
    toggle: (place: SavedPlace) => change(rows => rows.some(p => p.id === place.id) ? rows.filter(p => p.id !== place.id) : [place, ...rows]),
    remove: (id: string) => change(rows => rows.filter(p => p.id !== id)),
    replace: (previous: SavedPlace, next: SavedPlace) => change(rows => rows.includes(previous) ? rows.map(p => p === previous ? next : p) : rows),
    clear() {
      epoch++;
      publish({ ready: true, places: [], error: null });
      const task = writes.catch(() => {}).then(() => storage.removeItem(SAVED_PLACES_KEY));
      writes = task;
      return task;
    },
  };
}
