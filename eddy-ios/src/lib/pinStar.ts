// eddy-ios/src/lib/pinStar.ts
// What starring a tapped map pin stars, for the kinds the star store holds.
//
// Saved PLACES (access points, campgrounds, outfitters, lodging) are a
// different store — see savedPlaces.ts and PinSheet's usePlaceFavorite — and
// win over this where a pin is one. This answers for the instruments: a rated
// gauge, a national-tier gauge, and a dam. Each is stored exactly as its own
// detail screen stores it, so a star made on the map and one made on the
// screen are the same star and the Favorites list renders either.
//
// Pure and import-free, so the web suite can run it — which is also why the
// kind is spelled here rather than imported from @eddy/sync's StarKind, whose
// two members it is.

export interface PinStarItem {
  kind: 'gauge' | 'dam';
  entityId: string;
  name: string;
  slug: string;
  usgsSiteId?: string | null;
  provider?: string | null;
}

/**
 * The prefix on a gauge decoded from the national index, which carries no
 * gauge_stations id: a star stored under one would be stored under nothing.
 * Restated from @eddy/types' GAUGE_INDEX_ID_PREFIX so this stays dependency-free.
 */
const GAUGE_INDEX_ID_PREFIX = 'idx:';

export function pinStarItem(
  pin: { layer: string; name: string; damId?: string | null; riverSlug?: string | null } | null,
  /** The curated gauge behind a `gauges` pin. */
  gauge: {
    id: string;
    name: string;
    usgsSiteId: string | null;
    provider?: string;
    thresholds?: { isPrimary: boolean; riverSlug: string | null }[] | null;
  } | null,
  /** The national-tier gauge behind an `allGauges` pin. */
  referenceGauge: { id: string; name: string; siteId: string } | null,
): PinStarItem | null {
  if (!pin) return null;
  if (pin.layer === 'gauges' && gauge) {
    return {
      kind: 'gauge',
      entityId: gauge.id,
      name: gauge.name,
      // The river it is PRIMARY for, which is where a starred gauge taps
      // through to. Empty when it rates none.
      slug: gauge.thresholds?.find((link) => link.isPrimary)?.riverSlug ?? '',
      usgsSiteId: gauge.usgsSiteId,
      provider: gauge.provider,
    };
  }
  // The gauge screen already stars these; the map now can too. It rates no
  // river, so the slug is an honest empty, and the provider is unknown on this
  // payload, which a star records as unknown rather than guessing USGS.
  if (pin.layer === 'allGauges' && referenceGauge && !referenceGauge.id.startsWith(GAUGE_INDEX_ID_PREFIX)) {
    return {
      kind: 'gauge',
      entityId: referenceGauge.id,
      name: referenceGauge.name,
      slug: '',
      usgsSiteId: referenceGauge.siteId,
      provider: null,
    };
  }
  if (pin.layer === 'dams' && pin.damId) {
    // As the dam screen stores it: the TAILWATER river as context, never a
    // route — a dam opens its own screen off entityId.
    return { kind: 'dam', entityId: pin.damId, name: pin.name, slug: pin.riverSlug ?? '' };
  }
  return null;
}

/** The two PinSheet props, from the item and the star store. */
export function pinStarProps(
  item: PinStarItem | null,
  isStarred: (kind: PinStarItem['kind'], entityId: string) => boolean,
  toggleStar: (item: PinStarItem) => void,
): { starred: boolean; onToggleStar: (() => void) | null } {
  if (!item) return { starred: false, onToggleStar: null };
  return { starred: isStarred(item.kind, item.entityId), onToggleStar: () => toggleStar(item) };
}
