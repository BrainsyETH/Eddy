import type { AccessPointDetailResponse, AccessPointGaugeStatus, CampsiteAvailabilitySummary, DamSnapshot, RiverService } from '@eddy/types';
import { centralDayKey, scheduleIsStale } from '@eddy/conditions/dam-schedule-copy';
import { stripHtml, roadSurfaceLabel, parkingLabel, agencyLabel } from './accessCopy';
import { serviceContactActions } from './serviceContactActions';
import { accessAvailability, accessAvailabilityName } from '../components/map-sheet/availabilitySource';
import { decodeSavedCamping, type SavedCamping } from './savedCamping';

export interface SavedPlace {
  version: 2;
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
  facts: { label: string; value: string }[];
  tags: string[];
  amenities: string[];
  links: { label: string; url: string }[];
  savedAt: string;
  detailsDownloadedAt: string | null;
  gauge: { reading: AccessPointGaugeStatus; downloadedAt: string } | null;
  /** Optional for saves written before campsite inventory was retained. */
  camping?: SavedCamping | null;
  dam: { snapshot: DamSnapshot; downloadedAt: string } | null;
  /** 'none' is a durable opt-out, not permission to attach the dam again. */
  damChoice: 'auto' | 'none' | string;
  relatedDamIds: string[];
  damsCheckedAt: string | null;
}
interface PlacePin {
  id: string; name: string; layer: string; coordinates: SavedPlace['coordinates'];
  riverSlug?: string | null; detailRoute?: string | null; body?: string | null;
  availability?: CampsiteAvailabilitySummary | null;
  contactLinks?: { label: string; url: string }[]; link?: { label: string; url: string } | null;
}
export function accessPlaceId(route: string) { return `access:${route}`; }
export function placeFromPin(pin: PlacePin, now: string): SavedPlace | null {
  const access = pin.detailRoute?.match(/^\/river\/([^/]+)\/access\/([^/]+)$/);
  if (!access && pin.layer !== 'campgrounds') return null;
  return { version: 2, id: access ? accessPlaceId(pin.detailRoute!) : `place:${pin.id}`,
    kind: pin.layer === 'campgrounds' ? 'campground' : 'access', name: pin.name,
    riverSlug: access?.[1] ?? pin.riverSlug ?? null, riverName: null, coordinates: pin.coordinates,
    canDrive: !access, detailRoute: access ? pin.detailRoute! : null,
    notes: pin.body ? [stripHtml(pin.body)].filter((n): n is string => !!n) : [], facts: [], tags: [], amenities: [],
    links: pin.contactLinks ?? (pin.link ? [pin.link] : []), savedAt: now,
    detailsDownloadedAt: access ? null : now, gauge: null,
    // A pin without inventory is not a completed detail lookup.
    camping: pin.availability ? decodeSavedCamping({ availability: pin.availability, name: pin.name, downloadedAt: now }) : undefined,
    dam: null,
    damChoice: 'auto', relatedDamIds: [], damsCheckedAt: null };
}
export function placeFromAccess(data: AccessPointDetailResponse, now: string, previous?: SavedPlace): SavedPlace {
  const a = data.accessPoint;
  const availability = accessAvailability(a);
  const route = `/river/${a.river.slug}/access/${a.slug}`;
  const facts = [
    ['Parking', a.parkingInfo ?? parkingLabel(a.parkingCapacity)],
    ['Road', [a.roadAccess, a.roadSurface?.map(roadSurfaceLabel).join(' · ')].filter(Boolean).join('\n')],
    ['Managed by', a.managingAgency ? agencyLabel(a.managingAgency) : null],
    ['Facilities', a.facilities], ['Fees', a.feeNotes], ['Local tips', a.localTips],
  ].flatMap(([label, raw]) => { const value = stripHtml(raw); return label && value ? [{ label, value }] : []; });
  return { version: 2, id: accessPlaceId(route), kind: a.types.includes('campground') ? 'campground' : 'access',
    name: a.name, riverSlug: a.river.slug, riverName: a.river.name, coordinates: a.coordinates,
    drivingLat: a.drivingLat, drivingLng: a.drivingLng, canDrive: true, detailRoute: route,
    notes: [stripHtml(a.description)].filter((n): n is string => !!n), facts,
    tags: [!a.isPublic ? 'Private access' : null, a.feeRequired ? 'Fee required' : null].filter((n): n is string => !!n),
    amenities: a.amenities,
    links: [a.officialSiteUrl ? { label: 'Official website', url: a.officialSiteUrl } : null,
      a.booking ? { label: 'Reservations', url: a.booking.url } : null].filter((link): link is { label: string; url: string } => !!link),
    savedAt: previous?.savedAt ?? now, detailsDownloadedAt: now,
    gauge: data.gaugeStatus ? { reading: data.gaugeStatus, downloadedAt: now } : previous?.gauge ?? null,
    camping: decodeSavedCamping(availability ? { availability, name: accessAvailabilityName(a) ?? a.name, downloadedAt: now } : null),
    dam: previous?.dam ?? null, damChoice: previous?.damChoice ?? 'auto',
    relatedDamIds: previous?.relatedDamIds ?? [], damsCheckedAt: previous?.damsCheckedAt ?? null };
}
export function placeFromService(service: RiverService, previous: SavedPlace, now: string): SavedPlace {
  return { ...previous, name: service.name,
    coordinates: service.latitude != null && service.longitude != null ? { lat: service.latitude, lng: service.longitude } : previous.coordinates,
    notes: [stripHtml(service.description)].filter((n): n is string => !!n),
    tags: service.status === 'temporarily_closed' ? ['Temporarily closed']
      : service.status === 'closed' || service.status === 'permanently_closed' ? ['Closed'] : [],
    links: serviceContactActions(service), detailsDownloadedAt: now,
    camping: decodeSavedCamping(service.availability ? { availability: service.availability, name: service.name, downloadedAt: now } : null) };
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

export const savedPlacesKey = (owner: string) => `eddy.savedPlaces.v2:${encodeURIComponent(owner)}`;
export const SAVED_PLACES_KEY = savedPlacesKey('guest');
export function savedPlacesOwner(userId: string | undefined, anonymous: boolean) { return userId && !anonymous ? userId : 'guest'; }
interface Storage { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void> }
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(v => typeof v === 'string');
export function decodeSavedPlaces(raw: string | null): SavedPlace[] {
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (![1, 2].includes(parsed?.version) || !Array.isArray(parsed.places)) throw new Error('Unsupported saved places');
  return parsed.places.filter((p: SavedPlace) => p && [1, 2].includes(p.version) && typeof p.id === 'string' && typeof p.name === 'string' &&
    (p.kind === 'access' || p.kind === 'campground') && Number.isFinite(p.coordinates?.lat) && Number.isFinite(p.coordinates?.lng) &&
    Math.abs(p.coordinates.lat) <= 90 && Math.abs(p.coordinates.lng) <= 180 && typeof p.savedAt === 'string' &&
    (p.detailRoute == null || typeof p.detailRoute === 'string') && strings(p.notes) && strings(p.amenities) &&
    Array.isArray(p.links) && p.links.every(l => typeof l?.label === 'string' && typeof l.url === 'string'))
    .map((p: SavedPlace) => ({ ...p, version: 2,
      facts: Array.isArray(p.facts) ? p.facts.filter(f => typeof f?.label === 'string' && typeof f.value === 'string') : [],
      tags: strings(p.tags) ? p.tags : [], relatedDamIds: strings(p.relatedDamIds) ? p.relatedDamIds : [],
      damChoice: typeof p.damChoice === 'string' ? p.damChoice : p.dam?.snapshot?.id ?? 'auto',
      damsCheckedAt: typeof p.damsCheckedAt === 'string' ? p.damsCheckedAt : null,
      camping: decodeSavedCamping(p.camping),
      gauge: p.gauge && typeof p.gauge.reading?.usgsId === 'string' && typeof p.gauge.reading.gaugeName === 'string' &&
        (p.gauge.reading.cfs == null || Number.isFinite(p.gauge.reading.cfs)) &&
        (p.gauge.reading.heightFt == null || Number.isFinite(p.gauge.reading.heightFt)) ? p.gauge : null,
      dam: p.dam && typeof p.dam.snapshot?.id === 'string' && typeof p.dam.snapshot.name === 'string' && p.dam.snapshot.metrics &&
        Array.isArray(p.dam.snapshot.schedule) && p.dam.snapshot.schedule.every(d => typeof d?.scheduleDate === 'string' &&
          Array.isArray(d.hours) && d.hours.every(h => h && Number.isFinite(h.hourEnding) && Number.isFinite(h.megawatts)) && Array.isArray(d.idle)) ? p.dam : null,
    }));
}
/** Keep account-specific details/settings on a duplicate, but its first save date. */
function mergeGuestPlaces(account: SavedPlace[], guest: SavedPlace[]) {
  const rows = new Map(account.map(place => [place.id, place]));
  for (const place of guest) {
    const existing = rows.get(place.id);
    if (!existing) rows.set(place.id, place);
    else if (Date.parse(place.savedAt) < Date.parse(existing.savedAt) || !Number.isFinite(Date.parse(existing.savedAt)))
      rows.set(place.id, { ...existing, savedAt: place.savedAt });
  }
  return [...rows.values()].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}
const claimedOwner = (raw: string | null): string | null => {
  const owner = raw ? JSON.parse(raw)?.claimedBy : null;
  return typeof owner === 'string' && owner !== 'guest' ? owner : null;
};
const encodePlaces = (places: SavedPlace[], claimedBy?: string) => JSON.stringify({ version: 2, places, ...(claimedBy ? { claimedBy } : {}) });

/** Scope changes hide old rows immediately; late work can only touch its original scope. */
export function createSavedPlacesStore(storage: Storage) {
  let state: { owner: string; scopeToken: number; ready: boolean; places: SavedPlace[]; error: string | null } =
    { owner: 'guest', scopeToken: 0, ready: false, places: [], error: null };
  let loading: Promise<void> | null = null;
  let claimGuest = false;
  let writes = Promise.resolve();
  const listeners = new Set<() => void>();
  const publish = (next: typeof state) => { state = next; listeners.forEach(fn => fn()); };
  const load = () => {
    if (state.ready && !state.error) return Promise.resolve();
    if (loading) return loading;
    const { owner, scopeToken } = state;
    const shouldClaimGuest = claimGuest;
    const current = () => state.owner === owner && state.scopeToken === scopeToken;
    const task = (async () => {
      await writes.catch(() => {});
      let raw = await storage.getItem(savedPlacesKey(owner));
      const guestRaw = owner === 'guest' ? raw : await storage.getItem(SAVED_PLACES_KEY);
      if (current() && (claimedOwner(guestRaw) || shouldClaimGuest && decodeSavedPlaces(guestRaw).length)) {
        const transfer = writes.catch(() => {}).then(async () => {
          if (!current()) return raw;
          // Re-read inside the write queue; an older transfer may have finished.
          const source = await storage.getItem(SAVED_PLACES_KEY);
          const pendingOwner = claimedOwner(source);
          const target = pendingOwner ?? (shouldClaimGuest ? owner : null);
          if (!target || target === 'guest' || !current()) return raw;
          const guest = decodeSavedPlaces(source);
          if (!guest.length) return raw;
          const account = decodeSavedPlaces(await storage.getItem(savedPlacesKey(target)));
          if (!current()) return raw;
          // Pin the recipient before either key changes. If writing the account
          // or clearing the guest key fails, any later load finishes for this
          // account only, even after a restart or an A-to-B switch.
          if (!pendingOwner) await storage.setItem(SAVED_PLACES_KEY, encodePlaces(guest, target));
          const merged = encodePlaces(mergeGuestPlaces(account, guest));
          await storage.setItem(savedPlacesKey(target), merged);
          await storage.removeItem(SAVED_PLACES_KEY);
          return owner === target ? merged : owner === 'guest' ? null : raw;
        });
        writes = transfer.then(() => {}, () => {});
        raw = await transfer;
      }
      if (current()) publish({ ...state, ready: true, places: decodeSavedPlaces(raw), error: null });
    })().catch(() => { if (current()) publish({ ...state, ready: true, places: [], error: 'Couldn’t load saved places' }); })
      .finally(() => { if (loading === task) loading = null; });
    loading = task;
    return task;
  };
  const change = async (fn: (places: SavedPlace[]) => SavedPlace[], owner = state.owner) => {
    const at = state.scopeToken;
    if (owner !== state.owner) return;
    await load();
    const task = writes.catch(() => {}).then(async () => {
      if (owner !== state.owner || at !== state.scopeToken) return;
      if (state.error) throw new Error(state.error);
      const next = fn(state.places);
      if (next === state.places) return;
      await storage.setItem(savedPlacesKey(owner), encodePlaces(next));
      if (owner === state.owner && at === state.scopeToken) publish({ ...state, ready: true, places: next, error: null });
    });
    writes = task;
    return task;
  };
  return {
    snapshot: () => state,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    load,
    select(owner: string) {
      if (owner !== state.owner) {
        claimGuest = state.owner === 'guest' && owner !== 'guest';
        loading = null;
        publish({ owner, scopeToken: state.scopeToken + 1, ready: false, places: [], error: null });
      }
      return load();
    },
    save: (place: SavedPlace, owner?: string) => change(rows => [place, ...rows.filter(p => p.id !== place.id)], owner),
    toggle: (place: SavedPlace, owner?: string) => change(rows => rows.some(p => p.id === place.id) ? rows.filter(p => p.id !== place.id) : [place, ...rows], owner),
    remove: (id: string, owner?: string) => change(rows => rows.filter(p => p.id !== id), owner),
    replace: (previous: SavedPlace, next: SavedPlace, owner?: string) => change(rows => rows.includes(previous) ? rows.map(p => p === previous ? next : p) : rows, owner),
    linkDam: (id: string, damId: string | null, owner?: string) => change(rows => rows.map(p => p.id === id
      ? { ...p, damChoice: damId ?? 'none', dam: p.dam?.snapshot.id === damId ? p.dam : null } : p), owner),
    clear(owner = state.owner) {
      if (owner === state.owner) { loading = null; publish({ ...state, scopeToken: state.scopeToken + 1, ready: true, places: [], error: null }); }
      const task = writes.catch(() => {}).then(async () => {
        // Remove a failed incoming transfer first, so it cannot revive a
        // deleted account on a later load. Another account's claim is untouched.
        if (owner !== 'guest' && claimedOwner(await storage.getItem(SAVED_PLACES_KEY)) === owner)
          await storage.removeItem(SAVED_PLACES_KEY);
        await storage.removeItem(savedPlacesKey(owner));
      });
      writes = task;
      return task;
    },
  };
}
