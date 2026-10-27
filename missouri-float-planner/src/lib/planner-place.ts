import { ACCESS_POINT_TYPE_ORDER } from '@/constants';

// Same precedence as iOS map-sheet/placeSymbol: specific types before access;
// a park without dedicated artwork keeps the generic place mark.
const SYMBOLS = {
  boat_ramp: 'boatRamp', campground: 'campground', bridge: 'bridge', gravel_bar: 'gravelBar',
} as const;

export function plannerPlaceSymbol(point: { types?: readonly string[]; type?: string } | undefined) {
  const types = point?.types?.length ? point.types : point ? [point.type] : [];
  for (const type of ACCESS_POINT_TYPE_ORDER.filter(type => types.includes(type))) {
    if (type in SYMBOLS) return SYMBOLS[type as keyof typeof SYMBOLS];
  }
  return 'accessPoint' as const;
}

/** A spring is a place, not a gauge; don't borrow measurement artwork. */
export function plannerPoiSymbol(type: string) {
  return type === 'float_camp' ? 'campground' : type === 'outfitter' ? 'outfitter' : 'accessPoint';
}
