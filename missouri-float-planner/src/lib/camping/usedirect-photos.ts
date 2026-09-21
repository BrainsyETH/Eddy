import type { CampsitePhoto } from './photos';
import { campgroundLoops } from './usedirect';

const API = 'https://msprdr.usedirect.com/MSPRDR/rdr';
// This is the base used by the public reservation site's gallery. The distinct
// msp-content host in UnitImage does not serve the Images gallery paths.
const IMAGES = 'https://icampmo.usedirect.com/MSPWeb/images/Missouri/';
const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

export function stateParkPhotos(payload: unknown, unitId: string, facilityIds: number[]): CampsitePhoto[] {
  const detail = object(payload);
  const unit = object(detail?.Unit);
  if (!unit || String(unit.UnitId) !== unitId || !facilityIds.includes(Number(unit.FacilityId)) ||
      unit.Inactive === true || unit.IsWebViewable === false || !Array.isArray(detail?.Images)) return [];
  const urls = new Set<string>();
  for (const path of detail.Images) {
    // Use only gallery paths actually returned for this unit. No synthesized
    // filenames, map icons, park photos, external URLs or traversal segments.
    if (typeof path !== 'string' || path.split('/').includes('..') ||
        !/^ParkImages\/Units\/(?:[\w-]+\/)*[\w.-]+\.(?:jpe?g|png|webp)$/i.test(path)) continue;
    urls.add(new URL(path, IMAGES).href);
    if (urls.size === 8) break;
  }
  return [...urls].map((url) => ({ url, title: null, credit: null, source: 'Missouri State Parks' }));
}

/** One visible site at a time; cached independently from its availability. */
export async function fetchStateParkPhotos(
  placeId: string, unitId: string, request: typeof fetch = fetch, now = new Date(),
): Promise<CampsitePhoto[]> {
  if (!/^\d+$/.test(placeId) || !/^\d+$/.test(unitId)) throw new Error('Invalid State Parks ID');
  const date = now.toISOString().slice(0, 10);
  const placeResponse = await request(`${API}/search/place`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ PlaceId: Number(placeId), StartDate: date, Nights: 1,
      IsADA: false, MinVehicleLength: 0, UnitCategoryId: 0, UnitTypesGroupIds: [],
      SleepingUnitId: 0, WebOnly: true, InSeasonOnly: false, RestrictADA: false }),
    signal: AbortSignal.timeout(8000), next: { revalidate: 86400 },
  });
  if (!placeResponse.ok) throw new Error('State Parks place unavailable');
  const place: unknown = await placeResponse.json();
  const selected = object(object(place)?.SelectedPlace);
  if (String(selected?.PlaceId) !== placeId || !object(selected?.Facilities)) throw new Error('Invalid State Parks place');
  const facilityIds = campgroundLoops(place as Parameters<typeof campgroundLoops>[0]).map((loop) => loop.FacilityId!);
  if (!facilityIds.length) return [];
  const response = await request(`${API}/search/details/${unitId}/startdate/${date}/nights/1/0/0`, {
    signal: AbortSignal.timeout(8000), next: { revalidate: 86400 },
  });
  if (!response.ok) throw new Error('State Parks photos unavailable');
  const detail: unknown = await response.json();
  if (!object(object(detail)?.Unit)) throw new Error('Invalid State Parks unit');
  return stateParkPhotos(detail, unitId, facilityIds);
}
