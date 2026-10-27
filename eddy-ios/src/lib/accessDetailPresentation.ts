import type { AccessPointDetail, AccessPointDetailResponse, CampsiteAvailabilitySummary } from '@eddy/types';
import { stripHtml } from './accessCopy';
import { placeFromAccess, type SavedPlace } from './savedPlaces';
import { savedCampingDisplay, savedGaugeDisplay } from './savedPlaceDisplay';
import { accessAvailability } from '../components/map-sheet/availabilitySource';

// The existing access screen can show a saved snapshot without pretending it
// contains the UUID, public status, river mile or web path of a live response.
type DisplayPoint = Pick<AccessPointDetail,
  'name' | 'coordinates' | 'types' | 'amenities' | 'roadSurface' | 'imageUrls' | 'nearbyServices'>
  & Partial<Omit<AccessPointDetail, 'river'>>
  & { river: { name: string | null; slug: string } };

export function savedAccessRoute(saved: Pick<SavedPlace, 'detailRoute'> | undefined) {
  const parts = saved?.detailRoute?.match(/^\/river\/([^/?#]+)\/access\/([^/?#]+)$/);
  return parts ? { slug: parts[1], accessSlug: parts[2] } : null;
}

function newerObservation(candidate: string | null | undefined, current: string | null | undefined, now: number) {
  const candidateAt = candidate ? Date.parse(candidate) : NaN;
  if (!Number.isFinite(candidateAt) || candidateAt > now) return false;
  const currentAt = current ? Date.parse(current) : NaN;
  return !Number.isFinite(currentAt) || currentAt > now || candidateAt > currentAt;
}

/** Share observation ordering between the screen and its persisted snapshot. */
export function retainNewerSavedObservations(
  snapshot: SavedPlace,
  saved: SavedPlace | undefined,
  now: number,
  // Raw availability distinguishes a removed source from an invalid timestamp
  // that the snapshot decoder rejected. Never persist that raw value itself.
  liveCamping: CampsiteAvailabilitySummary | null | undefined = snapshot.camping?.availability,
) {
  const candidate = saved?.detailRoute === snapshot.detailRoute ? saved : undefined;
  if (snapshot.gauge && candidate?.gauge
    && candidate.gauge.reading.usgsId === snapshot.gauge.reading.usgsId
    && newerObservation(candidate.gauge.reading.lastUpdated, snapshot.gauge.reading.lastUpdated, now)) {
    snapshot = { ...snapshot, gauge: candidate.gauge };
  }
  if (liveCamping && candidate?.camping
    && candidate.camping.availability.source === liveCamping.source
    && candidate.camping.availability.facilityId === liveCamping.facilityId
    && newerObservation(candidate.camping.availability.fetchedAt, liveCamping.fetchedAt, now)) {
    snapshot = { ...snapshot, camping: candidate.camping };
  }
  return snapshot;
}

export function accessDetailPresentation(data: AccessPointDetailResponse | null, saved: SavedPlace | undefined, now: number) {
  const route = savedAccessRoute(saved);
  if (!data && (!saved || !route)) return null;
  const snapshot = data ? retainNewerSavedObservations(
    placeFromAccess(data, new Date(now).toISOString()), saved, now, accessAvailability(data.accessPoint),
  ) : saved!;
  const fact = (label: string) => stripHtml(snapshot.facts.find(entry => entry.label === label)?.value);
  const point: DisplayPoint = data?.accessPoint ?? {
    name: snapshot.name, coordinates: snapshot.coordinates,
    river: { name: snapshot.riverName, slug: route!.slug },
    types: [], amenities: snapshot.amenities, roadSurface: [], imageUrls: [], nearbyServices: [],
    description: snapshot.notes.join('\n\n'), roadAccess: fact('Road'), parkingInfo: fact('Parking'),
    facilities: fact('Facilities'), feeNotes: fact('Fees'), localTips: fact('Local tips'),
    drivingLat: snapshot.drivingLat, drivingLng: snapshot.drivingLng,
    isPublic: snapshot.tags.includes('Private access') ? false : undefined,
    feeRequired: snapshot.tags.includes('Fee required') ? true : undefined,
    officialSiteUrl: snapshot.links.find(link => link.label === 'Official website' && /^https?:/i.test(link.url))?.url,
  };
  const display = savedGaugeDisplay(snapshot, now);
  const reading = snapshot.gauge?.reading;
  const gauge = reading ? {
    ...reading,
    cfs: display.band === 'expired' ? null : reading.cfs,
    heightFt: display.band === 'expired' ? null : reading.heightFt,
    level: display.code ?? 'unknown' as const,
    label: display.condition ?? display.state ?? 'Reading unavailable',
    trend: display.band === 'fresh' ? reading.trend : null,
  } : null;
  return {
    point, gauge, gaugeAge: display.age,
    camping: savedCampingDisplay(snapshot, now),
    canDrive: data ? true : snapshot.canDrive,
    nearbyAccessPoints: data?.nearbyAccessPoints ?? [],
    // Unmapped legacy/future facts remain visible rather than disappearing.
    extraFacts: data ? [] : snapshot.facts.filter(entry => !['Road', 'Parking', 'Facilities', 'Fees', 'Local tips'].includes(entry.label)),
    extraLinks: data ? [] : snapshot.links.filter(link => link.label !== 'Official website' && /^(https?:|tel:)/i.test(link.url)),
  };
}
