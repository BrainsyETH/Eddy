import { accessPointTypes, accessTypeLabel, type MapAccessPoint } from '@eddy/types';

/**
 * One quiet type cue for an access label.
 *
 * A point may be six things at once, so six pin silhouettes would turn the map
 * into a legend test. This picks the most decision-useful non-generic role and
 * writes it into the close-zoom label instead: “Campground · Cedar Grove”. The
 * callout still lists every role after selection.
 */
function accessLabel(point: MapAccessPoint): string {
  const cueOrder = ['campground', 'boat_ramp', 'gravel_bar', 'bridge', 'park'];
  const types = accessPointTypes(point);
  const cue = cueOrder.find((type) => types.includes(type));
  return cue ? `${accessTypeLabel(cue)} · ${point.name}` : point.name;
}

/**
 * The canonical presentation object for an access point.
 *
 * Exported because a search result needs to open the exact callout RiverMap
 * would create after the river-scoped access response arrives. Keeping this in
 * one builder prevents search and tap selection from drifting apart.
 */
// Keep the return structural: importing Mapbox's types pulls React Native
// globals into the web test compiler. RiverMap checks this against MapPin.
export function mapAccessPointPin<Layer extends string = 'access'>(
  point: MapAccessPoint,
  riverSlug: string | null,
  /**
   * WHICH ICON THE FINGER LANDED ON, when the caller knows.
   *
   * Defaults to the generic access layer, which is right for a search result or
   * a row in a list — neither came from an icon. It is NOT right for a
   * re-selection: the campgrounds and access layers draw the same access point
   * under different marks, and `layer` is the only record of which one was
   * tapped. Rebuilding a tapped tent as an `access` pin silently changes the
   * sheet's mark (placeSymbol), the tab it opens on (initialTabKey) and the fact
   * its glance reserves room for (decisionSlot) — all three read this field.
   */
  layer: Layer | 'access' = 'access',
) {
  return {
    id: `access:${point.id}`,
    riverSlug,
    name: point.name,
    label: accessLabel(point),
    layer,
    subtitle: `Mile ${point.riverMile.toFixed(1)}`,
    coordinates: point.coordinates,
    privateAccess: !point.isPublic,
    imageUrl: point.imageUrls?.[0] ?? null,
    detailRoute:
      riverSlug && point.slug ? `/river/${riverSlug}/access/${point.slug}` : null,
  };
}
