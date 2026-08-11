// eddy-ios/src/components/map-sheet/sheetActions.ts
// The rules about what a pin lets you DO, in one place because two of them are
// safety rules and a second copy of a safety rule is a second answer.

import { Alert, Linking } from 'react-native';
import type { MapAccessPoint } from '@eddy/types';
import type { MapPin } from '@/map/RiverMap';
import type { LayerKey } from '@/map/layers';
import { accessRoleForLayer } from '@/map/accessLayers';
import { driveToUrl } from '@/lib/directions';

/**
 * Layers OUTSIDE the access family whose pins are somewhere you drive to.
 *
 * THE EXCLUSIONS ARE THE POINT. A hazard is emphatically not a destination — a
 * Directions button under a strainer is an invitation — and a gauge is a sensor
 * on a bridge rail, not a place.
 *
 * The access family is not listed here. "Access, campgrounds, outfitters" was a
 * list of the marks that existed when it was written, so a fourth access mark
 * silently dropped Directions from the pins wearing it — a place you can put a
 * boat in is a place you drive to whichever icon it happens to be showing, and
 * that is a question about the PLACE. `isDriveable` asks it that way now.
 */
export const DRIVEABLE_SERVICE_LAYERS = new Set<LayerKey>(['outfitters']);

export function isDriveable(pin: MapPin): boolean {
  return accessRoleForLayer(pin.layer) !== null || DRIVEABLE_SERVICE_LAYERS.has(pin.layer);
}

/** Coordinates, never the name: see src/lib/directions.ts. */
export function openDirections(pin: MapPin): void {
  void Linking.openURL(driveToUrl({ name: pin.name, coordinates: pin.coordinates }));
}

/**
 * Hand a point to the planner, stopping first if it is private.
 *
 * A put-in marked private may need permission, a fee, or both, and the map
 * cannot tell which. Confirming before it becomes a leg of somebody's float is
 * the whole point — do not soften this, and do not let a second copy of it
 * drift. `proceed` runs only when the user has said so or the point is public.
 */
export function confirmPlanAction({
  accessPoint,
  detailRoute,
  proceed,
  onOpenDetail,
}: {
  accessPoint: MapAccessPoint | null;
  detailRoute: string | null | undefined;
  proceed: () => void;
  onOpenDetail: (route: string) => void;
}): void {
  if (!accessPoint || accessPoint.isPublic) {
    proceed();
    return;
  }

  const message = accessPoint.feeRequired
    ? 'This location is marked private and may require both permission and a fee. Review its access details before relying on it.'
    : 'This location is marked private and may require permission. Review its access details before relying on it.';

  if (detailRoute) {
    Alert.alert('Private access', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Review details', onPress: () => onOpenDetail(detailRoute) },
      { text: 'Use anyway', onPress: proceed },
    ]);
    return;
  }

  Alert.alert('Private access', message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Use anyway', onPress: proceed },
  ]);
}
