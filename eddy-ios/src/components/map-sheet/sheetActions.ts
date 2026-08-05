// eddy-ios/src/components/map-sheet/sheetActions.ts
// The rules about what a pin lets you DO, in one place because two of them are
// safety rules and a second copy of a safety rule is a second answer.

import { Alert, Linking } from 'react-native';
import type { MapAccessPoint } from '@eddy/types';
import type { MapPin } from '@/map/RiverMap';
import type { LayerKey } from '@/map/layers';
import { driveToUrl } from '@/lib/directions';

/**
 * Layers whose pins are somewhere you get in a car and go.
 *
 * THE EXCLUSIONS ARE THE POINT. A hazard is emphatically not a destination — a
 * Directions button under a strainer is an invitation — and a gauge is a sensor
 * on a bridge rail, not a place.
 */
export const DRIVEABLE_LAYERS = new Set<LayerKey>(['access', 'campgrounds', 'outfitters']);

export function isDriveable(pin: MapPin): boolean {
  return DRIVEABLE_LAYERS.has(pin.layer);
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
