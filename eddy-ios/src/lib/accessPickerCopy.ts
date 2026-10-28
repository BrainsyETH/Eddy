// Words for the put-in / take-out picker rows. Pure, so the web suite tests it.
import { ACCESS_POINT_TYPE_ORDER, accessTypeLabel, type MapAccessPoint } from '@eddy/types';

/** River distances to a tenth, without claiming a zero that is really a few yards. */
export function formatRiverMiles(miles: number): string {
  return miles < 0.1 ? '<0.1' : miles.toFixed(1);
}

/**
 * What kind of place this is, in shared display order. The generic `access`
 * type is dropped: under "Public" it only repeats that the place is an access.
 */
export function accessKindLabels(point: Pick<MapAccessPoint, 'type' | 'types'>): string[] {
  const types = new Set(point.types?.length ? point.types : [point.type]);
  types.delete('access');
  const order = ACCESS_POINT_TYPE_ORDER as string[];
  return [...types]
    .sort((a, b) => (order.indexOf(a) + 1 || order.length + 1) - (order.indexOf(b) + 1 || order.length + 1))
    .map(accessTypeLabel)
    .map((label) => label.charAt(0).toUpperCase() + label.slice(1));
}

/**
 * The stretch between two timeline rows. The first row never gets one: from
 * a put-in it would repeat the row's own distance, and with no put-in there
 * is nothing above it to measure from.
 */
export function timelineGapLabel(point: MapAccessPoint, previous: MapAccessPoint | undefined, index: number): string | null {
  if (index === 0 || !previous) return null;
  const gap = point.riverMile - previous.riverMile;
  return gap === 0 ? 'Same river mile as previous access' : `${formatRiverMiles(gap)} mi from previous access`;
}
