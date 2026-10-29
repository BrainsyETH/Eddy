import { accessPointTypes, type MapAccessPoint, type RiverService } from '@eddy/types';
import { samePlaceIndex, SERVICE_OWNER_LAYER } from './accessLayers';
import { serviceOnLayer } from './serviceLayers';

export function pointNeedsReveal(
  point: readonly number[], size: { width: number; height: number },
  padding: { paddingTop: number; paddingBottom: number; paddingLeft: number; paddingRight: number },
): boolean {
  const [x, y] = point;
  const gap = 22; // Keep the entire touch target above the sheet and below chrome.
  return !Number.isFinite(x) || !Number.isFinite(y) ||
    x < padding.paddingLeft + gap || x > size.width - padding.paddingRight - gap ||
    y < padding.paddingTop + gap || y > size.height - padding.paddingBottom - gap;
}

export function gestureStarted(previous: boolean, active: boolean): boolean {
  return active && !previous;
}

/**
 * The layer an access point opens on when no icon was tapped — a search
 * result, a deep link, a pending selection rebuilt after its river lands.
 *
 * The same type-based fallback RiverMap's route endpoints use, restated here
 * because RiverMap imports Mapbox and the web suite cannot load it. Without it
 * a searched campground opened as a generic `access` pin, which lands its
 * sheet on Overview where a tap on the tent lands on Camping.
 */
export function accessPinLayer(point: MapAccessPoint): 'campgrounds' | 'boatRamps' | 'access' {
  const types = accessPointTypes(point);
  return types.includes('campground') ? 'campgrounds'
    : types.includes('boat_ramp') ? 'boatRamps' : 'access';
}

/**
 * The access point that absorbs a directory service on the map, or null when
 * the service draws as its own pin.
 *
 * The resolver's own rule (resolveAccessMarkers, pass 2): an explicit link is
 * the last word, and only a camping row falls back to the same-place radius.
 * A searched service that the map draws as an access point has to open as that
 * access point — a `service:` pin is one the map never drew, so nothing on
 * screen was selected and the sheet was about a record the map had folded away.
 */
export function absorbingAccessEntry<E extends { point: MapAccessPoint }>(
  service: RiverService,
  entries: readonly E[],
): E | null {
  if (service.accessPointId != null) {
    return entries.find((entry) => entry.point.id === service.accessPointId) ?? null;
  }
  if (!serviceOnLayer(service, SERVICE_OWNER_LAYER.campground)) return null;
  const index = samePlaceIndex(service, entries.map((entry) => entry.point));
  return index >= 0 ? entries[index] : null;
}

/**
 * Whether a device position is near enough the network to open the map on.
 *
 * Padded by a fifth of the network's span on each side, so somebody in
 * Springfield or across the state line still opens near the rivers — but a
 * phone in Denver opens on the network, not on a regional view of Colorado
 * with no river Eddy covers anywhere in it.
 */
export function locationNearNetwork(
  coords: { lng: number; lat: number },
  bounds: readonly [number, number, number, number] | null,
  fraction = 0.2,
): boolean {
  if (!bounds) return false;
  const [west, south, east, north] = bounds;
  const padLng = (east - west) * fraction;
  const padLat = (north - south) * fraction;
  return coords.lng >= west - padLng && coords.lng <= east + padLng &&
    coords.lat >= south - padLat && coords.lat <= north + padLat;
}

/**
 * Whether every switched-on layer is drawing nothing because of the camera.
 *
 * True only when at least one layer is on and none of them can draw at this
 * zoom: a floor-gated pin row draws nothing below the ladder's floor, public
 * land has a higher floor still, and radar draws down to its own lower one.
 * A null zoom — the camera has not reported yet — is never below anything,
 * so the hint cannot flash at launch.
 *
 * Rungs are passed in rather than imported: layers.ts reaches the app's alias
 * imports and the web suite cannot load it.
 */
export function layersBelowFloor(
  active: readonly string[],
  zoom: number | null,
  floorGated: ReadonlySet<string>,
  rungs: { floor: number; publicLand: number; radar: number },
): boolean {
  if (zoom === null || zoom >= rungs.floor || active.length === 0) return false;
  return active.every((key) =>
    key === 'weatherRadar' ? zoom < rungs.radar
      : key === 'publicLand' ? zoom < rungs.publicLand
        : floorGated.has(key));
}
